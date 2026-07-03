/**
 * Inngest Job — Prospecting Agent (2026-07 CRM refresh)
 *
 * Hourly. Warm replies must never get lost: every EmailBison reply marked
 * interested that has no matching tracker row auto-creates a prospect row
 * (stage=prospect, source=outbound) and pings Slack. Weekly Monday run also
 * reports net-new pipeline and nags if zero was added.
 *
 * Spec: .claude/specs/2026-07-02-crm-refresh.md §3.5
 */

import { inngest } from "../client";
import { captureError } from "@/lib/errors";
import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { and, eq, gte, ilike, sql } from "drizzle-orm";
import { notifySlack } from "@/lib/webhooks/slack";

export const prospectFromReply = inngest.createFunction(
  {
    id: "prospect-from-reply",
    name: "Prospecting Agent (warm replies → tracker)",
    retries: 1,
    onFailure: async ({ error }) => {
      captureError(error, {
        tags: { source: "inngest", job: "prospect-from-reply" },
        level: "error",
      });
    },
  },
  { cron: "30 * * * *" }, // hourly at :30 (after sync-emailbison-inbox's */15)
  async ({ step }) => {
    // Interested replies from the last 7 days
    const interested = await step.run("load-interested-replies", async () => {
      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      return db
        .select({
          id: schema.emailbisonReplies.id,
          leadEmail: schema.emailbisonReplies.leadEmail,
          leadName: schema.emailbisonReplies.leadName,
          campaignName: schema.emailbisonReplies.campaignName,
          subject: schema.emailbisonReplies.subject,
          receivedAt: schema.emailbisonReplies.receivedAt,
        })
        .from(schema.emailbisonReplies)
        .where(
          and(
            eq(schema.emailbisonReplies.isInterested, true),
            gte(schema.emailbisonReplies.receivedAt, sevenDaysAgo)
          )
        )
        .limit(100);
    });

    if (interested.length === 0) return { created: 0 };

    const createdRows: string[] = [];

    for (const reply of interested) {
      if (!reply.leadEmail) continue;
      const created = await step.run(`upsert-prospect-${reply.id}`, async () => {
        // Already tracked? Match by email (either column) case-insensitively.
        const existing = await db
          .select({ id: schema.leads.id })
          .from(schema.leads)
          .where(
            sql`(lower(${schema.leads.email}) = lower(${reply.leadEmail}) OR lower(${schema.leads.correctEmail}) = lower(${reply.leadEmail}))`
          )
          .limit(1);
        if (existing.length > 0) return false;

        // Double-guard: same-name unarchived prospect created by this job
        if (reply.leadName) {
          const byName = await db
            .select({ id: schema.leads.id })
            .from(schema.leads)
            .where(
              and(
                ilike(schema.leads.contactName, reply.leadName),
                eq(schema.leads.isArchived, false)
              )
            )
            .limit(1);
          if (byName.length > 0) return false;
        }

        await db.insert(schema.leads).values({
          companyTag: "cursive", // outbound replies flow through the Cursive engine
          contactName: reply.leadName ?? reply.leadEmail!,
          email: reply.leadEmail,
          stage: "prospect",
          source: "outbound",
          assignedTo: "Adam",
          priority: "P1",
          payStatus: null,
          dataConfidence: "provisional",
          nextStep: `Warm reply in — respond and qualify. Campaign: ${reply.campaignName ?? "unknown"}. Subject: ${reply.subject ?? ""}`,
          notes: `[prospecting-agent] Auto-created from interested EmailBison reply (${reply.receivedAt ? new Date(reply.receivedAt).toISOString() : "unknown"}). Campaign: ${reply.campaignName ?? "unknown"}.`,
          tags: ["auto:prospecting-agent"],
        });
        return true;
      });
      if (created) {
        createdRows.push(reply.leadName ?? reply.leadEmail!);
      }
    }

    if (createdRows.length > 0) {
      await step.run("post-slack-new-prospects", async () => {
        await notifySlack(
          `*Prospecting agent: ${createdRows.length} warm repl${createdRows.length === 1 ? "y" : "ies"} auto-added to the tracker:*\n${createdRows.map((n) => `• ${n}`).join("\n")}\n\n<https://amcollective.vercel.app/leads|Open tracker →>`
        );
      });
    }

    return { created: createdRows.length };
  }
);

/**
 * Weekly net-new pipeline report — Monday 3 PM UTC. Counts prospect rows
 * created in the last 7 days; nags if zero (always-be-adding).
 */
export const prospectingWeeklyReport = inngest.createFunction(
  {
    id: "prospecting-weekly-report",
    name: "Prospecting Weekly Report",
    retries: 1,
    onFailure: async ({ error }) => {
      captureError(error, {
        tags: { source: "inngest", job: "prospecting-weekly-report" },
        level: "error",
      });
    },
  },
  { cron: "0 15 * * 1" }, // Monday 3 PM UTC
  async ({ step }) => {
    const newRows = await step.run("count-net-new", async () => {
      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      return db
        .select({
          id: schema.leads.id,
          contactName: schema.leads.contactName,
          companyName: schema.leads.companyName,
          stage: schema.leads.stage,
        })
        .from(schema.leads)
        .where(
          and(
            eq(schema.leads.isArchived, false),
            gte(schema.leads.createdAt, sevenDaysAgo)
          )
        );
    });

    await step.run("post-slack-weekly", async () => {
      if (newRows.length === 0) {
        await notifySlack(
          `*Prospecting: ZERO net-new pipeline added in the last 7 days.* Always be adding — check inbox caps (ScaledMail/EmailBison) and campaign health.`
        );
        return;
      }
      await notifySlack(
        `*Prospecting: ${newRows.length} net-new tracker row(s) this week.*\n${newRows
          .slice(0, 10)
          .map((r) => `• ${r.companyName ?? r.contactName} (${r.stage})`)
          .join("\n")}`
      );
    });

    return { netNew: newRows.length };
  }
);
