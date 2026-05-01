/**
 * Inngest Job — Process EmailBison Reply
 *
 * Triggered by `emailbison/reply.received` events fanned out from
 * sync-emailbison-inbox when a NEW reply lands.
 *
 * Pipeline:
 *  1. Load the reply row + its campaign knowledge base
 *  2. Classify the reply (intent, sentiment, recommended action)
 *  3. If actionable → draft a response in Adam's voice
 *  4. Insert into email_drafts with status='ready' for human approval
 *  5. Fire follow-up event so Slack/email notifier can ping Adam
 *
 * The classifier and responder are model-tracked (Haiku for classify,
 * Sonnet for response) so cost is auto-logged to ai_usage.
 */

import { inngest } from "../client";
import { captureError } from "@/lib/errors";
import { db } from "@/lib/db";
import {
  aiUsage,
  emailbisonReplies,
  outreachCampaigns,
  emailDrafts,
} from "@/lib/db/schema";
import { count, eq, gte, and } from "drizzle-orm";

/** Hard ceiling on Sonnet drafts per 24h. A normal day is ~10-30 replies;
 *  this only triggers on spam waves or a stuck loop. Override via env. */
const DAILY_DRAFT_CEILING = Number(
  process.env.REPLY_RESPONDER_DAILY_CEILING ?? "100"
);
import {
  classifyReply,
  draftReplyResponse,
  type ReplyContext,
} from "@/lib/ai/agents/reply-responder";

export const processEmailbisonReply = inngest.createFunction(
  {
    id: "process-emailbison-reply",
    name: "Process EmailBison Reply",
    // retries=0: classifier + drafter both have built-in fallbacks (see
    // lib/ai/agents/reply-responder.ts) so retrying just multiplies Sonnet
    // spend without recovery benefit. Failed runs surface as Sentry warnings.
    retries: 0,
    // De-dupe within a 24h window — same reply external ID = same job
    idempotency: "event.data.externalId",
    concurrency: { limit: 5 }, // small fan-out budget — keeps Anthropic load tame
    onFailure: async ({ error, event }) => {
      captureError(error, {
        tags: { source: "inngest", job: "process-emailbison-reply" },
        extra: { eventData: event?.data ?? null },
        level: "warning",
      });
    },
  },
  { event: "emailbison/reply.received" },
  async ({ event, step }) => {
    const externalId = event.data?.externalId as number | undefined;
    if (!externalId) {
      return { skipped: true, reason: "missing externalId in event" };
    }

    // Step 1: Load the reply
    const reply = await step.run("load-reply", async () => {
      const rows = await db
        .select()
        .from(emailbisonReplies)
        .where(eq(emailbisonReplies.externalId, externalId))
        .limit(1);
      return rows[0] ?? null;
    });

    if (!reply) {
      return { skipped: true, reason: "reply not found", externalId };
    }
    if (!reply.body || reply.body.trim().length === 0) {
      return { skipped: true, reason: "empty body", externalId };
    }

    // Skip if we've already drafted a response for this reply (idempotency
    // belt-and-suspenders — Inngest's own idempotency covers most cases)
    const alreadyDrafted = await step.run("check-existing-draft", async () => {
      const rows = await db
        .select({ id: emailDrafts.id })
        .from(emailDrafts)
        .where(eq(emailDrafts.replyExternalId, externalId))
        .limit(1);
      return rows.length > 0;
    });
    if (alreadyDrafted) {
      return { skipped: true, reason: "draft already exists", externalId };
    }

    // Step 2a: Daily ceiling check — if we've drafted more than
    // DAILY_DRAFT_CEILING (default 100) reply responses in the last 24h,
    // skip drafting entirely. Protects against spam waves and stuck loops.
    const ceilingHit = await step.run("check-daily-ceiling", async () => {
      const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
      const rows = await db
        .select({ value: count() })
        .from(aiUsage)
        .where(
          and(
            eq(aiUsage.agentName, "reply-responder"),
            gte(aiUsage.timestamp, since)
          )
        );
      const used = rows[0]?.value ?? 0;
      return used >= DAILY_DRAFT_CEILING;
    });
    if (ceilingHit) {
      return {
        skipped: true,
        reason: "daily-draft-ceiling-hit",
        externalId,
        ceiling: DAILY_DRAFT_CEILING,
      };
    }

    // Step 2: Load campaign knowledge base (if linked)
    const knowledgeBase = await step.run("load-campaign-kb", async () => {
      if (!reply.campaignId) return null;
      const rows = await db
        .select({ knowledgeBase: outreachCampaigns.knowledgeBase })
        .from(outreachCampaigns)
        .where(eq(outreachCampaigns.externalId, reply.campaignId))
        .limit(1);
      return rows[0]?.knowledgeBase ?? null;
    });

    // Step 3: Classify the reply
    const classification = await step.run("classify-reply", async () => {
      return classifyReply({
        leadEmail: reply.leadEmail,
        leadName: reply.leadName,
        subject: reply.subject,
        replyBody: reply.body!,
        campaignName: reply.campaignName,
      });
    });

    // Auto-archive paths — no draft, no notification
    if (
      classification.recommendedAction === "auto-archive" ||
      classification.intent === "out-of-office" ||
      classification.intent === "spam-or-bot"
    ) {
      return {
        success: true,
        externalId,
        action: "auto-archived",
        intent: classification.intent,
        summary: classification.summary,
      };
    }

    // Unsubscribe — short-circuit, mark and skip drafting
    if (
      classification.recommendedAction === "unsubscribe" ||
      classification.intent === "unsubscribe"
    ) {
      // Future: call EmailBison to suppress this lead. For now, log only.
      return {
        success: true,
        externalId,
        action: "unsubscribe-flagged",
        intent: classification.intent,
        summary: classification.summary,
      };
    }

    // Step 4: Draft the response
    const replyCtx: ReplyContext = {
      externalReplyId: externalId,
      campaignName: reply.campaignName,
      knowledgeBase,
      leadEmail: reply.leadEmail,
      leadName: reply.leadName,
      subject: reply.subject,
      replyBody: reply.body!,
      // originalEmail: not currently tracked — could be backfilled from outreach_events
      originalEmail: null,
    };

    const draft = await step.run("draft-response", async () => {
      return draftReplyResponse(replyCtx, classification);
    });

    // Step 5: Insert into email_drafts as 'ready' — human approval gate
    const draftId = await step.run("insert-draft", async () => {
      const inserted = await db
        .insert(emailDrafts)
        .values({
          to: reply.leadEmail,
          subject: draft.subjectLine,
          body: draft.body,
          plainText: draft.body,
          status: "ready", // ready = ready for human review
          generatedBy: "reply-responder",
          context: `Auto-drafted response to EmailBison reply #${externalId}. Classifier intent: ${classification.intent} (confidence ${(classification.confidence * 100).toFixed(0)}%). ${classification.summary}`,
          replyExternalId: externalId,
          replyIntent: classification.intent,
          replyConfidence: Math.round(classification.confidence * 100),
          replySafeToAutoSend: draft.safeToAutoSend,
          metadata: {
            campaignName: reply.campaignName,
            campaignId: reply.campaignId,
            classification,
            reasoning: draft.reasoning,
            warnings: draft.warnings ?? [],
          },
        })
        .returning({ id: emailDrafts.id });
      return inserted[0]?.id ?? null;
    });

    // Step 6: Fan out a notification event so Slack/email notifier can ping Adam
    if (draftId) {
      await step.sendEvent("notify-draft-ready", {
        name: "drafts/ready-for-approval",
        data: {
          draftId,
          replyExternalId: externalId,
          intent: classification.intent,
          leadEmail: reply.leadEmail,
          campaignName: reply.campaignName,
          safeToAutoSend: draft.safeToAutoSend,
        },
      });
    }

    return {
      success: true,
      externalId,
      draftId,
      intent: classification.intent,
      confidence: classification.confidence,
      safeToAutoSend: draft.safeToAutoSend,
    };
  }
);
