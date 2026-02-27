/**
 * Inngest Job — Weekly Cost Analysis
 *
 * Runs every Monday morning. Analyzes infrastructure costs for anomalies
 * and generates recommendations via Claude Sonnet.
 */

import { inngest } from "../client";
import { captureError } from "@/lib/errors";
import { analyzeCosts } from "@/lib/ai/agents/cost-analysis";
import { createAuditLog } from "@/lib/db/repositories/audit";

export const weeklyCostAnalysis = inngest.createFunction(
  {
    id: "weekly-cost-analysis",
    name: "Weekly Cost Analysis",
    retries: 1,
    onFailure: async ({ error }) => {
      captureError(error, {
        tags: { source: "inngest", job: "weekly-cost-analysis" },
        level: "error",
      });
    },
  },
  { cron: "0 15 * * 1" }, // Monday 3 PM UTC = 9 AM CT
  async ({ step }) => {
    const result = await step.run("analyze-costs", async () => {
      return analyzeCosts();
    });

    await step.run("audit-log", async () => {
      await createAuditLog({
        actorId: "system",
        actorType: "system",
        action: "create",
        entityType: "cost_analysis",
        entityId: `costs-${new Date().toISOString().split("T")[0]}`,
        metadata: {
          anomalyCount: result.anomalies.length,
          toolCount: result.summaries.length,
        },
      });
    });

    return {
      success: true,
      anomalies: result.anomalies.length,
      summaries: result.summaries.length,
      analysis: result.analysis,
    };
  }
);
