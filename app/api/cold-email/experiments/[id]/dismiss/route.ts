/**
 * POST /api/cold-email/experiments/[id]/dismiss
 *
 * Dismisses a pending-approval experiment without deploying it.
 */

import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { coldEmailExperiments } from "@/lib/db/schema";
import { checkAdmin } from "@/lib/auth";
import { eq } from "drizzle-orm";
import { captureError } from "@/lib/errors";

export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  try {
    const userId = await checkAdmin();
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id } = await ctx.params;
    const body = (await req.json().catch(() => ({}))) as { reason?: string };

    await db
      .update(coldEmailExperiments)
      .set({
        status: "aborted",
        decisionNotes: body.reason ?? "Dismissed by user before deploy.",
        updatedAt: new Date(),
      })
      .where(eq(coldEmailExperiments.id, id));

    return NextResponse.json({ ok: true });
  } catch (err) {
    captureError(err, { tags: { route: "cold-email/experiments/dismiss" } });
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 }
    );
  }
}
