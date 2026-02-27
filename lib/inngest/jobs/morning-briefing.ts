/**
 * Inngest Job — Morning Briefing
 *
 * Runs daily at 1 PM UTC (7 AM CT). Gathers business data from all connectors
 * and generates a concise daily briefing via Claude Haiku, optionally sent to Slack.
 */

import { inngest } from "../client";
import { gatherBriefingData, generateBriefing, sendToSlack } from "@/lib/ai/agents/morning-briefing";
import { createAuditLog } from "@/lib/db/repositories/audit";

export const morningBriefing = inngest.createFunction(
  {
    id: "morning-briefing",
    name: "Morning Briefing",
    retries: 1,
  },
  { cron: "0 13 * * 1-5" }, // 1 PM UTC = 7 AM CT, weekdays only
  async ({ step }) => {
    // Step 1: Gather data
    const data = await step.run("gather-data", async () => {
      return gatherBriefingData();
    });

    // Step 2: Generate briefing
    const briefing = await step.run("generate-briefing", async () => {
      return generateBriefing(data);
    });

    // Step 3: Send to Slack
    const slackSent = await step.run("send-slack", async () => {
      return sendToSlack(briefing);
    });

    // Step 4: Audit log
    await step.run("audit-log", async () => {
      await createAuditLog({
        actorId: "system",
        actorType: "system",
        action: "create",
        entityType: "morning_briefing",
        entityId: `briefing-${new Date().toISOString().split("T")[0]}`,
        metadata: {
          slackSent,
          mrr: data.mrr,
          unresolvedAlerts: data.unresolvedAlerts,
          atRiskRocks: data.atRiskRocks,
        },
      });
    });

    return { success: true, briefing, slackSent };
  }
);
