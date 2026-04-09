/**
 * GET /api/ai/usage/timeseries
 *
 * Returns daily spend stacked by agent for the last 30 days.
 * Used by the daily chart component.
 *
 * Admin-only.
 */

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { aiUsageDaily } from "@/lib/db/schema/ai-usage";
import { sql, and, gte } from "drizzle-orm";
import { checkAdmin } from "@/lib/auth";
import { captureError } from "@/lib/errors";

export interface TimeseriesRow {
  date: string;
  agentName: string;
  totalCostUsd: number;
}

export async function GET(_req: NextRequest) {
  try {
    const userId = await checkAdmin();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

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
        and(
          gte(aiUsageDaily.date, thirtyDaysAgo.toISOString().split("T")[0])
        )
      )
      .groupBy(aiUsageDaily.date, aiUsageDaily.agentName)
      .orderBy(aiUsageDaily.date);

    const result: TimeseriesRow[] = rows.map((r) => ({
      date: typeof r.date === "string" ? r.date : (r.date as Date).toISOString().split("T")[0],
      agentName: r.agentName,
      totalCostUsd: parseFloat(r.totalCostUsd ?? "0"),
    }));

    return NextResponse.json({ rows: result });
  } catch (error) {
    captureError(error, { tags: { route: "api/ai/usage/timeseries" } });
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
