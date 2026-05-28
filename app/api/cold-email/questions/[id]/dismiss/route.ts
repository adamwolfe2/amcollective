/**
 * POST /api/cold-email/questions/[id]/dismiss
 *
 * Marks a Bison question as dismissed (user chose to skip rather than answer).
 */

import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { coldEmailQuestions } from "@/lib/db/schema";
import { checkAdmin } from "@/lib/auth";
import { eq } from "drizzle-orm";
import { captureError } from "@/lib/errors";

export async function POST(
  _req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  try {
    const userId = await checkAdmin();
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id } = await ctx.params;
    await db
      .update(coldEmailQuestions)
      .set({ status: "dismissed", updatedAt: new Date() })
      .where(eq(coldEmailQuestions.id, id));

    return NextResponse.json({ ok: true });
  } catch (err) {
    captureError(err, { tags: { route: "cold-email/questions/dismiss" } });
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 }
    );
  }
}
