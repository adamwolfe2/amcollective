/**
 * PATCH /api/strategy/recommendations/[id]
 * Update recommendation status (done | dismissed | in_progress)
 * Admin only.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/require-admin";
import { db } from "@/lib/db";
import { strategyRecommendations } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { captureError } from "@/lib/errors";

type Status = "active" | "in_progress" | "done" | "dismissed";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { error } = await requireAdmin();
  if (error) return error;

  try {
    const { id } = await params;
    const body = await req.json() as { status: Status; note?: string };

    if (!["active", "in_progress", "done", "dismissed"].includes(body.status)) {
      return NextResponse.json({ error: "Invalid status" }, { status: 400 });
    }

    await db
      .update(strategyRecommendations)
      .set({
        status: body.status,
        actedOnAt: body.status === "done" ? new Date() : undefined,
        actedOnNote: body.note ?? undefined,
      })
      .where(eq(strategyRecommendations.id, id));

    return NextResponse.json({ ok: true });
  } catch (error) {
    captureError(error, { tags: { component: "strategy-recommendations-patch" } });
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
