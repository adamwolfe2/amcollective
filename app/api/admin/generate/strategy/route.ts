/**
 * POST /api/admin/generate/strategy
 *
 * Directly runs the strategy analysis pipeline (gather + Claude + persist)
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
  gatherStrategyData,
  generateStrategyRecommendations,
  persistStrategyResult,
} from "@/lib/ai/agents/strategy-engine";
import { createAuditLog } from "@/lib/db/repositories/audit";

export const runtime = "nodejs";
export const maxDuration = 120;

const key = process.env.ARCJET_KEY;

/** Strict rate limiter: 1 request per 5 minutes per IP */
const ajGenerateStrategy = key
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

function getMondayOfWeek(date: Date): string {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  d.setDate(diff);
  return d.toISOString().split("T")[0];
}

export async function POST(req: NextRequest) {
  if (ajGenerateStrategy) {
    const decision = await ajGenerateStrategy.protect(req, { requested: 1 });
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

  const weekOf = getMondayOfWeek(new Date());

  try {
    const data = await gatherStrategyData();
    const result = await generateStrategyRecommendations(data, false);
    await persistStrategyResult(weekOf, result);

    after(async () => {
      await createAuditLog({
        actorId: userId,
        actorType: "user",
        action: "strategy_analysis.generated",
        entityType: "strategy_metrics",
        entityId: weekOf,
        metadata: {
          recommendationCount: result.recommendations.length,
          urgentCount: result.recommendations.filter((r) => r.priority === 2).length,
          healthScore: result.metrics.healthScore,
          triggeredBy: "manual_generate_button",
        },
      });
    });

    return NextResponse.json({
      success: true,
      weekOf,
      recommendationCount: result.recommendations.length,
      urgentCount: result.recommendations.filter((r) => r.priority === 2).length,
      healthScore: result.metrics.healthScore,
    });
  } catch (err) {
    captureError(err, { tags: { route: "POST /api/admin/generate/strategy" } });
    return NextResponse.json(
      {
        error: "Generation failed",
        message: err instanceof Error ? err.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
