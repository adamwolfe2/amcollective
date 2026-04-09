/**
 * /admin/system-health — Connector Freshness Dashboard
 *
 * Shows live sync health for all 16 connectors: last sync time, freshness
 * status (Fresh/Stale/Error/Never), rows synced, 24h stats, and a force-sync
 * action per connector. Expanding a row shows the last 10 sync runs.
 *
 * Data fetched server-side from sync_runs table. Revalidates every 60s.
 */

import type { Metadata } from "next";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { checkAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { desc, gte, sql } from "drizzle-orm";
import { isStale, getExpectedIntervalHours, CONNECTOR_FRESHNESS } from "@/lib/connectors/freshness";
import { Skeleton } from "@/components/ui/skeleton";
import { ConnectorHealthTable } from "@/components/admin/system-health/connector-health-table";
import type { ConnectorRow, RecentRun } from "@/components/admin/system-health/connector-health-table";

export const metadata: Metadata = {
  title: "System Health | AM Collective",
};

export const revalidate = 60;

async function loadHealthData(): Promise<{
  connectors: ConnectorRow[];
  recentRuns: RecentRun[];
}> {
  const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000);

  const [latestPerService, recentRunsRaw, stats24h, lastSuccessPerService] =
    await Promise.all([
      // Most recent run per service (any status)
      db
        .selectDistinctOn([schema.syncRuns.service], {
          service: schema.syncRuns.service,
          status: schema.syncRuns.status,
          startedAt: schema.syncRuns.startedAt,
          completedAt: schema.syncRuns.completedAt,
        })
        .from(schema.syncRuns)
        .orderBy(schema.syncRuns.service, desc(schema.syncRuns.startedAt)),

      // Recent sync history (last 100 runs — enough for 10 per connector)
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
        .limit(100),

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

      // Most recent successful run per service
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
  const latestByService = new Map(latestPerService.map((r) => [r.service, r]));
  const statsByService = new Map(stats24h.map((r) => [r.service, r]));
  const lastSuccessByService = new Map(
    lastSuccessPerService.map((r) => [r.service, r])
  );

  // All known connectors + any in DB we don't recognize
  const allServices = new Set([
    ...Object.keys(CONNECTOR_FRESHNESS),
    ...latestByService.keys(),
  ]);

  const connectors: ConnectorRow[] = Array.from(allServices).map((service) => {
    const latest = latestByService.get(service) ?? null;
    const lastSuccess = lastSuccessByService.get(service) ?? null;
    const stats = statsByService.get(service) ?? {
      syncCount24h: 0,
      errorCount24h: 0,
    };
    const lastSuccessfulSyncAt = lastSuccess?.completedAt ?? null;

    let freshnessStatus: ConnectorRow["freshnessStatus"];
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
          ? (latest.completedAt?.toISOString() ??
              latest.startedAt?.toISOString() ??
              null)
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

  const recentRuns: RecentRun[] = recentRunsRaw.map((r) => ({
    id: r.id,
    service: r.service,
    status: r.status,
    recordsProcessed: r.recordsProcessed ?? null,
    errorMessage: r.errorMessage ?? null,
    startedAt: r.startedAt?.toISOString() ?? null,
    completedAt: r.completedAt?.toISOString() ?? null,
  }));

  return { connectors, recentRuns };
}

function TableSkeleton() {
  return (
    <div className="space-y-2">
      {Array.from({ length: 8 }).map((_, i) => (
        <Skeleton key={i} className="h-12 w-full" />
      ))}
    </div>
  );
}

async function HealthContent() {
  const { connectors, recentRuns } = await loadHealthData();

  const fresh = connectors.filter((c) => c.freshnessStatus === "fresh").length;
  const stale = connectors.filter((c) => c.freshnessStatus === "stale").length;
  const error = connectors.filter((c) => c.freshnessStatus === "error").length;
  const never = connectors.filter((c) => c.freshnessStatus === "never").length;

  return (
    <>
      {/* KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
        <div className="border border-[#0A0A0A]/10 bg-white p-4">
          <p className="font-mono text-2xl font-bold text-[#0A0A0A]">{fresh}</p>
          <p className="font-serif text-xs text-[#0A0A0A]/50 mt-1">Fresh</p>
        </div>
        <div className="border border-[#0A0A0A]/10 bg-white p-4">
          <p
            className={`font-mono text-2xl font-bold ${
              stale > 0 ? "text-amber-700" : "text-[#0A0A0A]"
            }`}
          >
            {stale}
          </p>
          <p className="font-serif text-xs text-[#0A0A0A]/50 mt-1">Stale</p>
        </div>
        <div className="border border-[#0A0A0A]/10 bg-white p-4">
          <p
            className={`font-mono text-2xl font-bold ${
              error > 0 ? "text-red-600" : "text-[#0A0A0A]"
            }`}
          >
            {error}
          </p>
          <p className="font-serif text-xs text-[#0A0A0A]/50 mt-1">Error</p>
        </div>
        <div className="border border-[#0A0A0A]/10 bg-white p-4">
          <p className="font-mono text-2xl font-bold text-[#0A0A0A]/40">
            {never}
          </p>
          <p className="font-serif text-xs text-[#0A0A0A]/50 mt-1">Never Synced</p>
        </div>
      </div>

      {/* Connector table */}
      <div className="border border-[#0A0A0A]/10 bg-[#F3F3EF] p-4 md:p-6">
        <ConnectorHealthTable connectors={connectors} recentRuns={recentRuns} />
      </div>
    </>
  );
}

export default async function SystemHealthPage() {
  const userId = await checkAdmin();
  if (!userId) redirect("/");

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-bold font-serif tracking-tight">
          System Health
        </h1>
        <p className="font-mono text-xs text-[#0A0A0A]/40 mt-1">
          Connector freshness monitoring. Stale connectors are alerted via Sentry
          every 30 minutes. Force-sync triggers the appropriate Inngest job.
        </p>
      </div>

      <Suspense fallback={<TableSkeleton />}>
        <HealthContent />
      </Suspense>
    </div>
  );
}
