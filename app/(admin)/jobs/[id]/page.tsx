/**
 * /admin/jobs/[id] — Inngest Job Detail Page
 *
 * Shows the last 50 runs for a single Inngest function, including:
 * - Run timestamps and duration
 * - Success/failure status with error messages
 * - Trigger info (cron expression or event name)
 * - Attempt count (highlights retries)
 */

import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { checkAdmin } from "@/lib/auth";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { inngestRunHistory } from "@/lib/db/schema/inngest";
import { desc, eq, sql } from "drizzle-orm";
import { JOB_REGISTRY } from "@/lib/inngest/registry";
import { RunHistory } from "@/components/admin/jobs/run-history";
import { StatusBadge } from "@/components/admin/jobs/status-badge";

interface Props {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const reg = JOB_REGISTRY.find((j) => j.id === id);
  return {
    title: reg ? `${reg.name} | Jobs | AM Collective` : "Job | AM Collective",
  };
}

export default async function JobDetailPage({ params }: Props) {
  const userId = await checkAdmin();
  if (!userId) redirect("/");

  const { id: functionId } = await params;
  const registration = JOB_REGISTRY.find((j) => j.id === functionId);
  if (!registration) notFound();

  const [runs, summary] = await Promise.all([
    db
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
      .limit(50),

    db
      .select({
        total: sql<number>`COUNT(*)::int`,
        succeeded: sql<number>`COUNT(*) FILTER (WHERE ${inngestRunHistory.status} = 'completed')::int`,
        failed: sql<number>`COUNT(*) FILTER (WHERE ${inngestRunHistory.status} = 'failed')::int`,
        avgMs: sql<number>`AVG(${inngestRunHistory.durationMs})::int`,
        p50: sql<number>`PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY ${inngestRunHistory.durationMs})::int`,
        p95: sql<number>`PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY ${inngestRunHistory.durationMs})::int`,
      })
      .from(inngestRunHistory)
      .where(eq(inngestRunHistory.functionId, functionId)),
  ]);

  const stats = summary[0];
  const latestRun = runs[0] ?? null;

  function formatMs(ms: number | null): string {
    if (!ms) return "—";
    if (ms < 1000) return `${ms}ms`;
    if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
    return `${(ms / 60_000).toFixed(1)}m`;
  }

  const successRate =
    stats?.total > 0
      ? Math.round((stats.succeeded / stats.total) * 100)
      : null;

  // Serialize runs (dates → ISO strings for client component)
  const serializedRuns = runs.map((r) => ({
    ...r,
    startedAt: r.startedAt.toISOString(),
    completedAt: r.completedAt?.toISOString() ?? null,
  }));

  return (
    <div>
      {/* Breadcrumb */}
      <div className="mb-6">
        <Link
          href="/jobs"
          className="font-mono text-[10px] tracking-widest uppercase text-[#0A0A0A]/40 hover:text-[#0A0A0A] transition-colors"
        >
          Jobs
        </Link>
        <span className="font-mono text-[10px] text-[#0A0A0A]/20 mx-2">/</span>
        <span className="font-mono text-[10px] tracking-widest uppercase text-[#0A0A0A]/70">
          {registration.name}
        </span>
      </div>

      {/* Header */}
      <div className="flex items-start justify-between mb-8 gap-4">
        <div>
          <h1 className="text-2xl font-bold font-serif tracking-tight">
            {registration.name}
          </h1>
          <p className="font-mono text-[10px] text-[#0A0A0A]/40 mt-1">
            {registration.id}
          </p>
        </div>
        {latestRun && (
          <StatusBadge
            status={
              latestRun.status as
                | "completed"
                | "failed"
                | "running"
                | "queued"
                | null
            }
          />
        )}
      </div>

      {/* Trigger info */}
      <div className="border border-[#0A0A0A]/10 bg-white p-4 mb-6">
        <p className="font-mono text-[10px] tracking-widest uppercase text-[#0A0A0A]/40 mb-2">
          Trigger
        </p>
        {registration.cron && (
          <p className="font-mono text-sm text-[#0A0A0A]">
            <span className="text-[#0A0A0A]/40 mr-2">cron</span>
            {registration.cron}
          </p>
        )}
        {registration.events.length > 0 && (
          <div className="space-y-1">
            {registration.events.map((e) => (
              <p key={e} className="font-mono text-sm text-[#0A0A0A]">
                <span className="text-[#0A0A0A]/40 mr-2">event</span>
                {e}
              </p>
            ))}
          </div>
        )}
        {!registration.cron && registration.events.length === 0 && (
          <p className="font-mono text-sm text-[#0A0A0A]/40">Not specified</p>
        )}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-4 mb-8">
        <div className="border border-[#0A0A0A]/10 bg-white p-4">
          <p className="font-mono text-xl font-bold text-[#0A0A0A]">
            {stats?.total ?? 0}
          </p>
          <p className="font-serif text-xs text-[#0A0A0A]/50 mt-1">
            Total Runs
          </p>
        </div>
        <div className="border border-[#0A0A0A]/10 bg-white p-4">
          <p className="font-mono text-xl font-bold text-[#0A0A0A]">
            {stats?.succeeded ?? 0}
          </p>
          <p className="font-serif text-xs text-[#0A0A0A]/50 mt-1">
            Succeeded
          </p>
        </div>
        <div className="border border-[#0A0A0A]/10 bg-white p-4">
          <p
            className={`font-mono text-xl font-bold ${
              (stats?.failed ?? 0) > 0 ? "text-red-600" : "text-[#0A0A0A]"
            }`}
          >
            {stats?.failed ?? 0}
          </p>
          <p className="font-serif text-xs text-[#0A0A0A]/50 mt-1">Failed</p>
        </div>
        <div className="border border-[#0A0A0A]/10 bg-white p-4">
          <p
            className={`font-mono text-xl font-bold ${
              successRate === null
                ? "text-[#0A0A0A]/30"
                : successRate >= 95
                  ? "text-[#0A0A0A]"
                  : successRate >= 75
                    ? "text-amber-700"
                    : "text-red-700"
            }`}
          >
            {successRate !== null ? `${successRate}%` : "—"}
          </p>
          <p className="font-serif text-xs text-[#0A0A0A]/50 mt-1">
            Success Rate
          </p>
        </div>
        <div className="border border-[#0A0A0A]/10 bg-white p-4">
          <p className="font-mono text-xl font-bold text-[#0A0A0A]">
            {formatMs(stats?.p50 ?? null)}
          </p>
          <p className="font-serif text-xs text-[#0A0A0A]/50 mt-1">
            p50 / <span className="text-[#0A0A0A]/30">{formatMs(stats?.p95 ?? null)}</span>
          </p>
        </div>
      </div>

      {/* Run History */}
      <div className="mb-4 flex items-center justify-between">
        <h2 className="font-serif font-bold text-lg">
          Last 50 Runs
        </h2>
        <span className="font-mono text-[10px] text-[#0A0A0A]/40">
          Click a failed row to expand error details
        </span>
      </div>
      <div className="border border-[#0A0A0A]/10 bg-[#F3F3EF]">
        <RunHistory
          runs={serializedRuns}
          functionName={registration.name}
        />
      </div>
    </div>
  );
}
