/**
 * Inngest Job — EOD Wrap
 *
 * Runs weekdays at 11 PM UTC (6 PM CT). Summarizes the day:
 * tasks completed, sprint items still open, alerts created, and lead movement.
 */

import { inngest } from "../client";
import { captureError } from "@/lib/errors";
import { sendProactiveMessage } from "@/lib/ai/agents/proactive";
import { writeMemory, isMemoryConfigured } from "@/lib/ai/memory";
import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { eq, and, gte, sql } from "drizzle-orm";

export const eodWrap = inngest.createFunction(
  {
    id: "eod-wrap",
    name: "EOD Wrap",
    retries: 1,
    onFailure: async ({ error }) => {
      captureError(error, {
        tags: { source: "inngest", job: "eod-wrap" },
        level: "error",
      });
    },
  },
  { cron: "0 23 * * 1-5" }, // 11 PM UTC = 6 PM CT, weekdays
  async ({ step }) => {
    const context = await step.run("gather-data", async () => {
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);

      const [completedTasks, openTasks, alertsToday, movedLeads] = await Promise.all([
        // Tasks completed today
        db
          .select({ count: sql<number>`COUNT(*)` })
          .from(schema.tasks)
          .where(
            and(
              eq(schema.tasks.status, "done"),
              gte(schema.tasks.updatedAt, todayStart)
            )
          ),

        // Sprint tasks still open (not done, not archived)
        db
          .select({ count: sql<number>`COUNT(*)` })
          .from(schema.tasks)
          .where(
            and(
              eq(schema.tasks.isArchived, false),
              sql`${schema.tasks.status} != 'done'`
            )
          ),

        // Alerts created today — grouped by severity
        db
          .select({
            severity: schema.alerts.severity,
            count: sql<number>`COUNT(*)`,
          })
          .from(schema.alerts)
          .where(gte(schema.alerts.createdAt, todayStart))
          .groupBy(schema.alerts.severity),

        // Leads with pipeline movement today
        db
          .select({ count: sql<number>`COUNT(*)` })
          .from(schema.leads)
          .where(
            and(
              eq(schema.leads.isArchived, false),
              gte(schema.leads.updatedAt, todayStart)
            )
          ),
      ]);

      const completed = completedTasks[0]?.count ?? 0;
      const open = openTasks[0]?.count ?? 0;
      const alertSummary = alertsToday
        .map((a) => `${a.count} ${a.severity}`)
        .join(", ");
      const leads = movedLeads[0]?.count ?? 0;

      const lines = [
        `Tasks completed today: ${completed}`,
        `Sprint tasks still open: ${open}`,
        alertsToday.length > 0
          ? `Alerts created today: ${alertSummary}`
          : "No new alerts today",
        `Leads with activity today: ${leads}`,
      ];

      return lines.join("\n");
    });

    await step.run("send-dm", async () => {
      await sendProactiveMessage({ trigger: "eod", context });
    });

    // Write daily note to persistent memory (fire-and-forget)
    if (isMemoryConfigured()) {
      const dateStr = new Date().toISOString().split("T")[0];
      const notePath = `notes/${dateStr}.md`;
      const noteContent = `# ${dateStr}\n\n## Done\n${context}\n\n## Watch\n- Review open tasks and unresolved alerts tomorrow\n`;
      step.run("write-daily-note", async () => {
        await writeMemory(notePath, noteContent, `EOD note ${dateStr}`).catch(() => {});
      }).catch(() => {});
    }

    return { success: true };
  }
);
