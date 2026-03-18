/**
 * POST /api/strategy/run-analysis
 * Triggers an on-demand strategy analysis via Inngest.
 * Admin only.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/require-admin";
import { inngest } from "@/lib/inngest/client";
import { aj } from "@/lib/middleware/arcjet";

export async function POST(req: NextRequest) {
  if (aj) {
    const decision = await aj.protect(req, { requested: 1 });
    if (decision.isDenied()) {
      return NextResponse.json({ error: "Rate limited" }, { status: 429 });
    }
  }

  const { error } = await requireAdmin();
  if (error) return error;

  try {
    const body = await req.json().catch(() => ({})) as { useOpus?: boolean };

    await inngest.send({
      name: "strategy/run-analysis",
      data: { useOpus: body.useOpus ?? false },
    });

    return NextResponse.json({ ok: true, message: "Strategy analysis triggered. Results will appear in ~30 seconds." });
  } catch (error) {
    console.error("[strategy-run-analysis]", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
