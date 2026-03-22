/**
 * Vercel Full Sync API — Triggers a full Vercel project snapshot sync.
 *
 * POST: Sends event to Inngest to run sync-vercel-full job.
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
    await inngest.send({ name: "sync-vercel-full", data: {} });
    return NextResponse.json({ success: true, message: "Vercel sync triggered" });
  } catch (err) {
    captureError(err, { tags: { route: "POST /api/admin/vercel-sync" } });
    return NextResponse.json(
      {
        error: "Sync trigger failed",
        message: err instanceof Error ? err.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
