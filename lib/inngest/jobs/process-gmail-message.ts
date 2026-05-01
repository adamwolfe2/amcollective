/**
 * Inngest Job — Process Gmail Message
 *
 * Triggered by `gmail/message.received` events fanned out from sync-gmail.
 * Decides whether to auto-draft a response in /email queue.
 *
 * Filtering chain (each gate must pass):
 *   1. Message exists and is inbound (cheap DB lookup)
 *   2. From a KNOWN contact (clients or leads table — by email match).
 *      This is the spam filter: newsletters/transactional emails
 *      from unknown senders never trigger LLM spend.
 *   3. Daily ceiling not hit (default 50 drafts per 24h, env override
 *      GMAIL_AUTO_DRAFT_DAILY_CEILING).
 *   4. We haven't already drafted a response for this messageId.
 *
 * If all pass:
 *   - Classify the message intent via reply-responder
 *   - For draft-worthy intents (interested/question/objection/referral),
 *     generate a draft in Adam's voice
 *   - Insert into email_drafts with status='ready' for human approval
 *
 * Cost characteristics: ~Haiku $0.001 + Sonnet $0.005 per draft. Capped
 * by daily ceiling. Filtered to known contacts only — no newsletter loop.
 */

import { inngest } from "../client";
import { captureError } from "@/lib/errors";
import { db } from "@/lib/db";
import {
  aiUsage,
  clients,
  emailDrafts,
  leads,
  messages,
} from "@/lib/db/schema";
import { and, count, eq, gte, or, sql } from "drizzle-orm";
import {
  classifyReply,
  draftReplyResponse,
  type ReplyContext,
} from "@/lib/ai/agents/reply-responder";
import { notifySlackAndWakeHermes } from "@/lib/webhooks/slack";

const DAILY_DRAFT_CEILING = Number(
  process.env.GMAIL_AUTO_DRAFT_DAILY_CEILING ?? "50"
);

/** Extract the email address from a "Name <email@host>" or "email@host" string. */
function extractEmail(from: string): string | null {
  const m = from.match(/<([^>]+)>/);
  if (m) return m[1].toLowerCase().trim();
  if (from.includes("@")) return from.toLowerCase().trim();
  return null;
}

export const processGmailMessage = inngest.createFunction(
  {
    id: "process-gmail-message",
    name: "Process Gmail Message",
    retries: 0, // built-in fallbacks in reply-responder make retries waste
    idempotency: "event.data.messageId",
    concurrency: { limit: 3 },
    onFailure: async ({ error, event }) => {
      captureError(error, {
        tags: { source: "inngest", job: "process-gmail-message" },
        extra: { eventData: event?.data ?? null },
        level: "warning",
      });
    },
  },
  { event: "gmail/message.received" },
  async ({ event, step }) => {
    const messageId = event.data?.messageId as string | undefined;
    if (!messageId) {
      return { skipped: true, reason: "missing messageId" };
    }

    // Step 1: Load the message and confirm it's inbound
    const message = await step.run("load-message", async () => {
      const rows = await db
        .select()
        .from(messages)
        .where(eq(messages.id, messageId))
        .limit(1);
      return rows[0] ?? null;
    });

    if (!message) {
      return { skipped: true, reason: "message not found", messageId };
    }
    if (message.direction !== "inbound") {
      return { skipped: true, reason: "not inbound" };
    }
    if (!message.body || message.body.trim().length === 0) {
      return { skipped: true, reason: "empty body" };
    }

    const fromEmail = extractEmail(message.from);
    if (!fromEmail) {
      return { skipped: true, reason: "no parseable sender" };
    }

    // Step 2: Known-contact filter. Either matches a client.contactEmail or
    // a lead.email — otherwise skip (spam filter).
    const knownContact = await step.run("check-known-contact", async () => {
      const lowerEmail = fromEmail.toLowerCase();
      const [clientMatch] = await db
        .select({
          id: clients.id,
          name: clients.name,
          email: clients.email,
        })
        .from(clients)
        .where(sql`LOWER(${clients.email}) = ${lowerEmail}`)
        .limit(1);
      if (clientMatch) {
        return {
          kind: "client" as const,
          id: clientMatch.id,
          name: clientMatch.name,
        };
      }
      const [leadMatch] = await db
        .select({
          id: leads.id,
          name: leads.contactName,
          company: leads.companyName,
          email: leads.email,
        })
        .from(leads)
        .where(sql`LOWER(${leads.email}) = ${lowerEmail}`)
        .limit(1);
      if (leadMatch) {
        return {
          kind: "lead" as const,
          id: leadMatch.id,
          name: leadMatch.name ?? leadMatch.company ?? "(unknown)",
        };
      }
      return null;
    });

    if (!knownContact) {
      return {
        skipped: true,
        reason: "unknown sender — not in clients or leads",
        from: fromEmail,
      };
    }

    // Step 3: Daily ceiling check
    const ceilingHit = await step.run("check-daily-ceiling", async () => {
      const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
      const rows = await db
        .select({ value: count() })
        .from(aiUsage)
        .where(
          and(
            // Both reply-responder and gmail-auto-draft use the same agent name
            // since they share the same code path. This unifies the ceiling
            // across both EmailBison and Gmail auto-drafts.
            or(
              eq(aiUsage.agentName, "reply-responder"),
              eq(aiUsage.agentName, "reply-classifier")
            )!,
            gte(aiUsage.timestamp, since)
          )
        );
      return (rows[0]?.value ?? 0) >= DAILY_DRAFT_CEILING;
    });
    if (ceilingHit) {
      return {
        skipped: true,
        reason: "daily-draft-ceiling-hit",
        ceiling: DAILY_DRAFT_CEILING,
      };
    }

    // Step 4: De-dupe — check if we already have a draft linked to this Gmail msg
    const alreadyDrafted = await step.run("check-existing-draft", async () => {
      const rows = await db
        .select({ id: emailDrafts.id })
        .from(emailDrafts)
        .where(
          sql`${emailDrafts.metadata}->>'gmailMessageId' = ${messageId}`
        )
        .limit(1);
      return rows.length > 0;
    });
    if (alreadyDrafted) {
      return { skipped: true, reason: "already drafted" };
    }

    // Step 5: Classify intent
    const classification = await step.run("classify", async () => {
      return classifyReply({
        leadEmail: fromEmail,
        leadName: knownContact.name,
        subject: message.subject,
        replyBody: message.body!,
        campaignName: null,
      });
    });

    // Skip uninteresting intents — saves Sonnet spend on auto-replies for
    // out-of-office, spam, unsubscribe, not-interested
    if (
      classification.intent === "out-of-office" ||
      classification.intent === "spam-or-bot" ||
      classification.intent === "unsubscribe" ||
      classification.intent === "not-interested"
    ) {
      return {
        skipped: true,
        reason: "intent-not-actionable",
        intent: classification.intent,
      };
    }

    // Step 6: Draft the response
    const ctx: ReplyContext = {
      externalReplyId: 0, // not an EmailBison reply — keep 0 to distinguish
      campaignName: null,
      knowledgeBase: null,
      leadEmail: fromEmail,
      leadName: knownContact.name,
      subject: message.subject,
      replyBody: message.body!,
      originalEmail: null,
    };
    const draft = await step.run("draft", async () => {
      return draftReplyResponse(ctx, classification);
    });

    // Step 7: Insert into email_drafts as 'ready' for human approval.
    // Note: we DO NOT set replyExternalId (that's for EmailBison threads).
    // The send path will use Resend (default) since no replyExternalId.
    const draftId = await step.run("insert-draft", async () => {
      const inserted = await db
        .insert(emailDrafts)
        .values({
          to: fromEmail,
          subject: draft.subjectLine,
          body: draft.body,
          plainText: draft.body,
          status: "ready",
          generatedBy: "gmail-auto-draft",
          context: `Auto-drafted response to inbound Gmail from ${knownContact.name} (${knownContact.kind}). Intent: ${classification.intent} (${(classification.confidence * 100).toFixed(0)}%). ${classification.summary}`,
          replyIntent: classification.intent,
          replyConfidence: Math.round(classification.confidence * 100),
          replySafeToAutoSend: draft.safeToAutoSend,
          metadata: {
            source: "gmail",
            gmailMessageId: messageId,
            gmailThreadId: message.threadId,
            contactKind: knownContact.kind,
            contactId: knownContact.id,
            classification,
            reasoning: draft.reasoning,
            warnings: draft.warnings ?? [],
          },
        })
        .returning({ id: emailDrafts.id });
      return inserted[0]?.id ?? null;
    });

    // Step 8: Wake Hermes / notify Slack
    if (draftId) {
      await step.run("notify", async () => {
        await notifySlackAndWakeHermes({
          alert: `GMAIL DRAFT READY · ${classification.intent} · ${knownContact.name} (${fromEmail}) · ${message.subject ?? "(no subject)"}`,
          actionPrompt: `Pull memory.recall(category='${knownContact.kind === "client" ? "client_context" : "venture_context"}', tags_any=['${(knownContact.name || "").toLowerCase().split(" ")[0]}']) for prior context. Summarize in 2-3 sentences: who's writing, what they want, your recommendation (approve / edit / escalate). Then memory.store(category='interaction_outcome') noting the draft was created.`,
        });
      });
    }

    return {
      success: true,
      draftId,
      intent: classification.intent,
      contact: knownContact.name,
      confidence: classification.confidence,
    };
  }
);
