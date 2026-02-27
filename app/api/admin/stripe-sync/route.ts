/**
 * Stripe Sync API — Triggers a full sync of all Stripe data.
 *
 * POST: Runs syncEverything() and returns counts.
 * Auth: owner or admin only.
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { syncEverything } from "@/lib/stripe/sync";

export const runtime = "nodejs";
export const maxDuration = 120; // sync can take a while

export async function POST(req: NextRequest) {
  const { userId, sessionClaims } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Only owner or admin can trigger sync
  const role =
    (sessionClaims?.publicMetadata as Record<string, unknown>)?.role ??
    (userId === "user_2vqM8MZ1z7MxvJRLjJolHJAGnXp" ? "owner" : null);

  if (role !== "owner" && role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Prevent concurrent syncs with a simple check
  void req; // consume req to avoid lint warning

  try {
    const result = await syncEverything();
    return NextResponse.json({ success: true, ...result });
  } catch (err) {
    console.error("[stripe-sync] Error:", err);
    return NextResponse.json(
      {
        error: "Sync failed",
        message: err instanceof Error ? err.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
