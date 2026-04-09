/**
 * GET  /api/admin/morning-briefing  — fetch today's stored briefing
 * POST /api/admin/morning-briefing  — manually trigger generation and store result
 *
 * GET returns the persisted AI briefing text for today, or null if not yet generated.
 * POST runs the full pipeline immediately (gather → generate → store) and returns
 * the briefing text. Intended for the "Generate Now" button on the dashboard.
 */

import { NextRequest, NextResponse } from "next/server";
import { checkAdmin } from "@/lib/auth";
import { captureError } from "@/lib/errors";
import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import {
  gatherBriefingData,
  generateBriefing,
  getRagContext,
  storeDailySnapshot,
} from "@/lib/ai/agents/morning-briefing";
import {
  detectAnomalies,
  formatAnomalyContext,
} from "@/lib/ai/agents/anomaly-detection";
import { buildProactiveContext } from "@/lib/ai/context";

export const runtime = "nodejs";
export const maxDuration = 60;

function todayDate(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

// ─── GET — return today's stored briefing ────────────────────────────────────

export async function GET() {
  try {
    const userId = await checkAdmin();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const today = todayDate();
    const rows = await db
      .select({
        briefingText: schema.dailyBriefings.briefingText,
        createdAt: schema.dailyBriefings.createdAt,
        isScheduled: schema.dailyBriefings.isScheduled,
      })
      .from(schema.dailyBriefings)
      .where(eq(schema.dailyBriefings.date, today))
      .limit(1);

    const row = rows[0] ?? null;

    return NextResponse.json(
      {
        briefing: row?.briefingText ?? null,
        generatedAt: row?.createdAt?.toISOString() ?? null,
        isScheduled: row?.isScheduled ?? null,
      },
      {
        headers: { "Cache-Control": "private, no-store" },
      }
    );
  } catch (error) {
    captureError(error, { tags: { route: "GET /api/admin/morning-briefing" } });
    return NextResponse.json(
      { error: "Failed to fetch briefing" },
      { status: 500 }
    );
  }
}

// ─── POST — generate and store on demand ─────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    const userId = await checkAdmin();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Gather all data in parallel (mirrors the Inngest job)
    const [data, memoryContext] = await Promise.all([
      gatherBriefingData(),
      buildProactiveContext().catch(() => ""),
    ]);

    const [ragContext, anomalyResult] = await Promise.all([
      getRagContext(data).catch(() => ""),
      detectAnomalies(data.mrr, data.overdueInvoices).catch(() => ({
        hasAnomalies: false,
        anomalies: [],
        baselineDataPoints: 0,
      })),
    ]);

    const anomalyContext = formatAnomalyContext(
      anomalyResult as import("@/lib/ai/agents/anomaly-detection").AnomalyResult
    );
    const fullRagContext = [ragContext, anomalyContext].filter(Boolean).join("\n\n");

    const briefingText = await generateBriefing(data, memoryContext, fullRagContext);

    // Store (upsert for today)
    const today = todayDate();
    await db
      .insert(schema.dailyBriefings)
      .values({
        date: today,
        briefingText,
        isScheduled: false,
      })
      .onConflictDoUpdate({
        target: schema.dailyBriefings.date,
        set: {
          briefingText,
          isScheduled: false,
          updatedAt: new Date(),
        },
      });

    // Also update the daily metrics snapshot (same as the Inngest job does)
    await storeDailySnapshot(data).catch(() => undefined);

    return NextResponse.json({ briefing: briefingText, generatedAt: new Date().toISOString() });
  } catch (error) {
    captureError(error, { tags: { route: "POST /api/admin/morning-briefing" } });
    return NextResponse.json(
      { error: "Failed to generate briefing" },
      { status: 500 }
    );
  }
}
