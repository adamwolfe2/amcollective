/**
 * Vercel Full Sync API — Triggers a full Vercel project snapshot sync.
 *
 * POST: Sends event to Inngest to run sync-vercel-full job.
 * Auth: owner or admin only.
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { inngest } from "@/lib/inngest/client";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const { userId, sessionClaims } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const role =
    (sessionClaims?.publicMetadata as Record<string, unknown>)?.role ??
    (userId === "user_2vqM8MZ1z7MxvJRLjJolHJAGnXp" ? "owner" : null);

  if (role !== "owner" && role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  void req;

  try {
    await inngest.send({ name: "sync-vercel-full", data: {} });
    return NextResponse.json({ success: true, message: "Vercel sync triggered" });
  } catch (err) {
    console.error("[vercel-sync] Error:", err);
    return NextResponse.json(
      {
        error: "Sync trigger failed",
        message: err instanceof Error ? err.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
