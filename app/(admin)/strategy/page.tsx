/**
 * /admin/strategy — Strategic Command Center
 *
 * Answers: "What should we do right now to make more money, cut costs, and reduce risk?"
 * Powered by weekly strategy analysis + Claude-generated recommendations.
 */

import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { desc, eq, or } from "drizzle-orm";
import { StrategyClient, type StrategyRec, type StrategyMetricsData } from "./strategy-client";
import { GenerateStrategyButton } from "./generate-button";
import { requireAdmin } from "@/lib/auth/require-admin";
import { redirect } from "next/navigation";

export const metadata = {
  title: "Strategic Command | AM Collective",
};

// Re-run at most every 60 seconds
export const revalidate = 60;

export default async function StrategyPage() {
  const { error } = await requireAdmin();
  if (error) redirect("/sign-in");

  // Fetch latest metrics + recommendations in parallel
  const [[latestMetrics], recommendations] = await Promise.all([
    db
      .select()
      .from(schema.strategyMetrics)
      .orderBy(desc(schema.strategyMetrics.createdAt))
      .limit(1)
      .catch(() => []),
    db
      .select({
        id: schema.strategyRecommendations.id,
        type: schema.strategyRecommendations.type,
        product: schema.strategyRecommendations.product,
        priority: schema.strategyRecommendations.priority,
        title: schema.strategyRecommendations.title,
        situation: schema.strategyRecommendations.situation,
        recommendation: schema.strategyRecommendations.recommendation,
        expectedImpact: schema.strategyRecommendations.expectedImpact,
        estimatedValueCents: schema.strategyRecommendations.estimatedValueCents,
        effort: schema.strategyRecommendations.effort,
        status: schema.strategyRecommendations.status,
        weekOf: schema.strategyRecommendations.weekOf,
        createdAt: schema.strategyRecommendations.createdAt,
      })
      .from(schema.strategyRecommendations)
      .where(
        or(
          eq(schema.strategyRecommendations.status, "active"),
          eq(schema.strategyRecommendations.status, "in_progress"),
          eq(schema.strategyRecommendations.status, "done"),
          eq(schema.strategyRecommendations.status, "dismissed")
        )
      )
      .orderBy(desc(schema.strategyRecommendations.priority), desc(schema.strategyRecommendations.createdAt))
      .limit(50)
      .catch(() => []),
  ]);

  // Shape metrics for client
  const metricsData: StrategyMetricsData | null = latestMetrics
    ? {
        totalMrrCents: latestMetrics.totalMrrCents,
        mrrGrowthPct: latestMetrics.mrrGrowthPct ? String(latestMetrics.mrrGrowthPct) : null,
        totalCashCents: latestMetrics.totalCashCents,
        monthlyBurnCents: latestMetrics.monthlyBurnCents,
        runwayMonths: latestMetrics.runwayMonths ? String(latestMetrics.runwayMonths) : null,
        healthScore: latestMetrics.healthScore,
        concentrationPct: latestMetrics.concentrationPct,
        riskLevel: latestMetrics.riskLevel,
        productMargins: latestMetrics.productMargins as StrategyMetricsData["productMargins"],
        revenueForecast: latestMetrics.revenueForecast as StrategyMetricsData["revenueForecast"],
        executiveSummary: latestMetrics.executiveSummary,
        weekOf: latestMetrics.weekOf,
      }
    : null;

  const recsData: StrategyRec[] = recommendations.map((r) => ({
    id: r.id,
    type: r.type as StrategyRec["type"],
    product: r.product ?? null,
    priority: r.priority,
    title: r.title,
    situation: r.situation,
    recommendation: r.recommendation,
    expectedImpact: r.expectedImpact ?? "",
    estimatedValueCents: r.estimatedValueCents ?? null,
    effort: r.effort ?? null,
    status: r.status,
    weekOf: r.weekOf,
    createdAt: r.createdAt,
  }));

  return (
    <div className="max-w-7xl mx-auto">
      {!metricsData && recsData.length === 0 && (
        <div className="border border-dashed border-[#0A0A0A]/20 bg-white p-12 text-center mb-6">
          <p className="font-serif text-[#0A0A0A]/40 mb-4">
            No strategy analysis yet. Generate one now or wait for the automatic Monday 8 AM run.
          </p>
          <div className="flex justify-center">
            <GenerateStrategyButton />
          </div>
        </div>
      )}
      <StrategyClient metrics={metricsData} recommendations={recsData} />
    </div>
  );
}
