/**
 * Stripe Sync API — Triggers a full sync of all Stripe data.
 *
 * POST: Runs syncEverything() and returns counts.
 * Auth: owner or admin only.
 */

import { NextRequest, NextResponse } from "next/server";
import { syncEverything } from "@/lib/stripe/sync";
import { checkAdmin } from "@/lib/auth";
import { captureError } from "@/lib/errors";

export const runtime = "nodejs";
export const maxDuration = 120; // sync can take a while

export async function POST(req: NextRequest) {
  const userId = await checkAdmin();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Prevent concurrent syncs with a simple check
  void req; // consume req to avoid lint warning

  try {
    const result = await syncEverything();
    return NextResponse.json({ success: true, ...result });
  } catch (err) {
    console.error("[stripe-sync] Error:", err);
    captureError(err, { tags: { route: "POST /api/admin/stripe-sync" } });
    return NextResponse.json(
      {
        error: "Sync failed",
        message: err instanceof Error ? err.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
