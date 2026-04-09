/**
 * Inngest Job — Morning Briefing
 *
 * Runs daily at 1 PM UTC (7 AM CT). Gathers business data from all connectors
 * and generates a concise daily briefing via Claude Haiku, sent as a proactive DM.
 *
 * Phase 2: RAG retrieval + MRR delta + daily metrics snapshot.
 */

import { inngest } from "../client";
import { captureError } from "@/lib/errors";
import { gatherBriefingData, generateBriefing, getRagContext, storeDailySnapshot } from "@/lib/ai/agents/morning-briefing";
import { detectAnomalies, formatAnomalyContext } from "@/lib/ai/agents/anomaly-detection";
import { sendProactiveMessage } from "@/lib/ai/agents/proactive";
import { buildProactiveContext } from "@/lib/ai/context";
import { createAuditLog } from "@/lib/db/repositories/audit";
import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";

export const morningBriefing = inngest.createFunction(
  {
    id: "morning-briefing",
    name: "Morning Briefing",
    retries: 1,
    onFailure: async ({ error }) => {
      captureError(error, {
        tags: { source: "inngest", job: "morning-briefing" },
        level: "error",
      });
    },
  },
  { cron: "0 13 * * 1-5" }, // 1 PM UTC = 7 AM CT, weekdays only
  async ({ step }) => {
    // Step 1: Gather data, memory context, and RAG context in parallel
    const [data, memoryContext] = await step.run("gather-data", async () => {
      return Promise.all([
        gatherBriefingData(),
        buildProactiveContext().catch(() => ""),
      ]);
    });

    // Step 2: RAG retrieval + anomaly detection in parallel
    const [ragContext, anomalyResult] = await step.run("rag-and-anomalies", async () => {
      return Promise.all([
        getRagContext(data).catch(() => ""),
        detectAnomalies(data.mrr, data.overdueInvoices).catch(() => ({ hasAnomalies: false, anomalies: [], baselineDataPoints: 0 })),
      ]);
    });

    const anomalyContext = formatAnomalyContext(anomalyResult as import("@/lib/ai/agents/anomaly-detection").AnomalyResult);

    // Step 3: Generate briefing with full context (memory + RAG + anomalies + data)
    const briefing = await step.run("generate-briefing", async () => {
      const fullRagContext = [ragContext, anomalyContext].filter(Boolean).join("\n\n");
      return generateBriefing(data, memoryContext, fullRagContext);
    });

    // Step 4: Send proactive DM
    await step.run("send-dm", async () => {
      await sendProactiveMessage({ trigger: "morning", context: briefing });
    });

    // Step 5: Store daily metrics snapshot (enables MRR delta next run)
    await step.run("snapshot-metrics", async () => {
      await storeDailySnapshot(data);
    });

    // Step 5b: Persist the briefing text so the dashboard can render it
    await step.run("store-briefing", async () => {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      await db
        .insert(schema.dailyBriefings)
        .values({
          date: today,
          briefingText: briefing,
          isScheduled: true,
        })
        .onConflictDoUpdate({
          target: schema.dailyBriefings.date,
          set: {
            briefingText: briefing,
            updatedAt: new Date(),
          },
        });
    });

    // Step 6: Audit log
    await step.run("audit-log", async () => {
      await createAuditLog({
        actorId: "system",
        actorType: "system",
        action: "create",
        entityType: "morning_briefing",
        entityId: `briefing-${new Date().toISOString().split("T")[0]}`,
        metadata: {
          mrr: data.mrr,
          mrrPrior: data.mrrPrior,
          mrrDeltaDays: data.mrrDeltaDays,
          unresolvedAlerts: data.unresolvedAlerts,
          atRiskRocks: data.atRiskRocks,
          ragContextUsed: ragContext.length > 0,
          anomaliesDetected: anomalyResult.anomalies.length,
          anomalyBaselineDataPoints: anomalyResult.baselineDataPoints,
        },
      });
    });

    return { success: true, briefing, ragContextUsed: ragContext.length > 0, anomaliesDetected: anomalyResult.anomalies.length };
  }
);
