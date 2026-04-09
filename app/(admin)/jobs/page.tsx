/**
 * /admin/jobs — Inngest Job Observability Dashboard
 *
 * Shows all registered background jobs with aggregate stats:
 * last run, status, 24h success rate, p50/p95 duration, retry count.
 *
 * Data is fetched server-side from the inngest_run_history table.
 * The table is populated by the runHistoryMiddleware in lib/inngest/middleware.ts.
 *
 * NOTE: Jobs that have never run appear with "Never" and no stats.
 * This is expected for event-triggered jobs that haven't been invoked yet.
 */

import type { Metadata } from "next";
import { Suspense } from "react";
import { checkAdmin } from "@/lib/auth";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { inngestRunHistory } from "@/lib/db/schema/inngest";
import { desc, gte, sql } from "drizzle-orm";
import { JOB_REGISTRY } from "@/lib/inngest/registry";
import { JobsTable } from "@/components/admin/jobs/jobs-table";
import { Skeleton } from "@/components/ui/skeleton";

export const metadata: Metadata = {
  title: "Jobs | AM Collective",
};

export const revalidate = 30;

interface DurationRow extends Record<string, unknown> {
  functionId: string;
  p50: number | null;
  p95: number | null;
}

async function loadJobStats() {
  const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000);

  const [latestRuns, statsRows, durationResult] = await Promise.all([
    db
      .selectDistinctOn([inngestRunHistory.functionId], {
        functionId: inngestRunHistory.functionId,
        status: inngestRunHistory.status,
        startedAt: inngestRunHistory.startedAt,
        durationMs: inngestRunHistory.durationMs,
        error: inngestRunHistory.error,
      })
      .from(inngestRunHistory)
      .orderBy(inngestRunHistory.functionId, desc(inngestRunHistory.startedAt)),

    db
      .select({
        functionId: inngestRunHistory.functionId,
        total24h: sql<number>`COUNT(*)::int`,
        success24h: sql<number>`COUNT(*) FILTER (WHERE ${inngestRunHistory.status} = 'completed')::int`,
        failed24h: sql<number>`COUNT(*) FILTER (WHERE ${inngestRunHistory.status} = 'failed')::int`,
        retries24h: sql<number>`SUM(GREATEST(${inngestRunHistory.attemptNumber} - 1, 0))::int`,
      })
      .from(inngestRunHistory)
      .where(gte(inngestRunHistory.startedAt, since24h))
      .groupBy(inngestRunHistory.functionId),

    db.execute(
      sql`
        WITH ranked AS (
          SELECT
            function_id,
            duration_ms,
            ROW_NUMBER() OVER (
              PARTITION BY function_id
              ORDER BY started_at DESC
            ) AS rn
          FROM inngest_run_history
          WHERE status = 'completed'
            AND duration_ms IS NOT NULL
        )
        SELECT
          function_id  AS "functionId",
          PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY duration_ms)::int AS p50,
          PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY duration_ms)::int AS p95
        FROM ranked
        WHERE rn <= 100
        GROUP BY function_id
      `
    ),
  ]);

  const latestByFn = new Map(latestRuns.map((r) => [r.functionId, r]));
  const statsByFn = new Map(statsRows.map((r) => [r.functionId, r]));
  // db.execute returns { rows: ... } in neon-http driver
  const rawDur = (durationResult as unknown as { rows: unknown[] }).rows ?? durationResult;
  const durRows = (Array.isArray(rawDur) ? rawDur : []) as DurationRow[];
  const durationByFn = new Map(durRows.map((r) => [r.functionId, r]));

  return JOB_REGISTRY.map((reg) => {
    const latest = latestByFn.get(reg.id);
    const stats = statsByFn.get(reg.id);
    const dur = durationByFn.get(reg.id);
    const successRate =
      stats && stats.total24h > 0
        ? Math.round((stats.success24h / stats.total24h) * 100)
        : null;

    return {
      id: reg.id,
      name: reg.name,
      cron: reg.cron,
      events: reg.events,
      lastRunAt: latest?.startedAt?.toISOString() ?? null,
      lastRunStatus: latest?.status ?? null,
      lastRunDurationMs: latest?.durationMs ?? null,
      lastRunError: latest?.error ?? null,
      successRate24h: successRate,
      total24h: stats?.total24h ?? 0,
      failed24h: stats?.failed24h ?? 0,
      retries24h: stats?.retries24h ?? 0,
      p50Ms: dur?.p50 ?? null,
      p95Ms: dur?.p95 ?? null,
    };
  });
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

async function JobsContent() {
  const jobs = await loadJobStats();

  const totalJobs = jobs.length;
  const failedRecently = jobs.filter((j) => j.lastRunStatus === "failed").length;
  const neverRun = jobs.filter((j) => j.lastRunAt === null).length;
  const healthy = totalJobs - failedRecently - neverRun;

  return (
    <>
      {/* KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
        <div className="border border-[#0A0A0A]/10 bg-white p-4">
          <p className="font-mono text-2xl font-bold text-[#0A0A0A]">
            {totalJobs}
          </p>
          <p className="font-serif text-xs text-[#0A0A0A]/50 mt-1">
            Registered Jobs
          </p>
        </div>
        <div className="border border-[#0A0A0A]/10 bg-white p-4">
          <p className="font-mono text-2xl font-bold text-[#0A0A0A]">
            {healthy}
          </p>
          <p className="font-serif text-xs text-[#0A0A0A]/50 mt-1">
            Last Run OK
          </p>
        </div>
        <div className="border border-[#0A0A0A]/10 bg-white p-4">
          <p
            className={`font-mono text-2xl font-bold ${
              failedRecently > 0 ? "text-red-600" : "text-[#0A0A0A]"
            }`}
          >
            {failedRecently}
          </p>
          <p className="font-serif text-xs text-[#0A0A0A]/50 mt-1">
            Last Run Failed
          </p>
        </div>
        <div className="border border-[#0A0A0A]/10 bg-white p-4">
          <p className="font-mono text-2xl font-bold text-[#0A0A0A]/40">
            {neverRun}
          </p>
          <p className="font-serif text-xs text-[#0A0A0A]/50 mt-1">
            Never Run
          </p>
        </div>
      </div>

      {/* Table */}
      <div className="border border-[#0A0A0A]/10 bg-[#F3F3EF] p-4 md:p-6">
        <JobsTable initialJobs={jobs} />
      </div>
    </>
  );
}

export default async function JobsPage() {
  const userId = await checkAdmin();
  if (!userId) redirect("/");

  return (
    <div>
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold font-serif tracking-tight">
          Background Jobs
        </h1>
        <p className="font-mono text-xs text-[#0A0A0A]/40 mt-1">
          Observability dashboard for all Inngest functions. Stats sourced from
          local run history captured via middleware.
        </p>
      </div>

      <Suspense fallback={<TableSkeleton />}>
        <JobsContent />
      </Suspense>
    </div>
  );
}
