/**
 * POST /api/admin/generate/intelligence
 *
 * Directly runs the weekly intelligence pipeline (gather + Claude + persist)
 * without going through Inngest. Results are visible immediately on refresh.
 *
 * Rate limited to 1 request per 5 minutes to avoid Claude API spam.
 * Auth: admin/owner only.
 */

import { NextRequest, NextResponse } from "next/server";
import { after } from "next/server";
import arcjet, { shield, tokenBucket } from "@arcjet/next";
import { checkAdmin } from "@/lib/auth";
import { captureError } from "@/lib/errors";
import {
  gatherWeeklyData,
  generateWeeklyIntelligence,
} from "@/lib/ai/agents/weekly-intelligence";
import { createAuditLog } from "@/lib/db/repositories/audit";
import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";

export const runtime = "nodejs";
export const maxDuration = 120;

const key = process.env.ARCJET_KEY;

/** Strict rate limiter: 1 request per 5 minutes per IP */
const ajGenerateIntelligence = key
  ? arcjet({
      key,
      characteristics: ["ip.src"],
      rules: [
        shield({ mode: "LIVE" }),
        tokenBucket({
          mode: "LIVE",
          refillRate: 1,
          interval: 300,
          capacity: 1,
        }),
      ],
    })
  : null;

function getWeekOf(): string {
  const now = new Date();
  const day = now.getDay();
  const diff = now.getDate() - day + (day === 0 ? -6 : 1);
  const monday = new Date(now);
  monday.setDate(diff);
  return monday.toISOString().split("T")[0];
}

export async function POST(req: NextRequest) {
  if (ajGenerateIntelligence) {
    const decision = await ajGenerateIntelligence.protect(req, { requested: 1 });
    if (decision.isDenied()) {
      return NextResponse.json(
        { error: "Rate limited. Please wait 5 minutes before generating again." },
        { status: 429 }
      );
    }
  }

  const userId = await checkAdmin();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const weekOf = getWeekOf();

  try {
    const data = await gatherWeeklyData();
    const result = await generateWeeklyIntelligence(data);

    // Store the report (upsert by weekOf)
    await db
      .insert(schema.weeklyReports)
      .values({
        weekOf,
        executiveSummary: result.executiveSummary,
        fullReport: result.fullReport,
        dataSnapshot: data as unknown as Record<string, unknown>,
        insightCount: result.insights.length,
      })
      .onConflictDoUpdate({
        target: schema.weeklyReports.weekOf,
        set: {
          executiveSummary: result.executiveSummary,
          fullReport: result.fullReport,
          dataSnapshot: data as unknown as Record<string, unknown>,
          insightCount: result.insights.length,
        },
      });

    // Store individual insights
    if (result.insights.length > 0) {
      await db.insert(schema.weeklyInsights).values(
        result.insights.map((insight) => ({
          weekOf,
          category: insight.category,
          title: insight.title,
          summary: insight.summary,
          priority: insight.priority,
          dataSnapshot: data as unknown as Record<string, unknown>,
        }))
      );
    }

    after(async () => {
      await createAuditLog({
        actorId: userId,
        actorType: "user",
        action: "weekly_intelligence.generated",
        entityType: "weekly_report",
        entityId: weekOf,
        metadata: {
          insightCount: result.insights.length,
          categories: [...new Set(result.insights.map((i) => i.category))],
          triggeredBy: "manual_generate_button",
        },
      });
    });

    return NextResponse.json({
      success: true,
      weekOf,
      insightCount: result.insights.length,
      urgentCount: result.insights.filter((i) => i.priority >= 2).length,
    });
  } catch (err) {
    captureError(err, { tags: { route: "POST /api/admin/generate/intelligence" } });
    return NextResponse.json(
      {
        error: "Generation failed",
        message: err instanceof Error ? err.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
