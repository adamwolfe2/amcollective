/**
 * Inngest Job — Weekly Business Intelligence
 *
 * Runs Monday at 2 PM UTC (8 AM CT). Gathers all business data,
 * generates AI-powered insights via Claude Sonnet, stores results,
 * and sends summary to Slack.
 */

import { inngest } from "../client";
import { captureError } from "@/lib/errors";
import {
  gatherWeeklyData,
  generateWeeklyIntelligence,
} from "@/lib/ai/agents/weekly-intelligence";
import { createAuditLog } from "@/lib/db/repositories/audit";
import { notifyAdmins } from "@/lib/db/repositories/notifications";
import { notifySlack } from "@/lib/webhooks/slack";
import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";

function getWeekOf(): string {
  const now = new Date();
  const day = now.getDay();
  const diff = now.getDate() - day + (day === 0 ? -6 : 1); // Monday
  const monday = new Date(now.setDate(diff));
  return monday.toISOString().split("T")[0];
}

export const weeklyIntelligence = inngest.createFunction(
  {
    id: "weekly-intelligence",
    name: "Weekly Business Intelligence",
    retries: 2,
    onFailure: async ({ error }) => {
      captureError(error, {
        tags: { source: "inngest", job: "weekly-intelligence" },
        level: "error",
      });
    },
  },
  { cron: "0 14 * * 1" }, // Monday 2 PM UTC = 8 AM CT
  async ({ step }) => {
    const weekOf = getWeekOf();

    // Step 1: Gather all business data
    const data = await step.run("gather-data", async () => {
      return gatherWeeklyData();
    });

    // Step 2: Generate AI insights
    const result = await step.run("generate-insights", async () => {
      return generateWeeklyIntelligence(data);
    });

    // Step 3: Store the report
    await step.run("store-report", async () => {
      // Store the full report
      await db
        .insert(schema.weeklyReports)
        .values({
          weekOf,
          executiveSummary: result.executiveSummary,
          fullReport: result.fullReport,
          dataSnapshot: data as unknown as Record<string, unknown>,
          insightCount: result.insights.length,
        })
        .onConflictDoUpdate({
          target: schema.weeklyReports.weekOf,
          set: {
            executiveSummary: result.executiveSummary,
            fullReport: result.fullReport,
            dataSnapshot: data as unknown as Record<string, unknown>,
            insightCount: result.insights.length,
          },
        });

      // Store individual insights
      if (result.insights.length > 0) {
        await db.insert(schema.weeklyInsights).values(
          result.insights.map((insight) => ({
            weekOf,
            category: insight.category,
            title: insight.title,
            summary: insight.summary,
            priority: insight.priority,
            dataSnapshot: data as unknown as Record<string, unknown>,
          }))
        );
      }
    });

    // Step 4: Send to Slack
    await step.run("send-slack", async () => {
      const urgentInsights = result.insights.filter((i) => i.priority >= 2);
      const actionInsights = result.insights.filter((i) => i.priority === 1);

      let slackMessage = `*Weekly Business Intelligence -- Week of ${weekOf}*\n\n${result.executiveSummary}`;

      if (urgentInsights.length > 0) {
        slackMessage += "\n\n*URGENT:*";
        for (const i of urgentInsights) {
          slackMessage += `\n- ${i.title}: ${i.summary}`;
        }
      }

      if (actionInsights.length > 0) {
        slackMessage += "\n\n*Action Items:*";
        for (const i of actionInsights) {
          slackMessage += `\n- ${i.title}`;
        }
      }

      await notifySlack(slackMessage);
    });

    // Step 5: Notify admins
    await step.run("notify-admins", async () => {
      const urgentCount = result.insights.filter((i) => i.priority >= 2).length;
      await notifyAdmins({
        type: "report_ready",
        title: "Weekly intelligence report is ready",
        message: `${result.insights.length} insights generated${urgentCount > 0 ? `, ${urgentCount} urgent` : ""}. ${result.executiveSummary}`,
        link: "/intelligence",
      });
    });

    // Step 6: Audit log
    await step.run("audit-log", async () => {
      await createAuditLog({
        actorId: "system",
        actorType: "system",
        action: "weekly_intelligence.generated",
        entityType: "weekly_report",
        entityId: weekOf,
        metadata: {
          insightCount: result.insights.length,
          categories: [...new Set(result.insights.map((i) => i.category))],
        },
      });
    });

    return { success: true, weekOf, insightCount: result.insights.length };
  }
);
