/**
 * PostHog Sync API — Triggers a PostHog analytics snapshot sync.
 *
 * POST: Sends event to Inngest to run sync-posthog-analytics job.
 * Auth: owner or admin only.
 */

import { NextRequest, NextResponse } from "next/server";
import { inngest } from "@/lib/inngest/client";
import { checkAdmin } from "@/lib/auth";
import { captureError } from "@/lib/errors";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const userId = await checkAdmin();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  void req;

  try {
    await inngest.send({ name: "sync-posthog-analytics", data: {} });
    return NextResponse.json({ success: true, message: "PostHog sync triggered" });
  } catch (err) {
    console.error("[posthog-sync] Error:", err);
    captureError(err, { tags: { route: "POST /api/admin/posthog-sync" } });
    return NextResponse.json(
      {
        error: "Sync trigger failed",
        message: err instanceof Error ? err.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
