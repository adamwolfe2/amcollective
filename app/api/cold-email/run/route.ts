/**
 * POST /api/cold-email/run
 *
 * Manually trigger the Bison research loop. Body: { workspace?: string }
 * If workspace omitted, runs across all configured EmailBison workspaces.
 */

import { NextResponse } from "next/server";
import { inngest } from "@/lib/inngest/client";
import { checkAdmin } from "@/lib/auth";

export async function POST(req: Request) {
  const userId = await checkAdmin();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as { workspace?: string };

  await inngest.send({
    name: "cold-email/research.run",
    data: { workspace: body.workspace, triggeredBy: userId },
  });

  return NextResponse.json({ ok: true, queued: true });
}
