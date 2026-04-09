/**
 * Admin — AI Usage Dashboard
 *
 * Server component. Fetches summary server-side, renders cards + chart.
 * Protected by admin auth (checkAdmin in API routes + Clerk middleware).
 */

import type { Metadata } from "next";
import { Suspense } from "react";
import { checkAdmin } from "@/lib/auth";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { aiUsage, aiUsageDaily } from "@/lib/db/schema/ai-usage";
import { sql, and, gte, lte, desc } from "drizzle-orm";
import { SpendCards } from "@/components/admin/ai-usage/spend-cards";
import { TopRunsTable, type TopRunRow } from "@/components/admin/ai-usage/top-runs-table";
import type { TimeseriesRow } from "@/app/api/ai/usage/timeseries/route";
import dynamic from "next/dynamic";
import { Skeleton } from "@/components/ui/skeleton";

export const metadata: Metadata = {
  title: "AI Usage | AM Collective",
};

// Lazy-load the chart (recharts) to keep initial JS minimal
const DailyChart = dynamic(
  () =>
    import("@/components/admin/ai-usage/daily-chart").then(
      (mod) => mod.DailyChart
    ),
  { loading: () => <Skeleton className="h-64 w-full" /> }
);

// ─── Server-side Data Fetchers ────────────────────────────────────────────────

async function fetchSummary() {
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0);

  const [spendTodayResult, spendMonthResult, spendLastMonthResult] =
    await Promise.all([
      db
        .select({
          total: sql<string>`COALESCE(SUM(CAST(${aiUsage.totalCostUsd} AS DECIMAL)), 0)`,
        })
        .from(aiUsage)
        .where(gte(aiUsage.timestamp, todayStart)),

      db
        .select({
          total: sql<string>`COALESCE(SUM(CAST(${aiUsageDaily.totalCostUsd} AS DECIMAL)), 0)`,
        })
        .from(aiUsageDaily)
        .where(
          and(
            gte(aiUsageDaily.date, monthStart.toISOString().split("T")[0]),
            lte(aiUsageDaily.date, now.toISOString().split("T")[0])
          )
        ),

      db
        .select({
          total: sql<string>`COALESCE(SUM(CAST(${aiUsageDaily.totalCostUsd} AS DECIMAL)), 0)`,
        })
        .from(aiUsageDaily)
        .where(
          and(
            gte(
              aiUsageDaily.date,
              lastMonthStart.toISOString().split("T")[0]
            ),
            lte(
              aiUsageDaily.date,
              lastMonthEnd.toISOString().split("T")[0]
            )
          )
        ),
    ]);

  const spendToday = parseFloat(spendTodayResult[0]?.total ?? "0");
  const spendMonth = parseFloat(spendMonthResult[0]?.total ?? "0");
  const spendLastMonth = parseFloat(spendLastMonthResult[0]?.total ?? "0");

  const daysElapsed = Math.max(1, now.getDate());
  const daysInMonth = new Date(
    now.getFullYear(),
    now.getMonth() + 1,
    0
  ).getDate();
  const projectedMonth = (spendMonth / daysElapsed) * daysInMonth;

  const lastMonthDays = lastMonthEnd.getDate();
  const lastMonthProrated =
    spendLastMonth > 0
      ? (spendLastMonth / lastMonthDays) * daysElapsed
      : 0;
  const pctVsLastMonth =
    lastMonthProrated > 0
      ? ((spendMonth - lastMonthProrated) / lastMonthProrated) * 100
      : null;

  return { spendToday, spendMonth, projectedMonth, pctVsLastMonth };
}

async function fetchTimeseries(): Promise<TimeseriesRow[]> {
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const rows = await db
    .select({
      date: aiUsageDaily.date,
      agentName: aiUsageDaily.agentName,
      totalCostUsd: sql<string>`SUM(CAST(${aiUsageDaily.totalCostUsd} AS DECIMAL))`,
    })
    .from(aiUsageDaily)
    .where(
      gte(aiUsageDaily.date, thirtyDaysAgo.toISOString().split("T")[0])
    )
    .groupBy(aiUsageDaily.date, aiUsageDaily.agentName)
    .orderBy(aiUsageDaily.date);

  return rows.map((r) => ({
    date:
      typeof r.date === "string"
        ? r.date
        : (r.date as Date).toISOString().split("T")[0],
    agentName: r.agentName,
    totalCostUsd: parseFloat(r.totalCostUsd ?? "0"),
  }));
}

async function fetchTopRuns(): Promise<TopRunRow[]> {
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const rows = await db
    .select({
      id: aiUsage.id,
      timestamp: aiUsage.timestamp,
      agentName: aiUsage.agentName,
      model: aiUsage.model,
      userId: aiUsage.userId,
      inputTokens: aiUsage.inputTokens,
      outputTokens: aiUsage.outputTokens,
      cacheReadTokens: aiUsage.cacheReadTokens,
      totalCostUsd: aiUsage.totalCostUsd,
      latencyMs: aiUsage.latencyMs,
      success: aiUsage.success,
      errorCode: aiUsage.errorCode,
      toolCallsCount: aiUsage.toolCallsCount,
      finishReason: aiUsage.finishReason,
      requestId: aiUsage.requestId,
    })
    .from(aiUsage)
    .where(gte(aiUsage.timestamp, thirtyDaysAgo))
    .orderBy(desc(aiUsage.totalCostUsd))
    .limit(10);

  return rows as unknown as TopRunRow[];
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default async function AiUsagePage() {
  const userId = await checkAdmin();
  if (!userId) {
    redirect("/sign-in");
  }

  const [summary, timeseriesRows, topRunsRows] = await Promise.all([
    fetchSummary(),
    fetchTimeseries(),
    fetchTopRuns(),
  ]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold font-mono uppercase tracking-tight">
            AI Usage
          </h1>
          <p className="text-xs text-[#0A0A0A]/50 font-mono mt-0.5">
            Token spend, cost tracking, and per-agent breakdown
          </p>
        </div>
      </div>

      {/* Spend Summary Cards */}
      <SpendCards {...summary} />

      {/* Daily Chart */}
      <Suspense fallback={<Skeleton className="h-64 w-full" />}>
        <DailyChart rows={timeseriesRows} />
      </Suspense>

      {/* Top Runs Table */}
      <TopRunsTable rows={topRunsRows} />

      <p className="text-[10px] font-mono text-[#0A0A0A]/30 uppercase tracking-wider">
        Daily rollup runs at 2am UTC. Raw rows retained 90 days.
        Streaming calls (Vercel AI SDK) not yet tracked — follow-up PR pending.
      </p>
    </div>
  );
}
