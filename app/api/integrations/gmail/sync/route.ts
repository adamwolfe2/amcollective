/**
 * POST /api/integrations/gmail/sync
 *
 * Manually triggers Gmail sync for the authenticated user's connected account.
 * Sends an Inngest event to run the sync job immediately.
 */

import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/require-admin";
import { inngest } from "@/lib/inngest/client";

export async function POST() {
  const { userId, error } = await requireAdmin();
  if (error) return error;

  try {
    await inngest.send({
      name: "gmail/sync.requested",
      data: { userId },
    });

    return NextResponse.json({ success: true, message: "Gmail sync triggered" });
  } catch (error) {
    console.error("[gmail-sync]", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
