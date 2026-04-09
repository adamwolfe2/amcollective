/**
 * Sync Status API — GET /api/admin/sync/status
 *
 * Returns the last sync run for each service, plus recent sync history.
 */

import { NextRequest, NextResponse } from "next/server";
import { checkAdmin } from "@/lib/auth";
import { captureError } from "@/lib/errors";
import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { desc } from "drizzle-orm";

export const runtime = "nodejs";
export const preferredRegion = "iad1";

export async function GET(req: NextRequest) {
  const userId = await checkAdmin();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  void req;

  try {
    // Get the most recent sync run per service using a lateral join / subquery
    const latestPerService = await db
      .selectDistinctOn([schema.syncRuns.service], {
        id: schema.syncRuns.id,
        service: schema.syncRuns.service,
        status: schema.syncRuns.status,
        triggeredBy: schema.syncRuns.triggeredBy,
        recordsProcessed: schema.syncRuns.recordsProcessed,
        errorMessage: schema.syncRuns.errorMessage,
        startedAt: schema.syncRuns.startedAt,
        completedAt: schema.syncRuns.completedAt,
      })
      .from(schema.syncRuns)
      .orderBy(schema.syncRuns.service, desc(schema.syncRuns.startedAt));

    // Get recent sync history (last 20 runs)
    const recentRuns = await db
      .select({
        id: schema.syncRuns.id,
        service: schema.syncRuns.service,
        status: schema.syncRuns.status,
        recordsProcessed: schema.syncRuns.recordsProcessed,
        errorMessage: schema.syncRuns.errorMessage,
        startedAt: schema.syncRuns.startedAt,
        completedAt: schema.syncRuns.completedAt,
      })
      .from(schema.syncRuns)
      .orderBy(desc(schema.syncRuns.startedAt))
      .limit(20);

    // Build a map of service -> latest run
    const latestByService: Record<string, typeof latestPerService[number]> = {};
    for (const run of latestPerService) {
      latestByService[run.service] = run;
    }

    return NextResponse.json({
      latestByService,
      recentRuns,
    }, {
      headers: { "Cache-Control": "private, max-age=60, stale-while-revalidate=120" },
    });
  } catch (err) {
    captureError(err, { tags: { route: "GET /api/admin/sync/status" } });
    return NextResponse.json(
      { error: "Failed to fetch sync status", message: err instanceof Error ? err.message : "Unknown" },
      { status: 500 }
    );
  }
}
