/**
 * GET /api/ai/usage/top-runs
 *
 * Returns top 10 most expensive individual AI runs in a date range.
 * Default range: last 30 days.
 *
 * Query params:
 *   from  ISO date string (default: 30 days ago)
 *   to    ISO date string (default: now)
 *   agent filter by agent name (optional)
 *
 * Admin-only.
 */

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { aiUsage } from "@/lib/db/schema/ai-usage";
import { desc, and, gte, lte, eq } from "drizzle-orm";
import { checkAdmin } from "@/lib/auth";
import { captureError } from "@/lib/errors";

export async function GET(req: NextRequest) {
  try {
    const userId = await checkAdmin();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const url = req.nextUrl.searchParams;
    const fromParam = url.get("from");
    const toParam = url.get("to");
    const agentParam = url.get("agent");

    const from = fromParam
      ? new Date(fromParam)
      : new Date(Date.now() - 30 * 86400000);
    const to = toParam ? new Date(toParam) : new Date();

    const conditions = [gte(aiUsage.timestamp, from), lte(aiUsage.timestamp, to)];
    if (agentParam) {
      conditions.push(eq(aiUsage.agentName, agentParam));
    }

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
      .where(and(...conditions))
      .orderBy(desc(aiUsage.totalCostUsd))
      .limit(10);

    return NextResponse.json({ rows });
  } catch (error) {
    captureError(error, { tags: { route: "api/ai/usage/top-runs" } });
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
