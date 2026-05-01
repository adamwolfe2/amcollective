/**
 * Strategy Analysis — Weekly Inngest Job
 *
 * Cron: Monday 3pm UTC (10am CT) — runs after weekly-intelligence (2pm UTC)
 * Also triggerable on-demand via event "strategy/run-analysis"
 *
 * Steps:
 *   1. Gather — pull all connector + DB data
 *   2. Analyze — Claude generates recommendations
 *   3. Persist — store metrics + recommendations in DB
 *   4. Notify — send top priority via proactive DM
 */

import { inngest } from "../client";
import {
  gatherStrategyData,
  generateStrategyRecommendations,
  persistStrategyResult,
} from "@/lib/ai/agents/strategy-engine";
import { sendProactiveMessage } from "@/lib/ai/agents/proactive";

function getMondayOfWeek(date: Date): string {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  d.setDate(diff);
  return d.toISOString().split("T")[0];
}

export const strategyAnalysis = inngest.createFunction(
  {
    id: "strategy-analysis",
    name: "Weekly Strategy Analysis",
    retries: 2,
  },
  [
    // Weekly cron: Monday 10am CT = 3pm UTC
    { cron: "0 15 * * 1" },
    // On-demand trigger (from "Run Analysis" button on strategy page)
    { event: "strategy/run-analysis" },
  ],
  async ({ step, event }) => {
    // Hard-block Opus path. Opus is ~6x Sonnet and the only opt-in path is
    // here. Cost audit flagged this as the single Opus exposure. To re-enable,
    // explicitly set ALLOW_OPUS_STRATEGY=1 in env.
    const useOpus =
      process.env.ALLOW_OPUS_STRATEGY === "1"
        ? (event as { data?: { useOpus?: boolean } })?.data?.useOpus ?? false
        : false;
    const weekOf = getMondayOfWeek(new Date());

    // ── Step 1: Gather data ────────────────────────────────────────────────
    const data = await step.run("gather-strategy-data", async () => {
      return gatherStrategyData();
    });

    // ── Step 2: Generate recommendations ──────────────────────────────────
    const result = await step.run("generate-recommendations", async () => {
      return generateStrategyRecommendations(data, useOpus);
    });

    // ── Step 3: Persist to DB ──────────────────────────────────────────────
    await step.run("persist-strategy-result", async () => {
      await persistStrategyResult(weekOf, result);
    });

    // ── Step 4: DM top urgent recommendation ──────────────────────────────
    await step.run("notify-top-recommendation", async () => {
      const urgent = result.recommendations
        .filter((r) => r.priority === 2)
        .sort((a, b) => (b.estimatedValueCents ?? 0) - (a.estimatedValueCents ?? 0))[0];

      if (!urgent) return;

      const fmt = (cents: number) => `$${Math.round(cents / 100).toLocaleString()}`;

      const context = [
        `Weekly strategy analysis complete. Health score: ${result.metrics.healthScore}/100.`,
        `Top urgent item: ${urgent.title}.`,
        `Situation: ${urgent.situation}`,
        `Recommended action: ${urgent.recommendation}`,
        urgent.estimatedValueCents
          ? `Estimated impact: ${fmt(urgent.estimatedValueCents)}/mo`
          : null,
        `Full breakdown at /admin/strategy.`,
      ]
        .filter(Boolean)
        .join(" ");

      await sendProactiveMessage({
        trigger: "alert",
        context,
        to: "adam",
        urgency: "normal",
      });
    });

    return {
      weekOf,
      recommendationCount: result.recommendations.length,
      urgentCount: result.recommendations.filter((r) => r.priority === 2).length,
      healthScore: result.metrics.healthScore,
    };
  }
);
