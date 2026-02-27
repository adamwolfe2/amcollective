// Data pattern: Server component with direct DB queries (consistent with Finance, Analytics, Clients pages)
// Zone isolation: Each zone is an independent async component with try/catch — one failing doesn't blank the others
// Caching: unstable_cache on expensive aggregation queries; Mercury balance + failed payments stay fresh

import { Suspense } from "react";
import Link from "next/link";
import { format, formatDistanceToNow } from "date-fns";
import { unstable_cache } from "next/cache";
import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { eq, and, sql, desc, gte, count } from "drizzle-orm";
import * as stripeConnector from "@/lib/connectors/stripe";
import * as vercelConnector from "@/lib/connectors/vercel";
import { getRecentActivity } from "@/lib/db/repositories/activity";
import { MrrChart } from "./mrr-chart";
import { CashFlowMiniChart } from "./cash-flow-mini-chart";
import { DauChart } from "./dau-chart";

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

function formatCurrency(amount: number) {
  return amount.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });
}

// ─── Cached data fetchers ───────────────────────────────────────────────────

/** MRR from active subscriptions — cached 5 min */
const getCachedMrr = unstable_cache(
  async () => {
    const [result] = await db
      .select({ total: sql<string>`COALESCE(SUM(${schema.subscriptions.amount}), 0)` })
      .from(schema.subscriptions)
      .where(eq(schema.subscriptions.status, "active"));
    const [subsCount] = await db
      .select({ value: count() })
      .from(schema.subscriptions)
      .where(eq(schema.subscriptions.status, "active"));
    return {
      mrr: Number(result?.total ?? 0) / 100,
      activeSubs: subsCount?.value ?? 0,
    };
  },
  ["dashboard-mrr"],
  { revalidate: 300 }
);

/** DAU aggregation — cached 5 min */
const getCachedDau = unstable_cache(
  async () => {
    const posthogData = await db
      .select({
        projectId: schema.posthogSnapshots.projectId,
        dau: schema.posthogSnapshots.dau,
        projectName: schema.portfolioProjects.name,
      })
      .from(schema.posthogSnapshots)
      .innerJoin(schema.portfolioProjects, eq(schema.posthogSnapshots.projectId, schema.portfolioProjects.id))
      .orderBy(desc(schema.posthogSnapshots.snapshotDate))
      .limit(20);

    const latestByProject = new Map<string, { dau: number; name: string }>();
    for (const snap of posthogData) {
      if (!latestByProject.has(snap.projectId)) {
        latestByProject.set(snap.projectId, { dau: snap.dau ?? 0, name: snap.projectName });
      }
    }
    const dauByProduct = Array.from(latestByProject.values());
    return {
      totalDau: dauByProduct.reduce((s, p) => s + p.dau, 0),
      dauProductCount: dauByProduct.length,
      dauByProduct,
    };
  },
  ["dashboard-dau"],
  { revalidate: 300 }
);

/** Stale clients — cached 5 min (expensive GROUP BY + HAVING) */
const getCachedStaleClients = unstable_cache(
  async () => {
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    return db
      .select({
        clientId: schema.clients.id,
        clientName: schema.clients.name,
        lastCardUpdate: sql<Date>`MAX(${schema.kanbanCards.updatedAt})`,
      })
      .from(schema.clients)
      .innerJoin(schema.kanbanCards, eq(schema.kanbanCards.clientId, schema.clients.id))
      .groupBy(schema.clients.id, schema.clients.name)
      .having(sql`MAX(${schema.kanbanCards.updatedAt}) < ${sevenDaysAgo}`)
      .limit(5);
  },
  ["dashboard-stale-clients"],
  { revalidate: 300 }
);

// ─── Zone 1: Metric Cards ──────────────────────────────────────────────────

async function MetricsZone() {
  try {
    const [mrrData, dauData, mercuryAccounts, totalClientsResult, overdueResult, projects, activeClientsResult, spendResult] =
      await Promise.all([
        getCachedMrr(),
        getCachedDau(),
        // Mercury balance — always fresh (no cache)
        db.select().from(schema.mercuryAccounts),
        db.select({ value: count() }).from(schema.clients),
        db
          .select({
            cnt: count(),
            total: sql<string>`COALESCE(SUM(${schema.invoices.amount}), 0)`,
          })
          .from(schema.invoices)
          .where(eq(schema.invoices.status, "overdue")),
        db
          .select({ id: schema.portfolioProjects.id, status: schema.portfolioProjects.status })
          .from(schema.portfolioProjects),
        db
          .select({ value: sql<number>`COUNT(DISTINCT ${schema.kanbanCards.clientId})` })
          .from(schema.kanbanCards)
          .where(sql`${schema.kanbanCards.completedAt} IS NULL`),
        db
          .select({ totalSpend: sql<string>`COALESCE(SUM(ABS(${schema.mercuryTransactions.amount})), 0)` })
          .from(schema.mercuryTransactions)
          .where(
            and(
              eq(schema.mercuryTransactions.direction, "debit"),
              gte(schema.mercuryTransactions.postedAt, new Date(Date.now() - 60 * 24 * 60 * 60 * 1000))
            )
          ),
      ]);

    const totalCash = mercuryAccounts.reduce((s, a) => s + Number(a.balance), 0);
    const monthlySpend = Number(spendResult[0]?.totalSpend ?? 0) / 2;
    const runway = monthlySpend > 0 ? totalCash / monthlySpend : null;
    const overdueCount = overdueResult[0]?.cnt ?? 0;
    const overdueTotal = Number(overdueResult[0]?.total ?? 0) / 100;
    const activeProjects = projects.filter((p) => p.status === "active");

    return (
      <div className="lg:col-span-3 grid grid-cols-2 lg:grid-cols-1 gap-3 lg:gap-4">
        <MetricCard
          label="MRR"
          value={formatCurrency(mrrData.mrr)}
          sub={`${mrrData.activeSubs} active sub${mrrData.activeSubs !== 1 ? "s" : ""}`}
          href="/finance"
        />
        <MetricCard
          label="Cash Position"
          value={formatCurrency(totalCash)}
          sub={runway ? `~${runway.toFixed(1)} mo runway` : "No spend data"}
          href="/finance"
        />
        <MetricCard
          label="Active Clients"
          value={String(Number(activeClientsResult[0]?.value ?? 0))}
          sub={`${totalClientsResult[0]?.value ?? 0} total`}
          href="/clients"
        />
        <MetricCard
          label="Daily Active Users"
          value={String(dauData.totalDau)}
          sub={`across ${dauData.dauProductCount} product${dauData.dauProductCount !== 1 ? "s" : ""}`}
          href="/analytics"
        />
        <MetricCard
          label="Overdue Invoices"
          value={formatCurrency(overdueTotal)}
          sub={`${overdueCount} invoice${overdueCount !== 1 ? "s" : ""}`}
          href="/invoices"
          alert={overdueCount > 0}
        />
        <MetricCard
          label="Vercel Projects"
          value={`${activeProjects.length} active`}
          sub="Portfolio"
          href="/projects"
        />
      </div>
    );
  } catch (err) {
    console.error("[Dashboard] MetricsZone failed:", err);
    return (
      <div className="lg:col-span-3">
        <div className="border border-[#0A0A0A]/10 bg-white p-6 text-center">
          <p className="text-[#0A0A0A]/40 font-mono text-xs">
            Failed to load metrics
          </p>
        </div>
      </div>
    );
  }
}

// ─── Zone 2: Charts ─────────────────────────────────────────────────────────

async function ChartsZone() {
  try {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const [revenueTrendResult, cashFlowData, dauData] = await Promise.all([
      stripeConnector.getRevenueTrend(6),
      db
        .select({
          date: sql<string>`TO_CHAR(${schema.mercuryTransactions.postedAt}, 'YYYY-MM-DD')`,
          credits: sql<string>`COALESCE(SUM(CASE WHEN ${schema.mercuryTransactions.direction} = 'credit' THEN ABS(${schema.mercuryTransactions.amount}) ELSE 0 END), 0)`,
          debits: sql<string>`COALESCE(SUM(CASE WHEN ${schema.mercuryTransactions.direction} = 'debit' THEN ABS(${schema.mercuryTransactions.amount}) ELSE 0 END), 0)`,
        })
        .from(schema.mercuryTransactions)
        .where(gte(schema.mercuryTransactions.postedAt, thirtyDaysAgo))
        .groupBy(sql`TO_CHAR(${schema.mercuryTransactions.postedAt}, 'YYYY-MM-DD')`)
        .orderBy(sql`TO_CHAR(${schema.mercuryTransactions.postedAt}, 'YYYY-MM-DD')`),
      getCachedDau(),
    ]);

    const revenueTrend = revenueTrendResult.success
      ? (revenueTrendResult.data ?? []).map((p) => ({ month: p.month, revenue: p.revenue / 100 }))
      : [];

    let balance = 0;
    const cashFlow = cashFlowData.map((d) => {
      const credits = Number(d.credits);
      const debits = Number(d.debits);
      balance += credits - debits;
      return { date: d.date ?? "", credits, debits, balance };
    });

    return (
      <div className="lg:col-span-5 space-y-6">
        <div className="border border-[#0A0A0A]/10 bg-white p-5">
          <h2 className="font-serif font-bold text-[#0A0A0A] mb-4">
            MRR Trend
          </h2>
          <MrrChart data={revenueTrend} />
        </div>

        <div className="border border-[#0A0A0A]/10 bg-white p-5">
          <h2 className="font-serif font-bold text-[#0A0A0A] mb-4">
            Cash Flow — 30 Days
          </h2>
          <CashFlowMiniChart data={cashFlow} />
        </div>

        <div className="border border-[#0A0A0A]/10 bg-white p-5">
          <h2 className="font-serif font-bold text-[#0A0A0A] mb-4">
            DAU by Product
          </h2>
          <DauChart data={dauData.dauByProduct.map((d) => ({ product: d.name, dau: d.dau }))} />
        </div>
      </div>
    );
  } catch (err) {
    console.error("[Dashboard] ChartsZone failed:", err);
    return (
      <div className="lg:col-span-5">
        <div className="border border-[#0A0A0A]/10 bg-white p-6 text-center">
          <p className="text-[#0A0A0A]/40 font-mono text-xs">
            Failed to load charts
          </p>
        </div>
      </div>
    );
  }
}

// ─── Zone 3: Action Items + Feed ────────────────────────────────────────────

async function ActionsZone() {
  try {
    const now = new Date();
    const [overdueInvoices, staleClients, deploysResult, recentActivity] = await Promise.all([
      db
        .select({
          id: schema.invoices.id,
          clientName: schema.clients.name,
          amount: schema.invoices.amount,
          dueDate: schema.invoices.dueDate,
        })
        .from(schema.invoices)
        .leftJoin(schema.clients, eq(schema.invoices.clientId, schema.clients.id))
        .where(eq(schema.invoices.status, "overdue"))
        .orderBy(schema.invoices.dueDate)
        .limit(5),
      getCachedStaleClients(),
      vercelConnector.getRecentDeployments(5),
      getRecentActivity(20),
    ]);

    const failedDeploys = deploysResult.success
      ? (deploysResult.data ?? []).filter((d) => d.state === "ERROR")
      : [];

    const actionItems: Array<{
      severity: "critical" | "warning" | "info";
      label: string;
      detail: string;
      url: string;
    }> = [];

    for (const inv of overdueInvoices) {
      const daysOverdue = inv.dueDate
        ? Math.floor((now.getTime() - new Date(inv.dueDate).getTime()) / (1000 * 60 * 60 * 24))
        : 0;
      actionItems.push({
        severity: daysOverdue > 10 ? "critical" : "warning",
        label: `Invoice overdue ${daysOverdue}d`,
        detail: `${inv.clientName ?? "Unknown"} — ${formatCurrency(inv.amount / 100)}`,
        url: `/invoices/${inv.id}`,
      });
    }

    for (const deploy of failedDeploys) {
      actionItems.push({
        severity: "critical",
        label: "Deploy failed",
        detail: deploy.name,
        url: `/projects`,
      });
    }

    for (const c of staleClients) {
      const days = Math.floor(
        (now.getTime() - new Date(c.lastCardUpdate).getTime()) / (1000 * 60 * 60 * 24)
      );
      actionItems.push({
        severity: days > 10 ? "critical" : "warning",
        label: `No activity ${days}d`,
        detail: c.clientName,
        url: `/clients/${c.clientId}/kanban`,
      });
    }

    actionItems.sort((a, b) => {
      const order = { critical: 0, warning: 1, info: 2 };
      return order[a.severity] - order[b.severity];
    });

    return (
      <div className="lg:col-span-4 space-y-6">
        {/* Action Required */}
        <div>
          <h2 className="font-serif font-bold text-[#0A0A0A] mb-3">
            Action Required
          </h2>
          {actionItems.length === 0 ? (
            <div className="border border-[#0A0A0A]/10 bg-white py-8 text-center">
              <p className="text-[#0A0A0A]/40 font-serif text-sm">
                All clear — nothing needs attention.
              </p>
            </div>
          ) : (
            <div className="border border-[#0A0A0A]/10 bg-white divide-y divide-[#0A0A0A]/5">
              {actionItems.slice(0, 8).map((item, i) => (
                <Link
                  key={i}
                  href={item.url}
                  className="px-4 py-3 flex items-start gap-3 hover:bg-[#0A0A0A]/[0.02] transition-colors block"
                >
                  <span
                    className={`w-2 h-2 rounded-full shrink-0 mt-1.5 ${
                      item.severity === "critical"
                        ? "bg-red-500"
                        : item.severity === "warning"
                          ? "bg-amber-500"
                          : "bg-emerald-500"
                    }`}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="font-mono text-xs font-medium text-[#0A0A0A]">
                      {item.label}
                    </p>
                    <p className="font-serif text-xs text-[#0A0A0A]/50 truncate">
                      {item.detail}
                    </p>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>

        {/* Recent Activity */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-serif font-bold text-[#0A0A0A]">
              Recent Activity
            </h2>
            <Link
              href="/activity"
              className="font-mono text-[10px] uppercase tracking-wider text-[#0A0A0A]/40 hover:text-[#0A0A0A]/60"
            >
              View all
            </Link>
          </div>
          {recentActivity.length === 0 ? (
            <div className="border border-[#0A0A0A]/10 bg-white py-8 text-center">
              <p className="text-[#0A0A0A]/40 font-serif text-sm">
                No activity yet.
              </p>
            </div>
          ) : (
            <div className="border border-[#0A0A0A]/10 bg-white divide-y divide-[#0A0A0A]/5">
              {recentActivity.map((entry) => (
                <div
                  key={entry.id}
                  className="px-4 py-3 flex items-center justify-between gap-3"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span className="px-1.5 py-0.5 font-mono text-[8px] uppercase tracking-wider bg-[#0A0A0A]/5 text-[#0A0A0A]/50 shrink-0">
                      {entry.action.length > 12
                        ? entry.action.slice(0, 12)
                        : entry.action}
                    </span>
                    <span className="font-serif text-xs text-[#0A0A0A]/60 truncate">
                      {entry.entityType}
                    </span>
                  </div>
                  <span className="font-mono text-[10px] text-[#0A0A0A]/30 shrink-0">
                    {formatDistanceToNow(new Date(entry.createdAt), {
                      addSuffix: true,
                    })}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  } catch (err) {
    console.error("[Dashboard] ActionsZone failed:", err);
    return (
      <div className="lg:col-span-4">
        <div className="border border-[#0A0A0A]/10 bg-white p-6 text-center">
          <p className="text-[#0A0A0A]/40 font-mono text-xs">
            Failed to load action items
          </p>
        </div>
      </div>
    );
  }
}

// ─── Zone loading fallbacks ─────────────────────────────────────────────────

function MetricsZoneSkeleton() {
  return (
    <div className="lg:col-span-3 grid grid-cols-2 lg:grid-cols-1 gap-3 lg:gap-4">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="h-24 bg-[#0A0A0A]/5 animate-pulse border border-[#0A0A0A]/10" />
      ))}
    </div>
  );
}

function ChartsZoneSkeleton() {
  return (
    <div className="lg:col-span-5 space-y-6">
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="h-[268px] bg-[#0A0A0A]/5 animate-pulse border border-[#0A0A0A]/10" />
      ))}
    </div>
  );
}

function ActionsZoneSkeleton() {
  return (
    <div className="lg:col-span-4 space-y-6">
      <div className="h-64 bg-[#0A0A0A]/5 animate-pulse border border-[#0A0A0A]/10" />
      <div className="h-80 bg-[#0A0A0A]/5 animate-pulse border border-[#0A0A0A]/10" />
    </div>
  );
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const now = new Date();

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold font-serif tracking-tight">
            {greeting()}, Adam
          </h1>
          <p className="text-[#0A0A0A]/40 font-mono text-xs mt-1">
            {format(now, "EEEE, MMMM d, yyyy")}
          </p>
        </div>
      </div>

      {/* 3-Zone Layout — each zone streams independently */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <Suspense fallback={<MetricsZoneSkeleton />}>
          <MetricsZone />
        </Suspense>
        <Suspense fallback={<ChartsZoneSkeleton />}>
          <ChartsZone />
        </Suspense>
        <Suspense fallback={<ActionsZoneSkeleton />}>
          <ActionsZone />
        </Suspense>
      </div>
    </div>
  );
}

// ─── Components ──────────────────────────────────────────────────────────────

function MetricCard({
  label,
  value,
  sub,
  href,
  alert = false,
}: {
  label: string;
  value: string;
  sub: string;
  href: string;
  alert?: boolean;
}) {
  return (
    <Link
      href={href}
      className={`block border bg-white p-5 hover:bg-[#0A0A0A]/[0.02] transition-colors ${
        alert
          ? "border-red-300 border-l-4 border-l-red-500"
          : "border-[#0A0A0A]/10"
      }`}
    >
      <span className="font-mono text-[10px] uppercase tracking-wider text-[#0A0A0A]/40">
        {label}
      </span>
      <div className="font-mono text-2xl font-bold mt-1">{value}</div>
      <span className="font-mono text-xs text-[#0A0A0A]/40">{sub}</span>
    </Link>
  );
}
