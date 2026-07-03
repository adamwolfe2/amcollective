/**
 * Inngest Job — Collections Agent (2026-07 CRM refresh)
 *
 * Runs weekdays at 3 PM UTC (10 AM CT). Watches every tracker row with
 * outstanding balance (total_value - collected > 0) and pay_status in
 * {overdue, pending}. Drafts a dunning follow-up escalating by aging bucket
 * (0-15 / 16-30 / 31-60 / 60+ days since last step) into email_drafts for
 * one-click send, and pushes the full AR queue to Slack. Zero login.
 *
 * Distinct from `dunning-sequence` (Stripe payment_failed events) — this one
 * chases invoiced/manual AR tracked on the portfolio grid.
 *
 * Spec: .claude/specs/2026-07-02-crm-refresh.md §3.2
 */

import { inngest } from "../client";
import { captureError } from "@/lib/errors";
import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { and, eq, inArray } from "drizzle-orm";
import { notifySlack } from "@/lib/webhooks/slack";
import { getTrackedAnthropicClient } from "@/lib/ai/tracked-client";
import { MODEL_HAIKU } from "@/lib/ai/client";

const DRAFT_CEILING = 6;

type AgingBucket = "0-15" | "16-30" | "31-60" | "60+";

function agingBucket(days: number | null): AgingBucket {
  if (days === null || days <= 15) return "0-15";
  if (days <= 30) return "16-30";
  if (days <= 60) return "31-60";
  return "60+";
}

const TONE: Record<AgingBucket, string> = {
  "0-15": "friendly nudge — assume good faith, just surfacing the open balance",
  "16-30": "professional reminder — reference the outstanding amount directly and ask for a payment date",
  "31-60": "firm — note the invoice is significantly past due, ask for payment this week, offer to hop on a call to resolve any blocker",
  "60+": "final-notice energy while staying professional — state the amount, the age, and that you need either payment or a concrete plan by a specific date",
};

export const collectionsDunning = inngest.createFunction(
  {
    id: "collections-dunning",
    name: "Collections Agent (AR dunning)",
    retries: 1,
    onFailure: async ({ error }) => {
      captureError(error, {
        tags: { source: "inngest", job: "collections-dunning" },
        level: "error",
      });
    },
  },
  { cron: "0 15 * * 1-5" }, // 3 PM UTC = 10 AM CT, weekdays
  async ({ step }) => {
    const rows = await step.run("load-ar-rows", async () => {
      return db
        .select({
          id: schema.leads.id,
          contactName: schema.leads.contactName,
          companyName: schema.leads.companyName,
          email: schema.leads.email,
          correctEmail: schema.leads.correctEmail,
          payStatus: schema.leads.payStatus,
          priority: schema.leads.priority,
          assignedTo: schema.leads.assignedTo,
          totalValue: schema.leads.totalValue,
          collected: schema.leads.collected,
          notes: schema.leads.notes,
          nextStep: schema.leads.nextStep,
          lastStepDate: schema.leads.lastStepDate,
          dataConfidence: schema.leads.dataConfidence,
        })
        .from(schema.leads)
        .where(
          and(
            eq(schema.leads.isArchived, false),
            inArray(schema.leads.payStatus, ["overdue", "pending"])
          )
        );
    });

    const queue = rows
      .map((r) => ({
        ...r,
        remaining: Math.max((r.totalValue ?? 0) - (r.collected ?? 0), 0),
        agingDays: r.lastStepDate
          ? Math.floor(
              (Date.now() - new Date(r.lastStepDate).getTime()) / 86_400_000
            )
          : null,
      }))
      .filter((r) => r.remaining > 0)
      .sort((a, b) => b.remaining - a.remaining);

    if (queue.length === 0) {
      return { arRows: 0, draftsCreated: 0 };
    }

    const totalAr = queue.reduce((sum, r) => sum + r.remaining, 0);

    // Draft dunning emails for overdue rows first, then pending, capped
    const draftable = [...queue]
      .sort((a, b) =>
        a.payStatus === b.payStatus ? 0 : a.payStatus === "overdue" ? -1 : 1
      )
      .filter((r) => r.correctEmail || r.email)
      .slice(0, DRAFT_CEILING);

    let draftsCreated = 0;
    for (const row of draftable) {
      const created = await step.run(`dun-${row.id}`, async () => {
        const to = row.correctEmail ?? row.email ?? "";
        const already = await db
          .select({ id: schema.emailDrafts.id })
          .from(schema.emailDrafts)
          .where(
            and(
              eq(schema.emailDrafts.status, "ready"),
              eq(schema.emailDrafts.generatedBy, "collections-dunning"),
              eq(schema.emailDrafts.to, to)
            )
          )
          .limit(1);
        if (already.length > 0) return false;

        const anthropic = getTrackedAnthropicClient({ agent: "collections-dunning" });
        if (!anthropic) return false;

        const bucket = agingBucket(row.agingDays);
        const amount = `$${(row.remaining / 100).toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
        const provisional = row.dataConfidence !== "verified";

        const prompt = `Write a payment follow-up email from Adam Wolfe (AM Collective) to ${row.contactName}${row.companyName ? ` at ${row.companyName}` : ""}.

Facts (internal — weave in naturally, do not list):
- Outstanding balance: ${amount}${provisional ? " (our records — invite them to flag any discrepancy)" : ""}
- Aging bucket: ${bucket} days. Tone: ${TONE[bucket]}
- Relationship notes: ${(row.notes ?? "").slice(0, 600)}

Rules: 3-6 sentences, plain text, professional, relationship-preserving (these are ongoing clients), ONE clear ask (payment or a payment date). No emojis. Return JSON only: {"subject": "...", "body": "..."}`;

        const msg = await anthropic.messages.create({
          model: MODEL_HAIKU,
          max_tokens: 500,
          messages: [{ role: "user", content: prompt }],
        });

        const text = msg.content[0]?.type === "text" ? msg.content[0].text : "";
        let parsed: { subject?: string; body?: string } = {};
        try {
          parsed = JSON.parse(text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1));
        } catch {
          return false;
        }
        if (!parsed.subject || !parsed.body) return false;

        await db.insert(schema.emailDrafts).values({
          to,
          subject: parsed.subject,
          body: parsed.body.replace(/\n/g, "<br/>"),
          plainText: parsed.body,
          status: "ready",
          generatedBy: "collections-dunning",
          context: `Collections: ${amount} outstanding, aging ${bucket}d, pay_status=${row.payStatus}. data_confidence=${row.dataConfidence} — verify against Mercury before sending if provisional.`,
          metadata: { leadId: row.id, remainingCents: row.remaining, bucket },
        });
        return true;
      });
      if (created) draftsCreated++;
    }

    await step.run("post-slack-ar-queue", async () => {
      const lines = queue.slice(0, 10).map((r) => {
        const amount = `$${(r.remaining / 100).toLocaleString()}`;
        const status = r.payStatus === "overdue" ? "OVERDUE" : "pending";
        const conf = r.dataConfidence !== "verified" ? " · unverified" : "";
        return `• ${r.companyName ?? r.contactName} — ${amount} (${status}, ${agingBucket(r.agingDays)}d)${conf}`;
      });

      await notifySlack(
        `*Collections queue: $${(totalAr / 100).toLocaleString()} outstanding across ${queue.length} account(s).* ${draftsCreated} dunning draft(s) ready.\n${lines.join("\n")}\n\n<https://amcollective.vercel.app/email|Review drafts →>`
      );
    });

    return { arRows: queue.length, totalArCents: totalAr, draftsCreated };
  }
);
