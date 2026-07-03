/**
 * Inngest Job — Follow-Up Rot Agent (2026-07 CRM refresh)
 *
 * Runs weekdays at 2 PM UTC (9 AM CT). The fix for "we take forever to
 * follow up and miss deals":
 *
 * 1. Every tracker row carries a stage-based staleness threshold
 *    (Active 7d · Prospect 10d · Proposal 5d · Nurture 21d).
 * 2. Rows past threshold (or past nextFollowUpAt) are "rotting".
 * 3. The top rotting rows get a context-aware AI follow-up draft pushed to
 *    email_drafts (status=ready, one-click send from /email).
 * 4. A consolidated Slack push lists everything — zero login required.
 *
 * Spec: .claude/specs/2026-07-02-crm-refresh.md §3.3
 */

import { inngest } from "../client";
import { captureError } from "@/lib/errors";
import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { and, eq, not, inArray } from "drizzle-orm";
import { notifySlack } from "@/lib/webhooks/slack";
import { getTrackedAnthropicClient } from "@/lib/ai/tracked-client";
import { MODEL_HAIKU } from "@/lib/ai/client";

/** Days-since-last-step beyond which a row is rotting, by stage. */
const STALENESS_DAYS: Record<string, number> = {
  active: 7,
  prospect: 10,
  proposal: 5,
  nurture: 21,
  // Legacy funnel stages — treat like prospects
  awareness: 10,
  interest: 10,
  consideration: 10,
  intent: 7,
};

/** Max AI drafts per run — cost + review-queue sanity. */
const DRAFT_CEILING = 5;

const PRIORITY_ORDER: Record<string, number> = { P0: 0, P1: 1, P2: 2 };

type TrackerRow = {
  id: string;
  contactName: string;
  companyName: string | null;
  email: string | null;
  correctEmail: string | null;
  stage: string;
  priority: string | null;
  assignedTo: string | null;
  nextStep: string | null;
  notes: string | null;
  totalValue: number | null;
  collected: number | null;
  mrr: number | null;
  lastStepDate: string | null;
  lastContactedAt: Date | null;
  nextFollowUpAt: Date | null;
  updatedAt: Date;
  tags: string[] | null;
};

function daysSince(d: Date | null): number | null {
  if (!d) return null;
  return Math.floor((Date.now() - d.getTime()) / 86_400_000);
}

function lastTouch(row: TrackerRow): Date | null {
  if (row.lastStepDate) return new Date(row.lastStepDate);
  return row.lastContactedAt ?? row.updatedAt ?? null;
}

function isRotting(row: TrackerRow): boolean {
  if (Array.isArray(row.tags) && (row.tags.includes("backlog") || row.tags.includes("internal"))) {
    return false;
  }
  const now = new Date();
  if (row.nextFollowUpAt && row.nextFollowUpAt < now) return true;
  const threshold = STALENESS_DAYS[row.stage];
  if (!threshold) return false;
  const days = daysSince(lastTouch(row));
  return days !== null && days > threshold;
}

function remainingOf(row: TrackerRow): number {
  return Math.max((row.totalValue ?? 0) - (row.collected ?? 0), 0);
}

export const leadFollowupReminder = inngest.createFunction(
  {
    id: "lead-followup-reminder",
    name: "Follow-Up Rot Agent",
    retries: 1,
    onFailure: async ({ error }) => {
      captureError(error, {
        tags: { source: "inngest", job: "lead-followup-reminder" },
        level: "error",
      });
    },
  },
  { cron: "0 14 * * 1-5" }, // 2 PM UTC = 9 AM CT, weekdays
  async ({ step }) => {
    const rows = (await step.run("load-tracker-rows", async () => {
      return db
        .select({
          id: schema.leads.id,
          contactName: schema.leads.contactName,
          companyName: schema.leads.companyName,
          email: schema.leads.email,
          correctEmail: schema.leads.correctEmail,
          stage: schema.leads.stage,
          priority: schema.leads.priority,
          assignedTo: schema.leads.assignedTo,
          nextStep: schema.leads.nextStep,
          notes: schema.leads.notes,
          totalValue: schema.leads.totalValue,
          collected: schema.leads.collected,
          mrr: schema.leads.mrr,
          lastStepDate: schema.leads.lastStepDate,
          lastContactedAt: schema.leads.lastContactedAt,
          nextFollowUpAt: schema.leads.nextFollowUpAt,
          updatedAt: schema.leads.updatedAt,
          tags: schema.leads.tags,
        })
        .from(schema.leads)
        .where(
          and(
            eq(schema.leads.isArchived, false),
            not(inArray(schema.leads.stage, ["closed_won", "closed_lost"]))
          )
        );
    })) as unknown as TrackerRow[];

    const rotting = rows
      .filter(isRotting)
      .sort(
        (a, b) =>
          (PRIORITY_ORDER[a.priority ?? ""] ?? 3) -
            (PRIORITY_ORDER[b.priority ?? ""] ?? 3) ||
          remainingOf(b) - remainingOf(a) ||
          (b.mrr ?? 0) - (a.mrr ?? 0)
      );

    if (rotting.length === 0) {
      return { rotting: 0, draftsCreated: 0 };
    }

    // AI-draft context-aware follow-ups for the top rotting rows with an email
    const draftable = rotting
      .filter((r) => r.correctEmail || r.email)
      .slice(0, DRAFT_CEILING);

    let draftsCreated = 0;
    for (const row of draftable) {
      const created = await step.run(`draft-${row.id}`, async () => {
        // Skip if a ready followup-rot draft already exists for this recipient
        const already = await db
          .select({ id: schema.emailDrafts.id })
          .from(schema.emailDrafts)
          .where(
            and(
              eq(schema.emailDrafts.status, "ready"),
              eq(schema.emailDrafts.generatedBy, "followup-rot"),
              eq(schema.emailDrafts.to, row.correctEmail ?? row.email ?? "")
            )
          )
          .limit(1);
        if (already.length > 0) return false;

        const anthropic = getTrackedAnthropicClient({ agent: "followup-rot" });
        if (!anthropic) return false;

        const days = daysSince(lastTouch(row));
        const prompt = `Write a short follow-up email from Adam Wolfe (AM Collective) to ${row.contactName}${row.companyName ? ` at ${row.companyName}` : ""}.

Context (internal — do not quote verbatim):
- Days since last touch: ${days ?? "unknown"}
- Current stage: ${row.stage}
- The next step on file: ${row.nextStep ?? "none recorded"}
- Recent notes: ${(row.notes ?? "").slice(0, 800)}

Rules: 3-6 sentences, plain text, warm + direct, no fluff, no apology for the delay unless >21 days, end with ONE concrete ask that moves the next step forward. No emojis. Return JSON only: {"subject": "...", "body": "..."}`;

        const msg = await anthropic.messages.create({
          model: MODEL_HAIKU,
          max_tokens: 500,
          messages: [{ role: "user", content: prompt }],
        });

        const text =
          msg.content[0]?.type === "text" ? msg.content[0].text : "";
        let parsed: { subject?: string; body?: string } = {};
        try {
          parsed = JSON.parse(text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1));
        } catch {
          return false;
        }
        if (!parsed.subject || !parsed.body) return false;

        await db.insert(schema.emailDrafts).values({
          to: row.correctEmail ?? row.email ?? "",
          subject: parsed.subject,
          body: parsed.body.replace(/\n/g, "<br/>"),
          plainText: parsed.body,
          status: "ready",
          generatedBy: "followup-rot",
          context: `Follow-up rot: ${days ?? "?"}d stale (${row.stage} threshold ${STALENESS_DAYS[row.stage] ?? "?"}d). Next step on file: ${row.nextStep ?? "none"}`,
          metadata: { leadId: row.id, priority: row.priority },
        });
        return true;
      });
      if (created) draftsCreated++;
    }

    await step.run("post-slack-summary", async () => {
      const lines = rotting.slice(0, 12).map((r) => {
        const days = daysSince(lastTouch(r));
        const owner = r.assignedTo ? ` · ${r.assignedTo}` : "";
        const money =
          remainingOf(r) > 0
            ? ` · $${(remainingOf(r) / 100).toLocaleString()} owed`
            : "";
        return `• ${r.companyName ?? r.contactName} — ${days ?? "?"}d stale (${r.stage}${r.priority ? ` ${r.priority}` : ""})${money}${owner}`;
      });
      const more = rotting.length > 12 ? `\n…and ${rotting.length - 12} more` : "";

      await notifySlack(
        `*Follow-up rot: ${rotting.length} row(s) past threshold.* ${draftsCreated} draft(s) ready to send.\n${lines.join("\n")}${more}\n\n<https://amcollective.vercel.app/email|Review drafts →> · <https://amcollective.vercel.app/leads|Open tracker →>`
      );
    });

    return { rotting: rotting.length, draftsCreated };
  }
);
