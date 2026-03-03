/**
 * Inngest Job — Sprint Prep
 *
 * Runs Mondays at 2 PM UTC (9 AM CT). Kicks off the week with a quick
 * briefing on the current sprint, at-risk rocks, overdue items, and top leads.
 */

import { inngest } from "../client";
import { captureError } from "@/lib/errors";
import { sendProactiveMessage } from "@/lib/ai/agents/proactive";
import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { eq, and, notInArray, sql, gte } from "drizzle-orm";

export const sprintPrep = inngest.createFunction(
  {
    id: "sprint-prep",
    name: "Sprint Prep",
    retries: 1,
    onFailure: async ({ error }) => {
      captureError(error, {
        tags: { source: "inngest", job: "sprint-prep" },
        level: "error",
      });
    },
  },
  { cron: "0 14 * * 1" }, // 2 PM UTC = 9 AM CT, Mondays only
  async ({ step }) => {
    const context = await step.run("gather-data", async () => {
      const now = new Date();

      // Get Monday of current week
      const monday = new Date(now);
      const day = monday.getDay();
      monday.setDate(monday.getDate() - (day === 0 ? 6 : day - 1));
      monday.setHours(0, 0, 0, 0);

      const [currentSprint, atRiskRocks, overdueInvoices, topLeads] = await Promise.all([
        // Current sprint + task count by status
        db
          .select({
            id: schema.weeklySprints.id,
            title: schema.weeklySprints.title,
            weeklyFocus: schema.weeklySprints.weeklyFocus,
          })
          .from(schema.weeklySprints)
          .where(gte(schema.weeklySprints.weekOf, monday))
          .orderBy(schema.weeklySprints.weekOf)
          .limit(1),

        // Rocks at risk
        db
          .select({
            title: schema.rocks.title,
            owner: schema.rocks.ownerId,
          })
          .from(schema.rocks)
          .where(eq(schema.rocks.status, "at_risk"))
          .limit(5),

        // Overdue invoices
        db
          .select({
            count: sql<number>`COUNT(*)`,
            total: sql<number>`COALESCE(SUM(${schema.invoices.amount}), 0)`,
          })
          .from(schema.invoices)
          .where(eq(schema.invoices.status, "overdue")),

        // Top 3 leads by next follow-up or value
        db
          .select({
            contactName: schema.leads.contactName,
            companyName: schema.leads.companyName,
            stage: schema.leads.stage,
            nextFollowUpAt: schema.leads.nextFollowUpAt,
          })
          .from(schema.leads)
          .where(
            and(
              eq(schema.leads.isArchived, false),
              notInArray(schema.leads.stage, ["closed_won", "closed_lost"])
            )
          )
          .orderBy(schema.leads.nextFollowUpAt)
          .limit(3),
      ]);

      const sprint = currentSprint[0];
      const sprintLine = sprint
        ? `Current sprint: "${sprint.title}"${sprint.weeklyFocus ? ` — focus: ${sprint.weeklyFocus}` : ""}`
        : "No sprint found for this week";

      const rocksLine =
        atRiskRocks.length > 0
          ? `At-risk rocks (${atRiskRocks.length}): ${atRiskRocks.map((r) => r.title).join("; ")}`
          : "No rocks at risk";

      const invoicesLine =
        overdueInvoices[0]?.count > 0
          ? `Overdue invoices: ${overdueInvoices[0].count} totaling $${Math.round(Number(overdueInvoices[0].total) / 100).toLocaleString()}`
          : "No overdue invoices";

      const leadsLine =
        topLeads.length > 0
          ? `Top leads: ${topLeads.map((l) => `${l.contactName}${l.companyName ? ` / ${l.companyName}` : ""} (${l.stage})`).join("; ")}`
          : "No active leads";

      return [sprintLine, rocksLine, invoicesLine, leadsLine].join("\n");
    });

    await step.run("send-dm", async () => {
      await sendProactiveMessage({ trigger: "sprint-prep", context });
    });

    return { success: true };
  }
);
