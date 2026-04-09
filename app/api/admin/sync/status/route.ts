/**
 * Sync Status API — GET /api/admin/sync/status
 *
 * Returns the last sync run for each service, plus recent sync history,
 * plus per-connector freshness metadata (isStale, syncCount24h, errorCount24h).
 */

import { NextRequest, NextResponse } from "next/server";
import { checkAdmin } from "@/lib/auth";
import { captureError } from "@/lib/errors";
import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { desc, gte, sql } from "drizzle-orm";
import { isStale, getExpectedIntervalHours, CONNECTOR_FRESHNESS } from "@/lib/connectors/freshness";

export const runtime = "edge";
export const preferredRegion = "iad1";

export async function GET(req: NextRequest) {
  const userId = await checkAdmin();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  void req;

  try {
    const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const [latestPerService, recentRuns, stats24h, lastSuccessPerService] = await Promise.all([
      // Most recent run per service (any status)
      db
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
        .orderBy(schema.syncRuns.service, desc(schema.syncRuns.startedAt)),

      // Recent sync history (last 20 runs)
      db
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
        .limit(20),

      // 24h aggregate stats per service
      db
        .select({
          service: schema.syncRuns.service,
          syncCount24h: sql<number>`COUNT(*)::int`,
          errorCount24h: sql<number>`COUNT(*) FILTER (WHERE ${schema.syncRuns.status} = 'error')::int`,
        })
        .from(schema.syncRuns)
        .where(gte(schema.syncRuns.startedAt, since24h))
        .groupBy(schema.syncRuns.service),

      // Most recent SUCCESSFUL run per service
      db
        .selectDistinctOn([schema.syncRuns.service], {
          service: schema.syncRuns.service,
          completedAt: schema.syncRuns.completedAt,
          recordsProcessed: schema.syncRuns.recordsProcessed,
        })
        .from(schema.syncRuns)
        .where(sql`${schema.syncRuns.status} = 'success'`)
        .orderBy(schema.syncRuns.service, desc(schema.syncRuns.startedAt)),
    ]);

    // Build lookup maps
    const latestByService: Record<string, typeof latestPerService[number]> = {};
    for (const run of latestPerService) {
      latestByService[run.service] = run;
    }

    const statsByService: Record<string, { syncCount24h: number; errorCount24h: number }> = {};
    for (const row of stats24h) {
      statsByService[row.service] = {
        syncCount24h: row.syncCount24h,
        errorCount24h: row.errorCount24h,
      };
    }

    const lastSuccessByService: Record<string, { completedAt: Date | null; recordsProcessed: number | null }> = {};
    for (const row of lastSuccessPerService) {
      lastSuccessByService[row.service] = {
        completedAt: row.completedAt,
        recordsProcessed: row.recordsProcessed ?? null,
      };
    }

    // Build enriched connector list — includes all known connectors even if never synced
    const allConnectors = Object.keys(CONNECTOR_FRESHNESS);
    const seenServices = new Set([
      ...allConnectors,
      ...Object.keys(latestByService),
    ]);

    const connectors = Array.from(seenServices).map((service) => {
      const latest = latestByService[service] ?? null;
      const lastSuccess = lastSuccessByService[service] ?? null;
      const stats = statsByService[service] ?? { syncCount24h: 0, errorCount24h: 0 };
      const lastSuccessfulSyncAt = lastSuccess?.completedAt ?? null;

      let freshnessStatus: "fresh" | "stale" | "error" | "never";
      if (!lastSuccessfulSyncAt) {
        freshnessStatus = "never";
      } else if (latest?.status === "error") {
        freshnessStatus = "error";
      } else if (isStale(service, lastSuccessfulSyncAt)) {
        freshnessStatus = "stale";
      } else {
        freshnessStatus = "fresh";
      }

      return {
        service,
        lastSuccessfulSyncAt: lastSuccessfulSyncAt?.toISOString() ?? null,
        lastFailedSyncAt:
          latest?.status === "error"
            ? (latest.completedAt?.toISOString() ?? latest.startedAt?.toISOString() ?? null)
            : null,
        lastRunStatus: latest?.status ?? null,
        lastRunAt: latest?.startedAt?.toISOString() ?? null,
        rowsSynced: lastSuccess?.recordsProcessed ?? null,
        isStale: isStale(service, lastSuccessfulSyncAt),
        freshnessStatus,
        expectedIntervalHours: getExpectedIntervalHours(service),
        syncCount24h: stats.syncCount24h,
        errorCount24h: stats.errorCount24h,
      };
    });

    return NextResponse.json(
      {
        connectors,
        latestByService,
        recentRuns,
      },
      {
        headers: {
          "Cache-Control": "private, max-age=60, stale-while-revalidate=120",
        },
      }
    );
  } catch (err) {
    captureError(err, { tags: { route: "GET /api/admin/sync/status" } });
    return NextResponse.json(
      {
        error: "Failed to fetch sync status",
        message: err instanceof Error ? err.message : "Unknown",
      },
      { status: 500 }
    );
  }
}
