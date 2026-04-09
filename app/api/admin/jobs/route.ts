/**
 * Admin API — Inngest Jobs List
 *
 * GET /api/admin/jobs
 *
 * Returns aggregate stats for all registered Inngest functions:
 * - Last run timestamp and status
 * - Success rate over the last 24 hours
 * - p50 / p95 duration over the last 100 completed runs
 * - Retry count in last 24 hours
 * - Cron / event trigger info from the static registry
 *
 * Auth: admin or owner only (checkAdmin).
 */

import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { inngestRunHistory } from "@/lib/db/schema/inngest";
import { desc, gte, sql } from "drizzle-orm";
import { checkAdmin } from "@/lib/auth";
import { captureError } from "@/lib/errors";
import { JOB_REGISTRY } from "@/lib/inngest/registry";

export const runtime = "nodejs";

// Revalidate every 30 seconds to keep stats fresh
export const revalidate = 30;

interface DurationRow extends Record<string, unknown> {
  functionId: string;
  p50: number | null;
  p95: number | null;
}

export async function GET() {
  const userId = await checkAdmin();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const [latestRuns, statsRows, durationRows] = await Promise.all([
      // Latest run per function (DISTINCT ON is Postgres-specific, efficient)
      db
        .selectDistinctOn([inngestRunHistory.functionId], {
          functionId: inngestRunHistory.functionId,
          status: inngestRunHistory.status,
          startedAt: inngestRunHistory.startedAt,
          completedAt: inngestRunHistory.completedAt,
          durationMs: inngestRunHistory.durationMs,
          error: inngestRunHistory.error,
        })
        .from(inngestRunHistory)
        .orderBy(inngestRunHistory.functionId, desc(inngestRunHistory.startedAt)),

      // 24h aggregate stats per function
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

      // p50 / p95 over the last 100 completed runs per function.
      // Uses a raw SQL CTE to avoid Drizzle subquery typing friction.
      db.execute<DurationRow>(
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
    const rawDur = (durationRows as unknown as { rows: unknown[] }).rows ?? durationRows;
    const durRows = (Array.isArray(rawDur) ? rawDur : []) as DurationRow[];
    const durationByFn = new Map(durRows.map((r) => [r.functionId, r]));

    const jobs = JOB_REGISTRY.map((reg) => {
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
        lastRunAt: latest?.startedAt ?? null,
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

    return NextResponse.json({ jobs });
  } catch (err) {
    captureError(err, { tags: { route: "GET /api/admin/jobs" } });
    return NextResponse.json(
      { error: "Failed to load job stats" },
      { status: 500 }
    );
  }
}
