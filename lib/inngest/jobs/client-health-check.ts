/**
 * Inngest Job — Client Health Check
 *
 * Weekly check: scores all clients and creates alerts for any below threshold.
 * Uses Claude Haiku for one-line health summaries.
 */

import { inngest } from "../client";
import { scoreAllClients } from "@/lib/ai/agents/client-health";
import { createAuditLog } from "@/lib/db/repositories/audit";

export const clientHealthCheck = inngest.createFunction(
  {
    id: "client-health-check",
    name: "Client Health Check",
    retries: 1,
  },
  { cron: "0 14 * * 1" }, // Monday 2 PM UTC = 8 AM CT
  async ({ step }) => {
    const results = await step.run("score-all-clients", async () => {
      return scoreAllClients();
    });

    await step.run("audit-log", async () => {
      const atRisk = results.filter((r) => r.score < 60);
      await createAuditLog({
        actorId: "system",
        actorType: "system",
        action: "create",
        entityType: "client_health_check",
        entityId: `health-${new Date().toISOString().split("T")[0]}`,
        metadata: {
          totalClients: results.length,
          atRiskCount: atRisk.length,
          averageScore: results.length > 0
            ? Math.round(results.reduce((sum, r) => sum + r.score, 0) / results.length)
            : 0,
        },
      });
    });

    return {
      success: true,
      totalClients: results.length,
      atRisk: results.filter((r) => r.score < 60).length,
      results,
    };
  }
);
