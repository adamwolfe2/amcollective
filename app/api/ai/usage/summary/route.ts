/**
 * GET /api/ai/usage/summary
 *
 * Returns high-level spend summary for the AI usage dashboard.
 * Uses aiUsageDaily for month-level queries, aiUsage for today.
 *
 * Admin-only.
 */

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { aiUsage, aiUsageDaily } from "@/lib/db/schema/ai-usage";
import { sql, and, gte, lte } from "drizzle-orm";
import { checkAdmin } from "@/lib/auth";
import { captureError } from "@/lib/errors";

export async function GET(_req: NextRequest) {
  try {
    const userId = await checkAdmin();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    // Last month window for comparison
    const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0); // last day of prev month

    const [spendTodayResult, spendMonthResult, spendLastMonthResult] =
      await Promise.all([
        // Today: query raw table (too recent for rollup)
        db
          .select({
            total: sql<string>`COALESCE(SUM(CAST(${aiUsage.totalCostUsd} AS DECIMAL)), 0)`,
          })
          .from(aiUsage)
          .where(gte(aiUsage.timestamp, todayStart)),

        // This month: use rollup table for efficiency
        db
          .select({
            total: sql<string>`COALESCE(SUM(CAST(${aiUsageDaily.totalCostUsd} AS DECIMAL)), 0)`,
          })
          .from(aiUsageDaily)
          .where(
            and(
              gte(aiUsageDaily.date, monthStart.toISOString().split("T")[0]),
              lte(
                aiUsageDaily.date,
                now.toISOString().split("T")[0]
              )
            )
          ),

        // Last month: rollup table
        db
          .select({
            total: sql<string>`COALESCE(SUM(CAST(${aiUsageDaily.totalCostUsd} AS DECIMAL)), 0)`,
          })
          .from(aiUsageDaily)
          .where(
            and(
              gte(aiUsageDaily.date, lastMonthStart.toISOString().split("T")[0]),
              lte(aiUsageDaily.date, lastMonthEnd.toISOString().split("T")[0])
            )
          ),
      ]);

    const spendToday = parseFloat(spendTodayResult[0]?.total ?? "0");
    const spendMonth = parseFloat(spendMonthResult[0]?.total ?? "0");
    const spendLastMonth = parseFloat(spendLastMonthResult[0]?.total ?? "0");

    // Project month-end spend: (current spend / days elapsed) * days in month
    const daysElapsed = Math.max(1, now.getDate());
    const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    const projectedMonth = (spendMonth / daysElapsed) * daysInMonth;

    // % change vs last month (prorated to same number of days)
    const lastMonthDays = lastMonthEnd.getDate();
    const lastMonthProrated =
      spendLastMonth > 0
        ? (spendLastMonth / lastMonthDays) * daysElapsed
        : 0;
    const pctVsLastMonth =
      lastMonthProrated > 0
        ? ((spendMonth - lastMonthProrated) / lastMonthProrated) * 100
        : null;

    return NextResponse.json({
      spendToday,
      spendMonth,
      projectedMonth,
      pctVsLastMonth,
    });
  } catch (error) {
    captureError(error, { tags: { route: "api/ai/usage/summary" } });
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
