/**
 * Admin API — Inngest Job Run History
 *
 * GET /api/admin/jobs/[id]/runs
 *
 * Returns the last 50 runs for a specific Inngest function, ordered by
 * most recent first. Includes timestamps, duration, status, and error messages.
 *
 * Auth: admin or owner only (checkAdmin).
 */

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { inngestRunHistory } from "@/lib/db/schema/inngest";
import { desc, eq } from "drizzle-orm";
import { checkAdmin } from "@/lib/auth";
import { captureError } from "@/lib/errors";
import { JOB_REGISTRY } from "@/lib/inngest/registry";

export const runtime = "nodejs";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const userId = await checkAdmin();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: functionId } = await params;

  // Validate that this is a registered function
  const registration = JOB_REGISTRY.find((j) => j.id === functionId);
  if (!registration) {
    return NextResponse.json({ error: "Function not found" }, { status: 404 });
  }

  try {
    const runs = await db
      .select({
        id: inngestRunHistory.id,
        runId: inngestRunHistory.runId,
        status: inngestRunHistory.status,
        trigger: inngestRunHistory.trigger,
        startedAt: inngestRunHistory.startedAt,
        completedAt: inngestRunHistory.completedAt,
        durationMs: inngestRunHistory.durationMs,
        error: inngestRunHistory.error,
        attemptNumber: inngestRunHistory.attemptNumber,
      })
      .from(inngestRunHistory)
      .where(eq(inngestRunHistory.functionId, functionId))
      .orderBy(desc(inngestRunHistory.startedAt))
      .limit(50);

    return NextResponse.json({
      functionId,
      functionName: registration.name,
      cron: registration.cron,
      events: registration.events,
      runs,
    });
  } catch (err) {
    captureError(err, {
      tags: { route: `GET /api/admin/jobs/${functionId}/runs` },
    });
    return NextResponse.json(
      { error: "Failed to load run history" },
      { status: 500 }
    );
  }
}
