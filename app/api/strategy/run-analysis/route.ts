/**
 * POST /api/strategy/run-analysis
 * Triggers an on-demand strategy analysis via Inngest.
 * Admin only.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/require-admin";
import { inngest } from "@/lib/inngest/client";

export async function POST(req: NextRequest) {
  const { error } = await requireAdmin();
  if (error) return error;

  const body = await req.json().catch(() => ({})) as { useOpus?: boolean };

  await inngest.send({
    name: "strategy/run-analysis",
    data: { useOpus: body.useOpus ?? false },
  });

  return NextResponse.json({ ok: true, message: "Strategy analysis triggered. Results will appear in ~30 seconds." });
}
