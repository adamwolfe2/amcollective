/**
 * Inngest Job — Lead Follow-Up Reminders
 *
 * Runs weekdays at 2 PM UTC (9 AM CT).
 * Finds leads where nextFollowUpAt is in the past (missed) and posts a
 * consolidated Slack DM so no deal falls through the cracks.
 */

import { inngest } from "../client";
import { captureError } from "@/lib/errors";
import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { and, eq, lte, not, inArray, isNotNull } from "drizzle-orm";
import { notifySlack } from "@/lib/webhooks/slack";
import { formatDistanceToNow } from "date-fns";

const CLOSED_STAGES = ["closed_won", "closed_lost", "nurture"] as const;

export const leadFollowupReminder = inngest.createFunction(
  {
    id: "lead-followup-reminder",
    name: "Lead Follow-Up Reminders",
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
    const overdueLeads = await step.run("find-overdue-followups", async () => {
      const now = new Date();
      return db
        .select({
          id: schema.leads.id,
          contactName: schema.leads.contactName,
          companyName: schema.leads.companyName,
          stage: schema.leads.stage,
          nextFollowUpAt: schema.leads.nextFollowUpAt,
          lastContactedAt: schema.leads.lastContactedAt,
        })
        .from(schema.leads)
        .where(
          and(
            isNotNull(schema.leads.nextFollowUpAt),
            lte(schema.leads.nextFollowUpAt, now),
            eq(schema.leads.isArchived, false),
            not(inArray(schema.leads.stage, [...CLOSED_STAGES]))
          )
        )
        .limit(20);
    });

    if (overdueLeads.length === 0) {
      return { remindersSent: 0 };
    }

    await step.run("post-slack-reminder", async () => {
      const lines = overdueLeads.map((lead) => {
        const name = lead.companyName
          ? `${lead.contactName} (${lead.companyName})`
          : lead.contactName;
        const lastContact = lead.lastContactedAt
          ? `last contact ${formatDistanceToNow(lead.lastContactedAt, { addSuffix: true })}`
          : "never contacted";
        return `• ${name} — ${lastContact}`;
      });

      const count = overdueLeads.length;
      const header =
        count === 1
          ? `1 lead needs follow-up today:`
          : `${count} leads need follow-up today:`;

      await notifySlack(
        `*${header}*\n${lines.join("\n")}\n\n<https://amcollective.vercel.app/leads|Open Leads →>`
      );
    });

    return { remindersSent: overdueLeads.length };
  }
);
