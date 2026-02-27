import Link from "next/link";
import { formatDistanceToNow } from "date-fns";
import { getActiveProjectCount } from "@/lib/db/repositories/projects";
import { getOpenInvoiceStats } from "@/lib/db/repositories/invoices";
import { getTeamCount } from "@/lib/db/repositories/team";
import { getRecentActivity } from "@/lib/db/repositories/activity";
import * as vercelConnector from "@/lib/connectors/vercel";
import * as stripeConnector from "@/lib/connectors/stripe";
import { RevenueChart } from "./revenue-chart";

export default async function DashboardPage() {
  const [
    activeProjects,
    invoiceStats,
    teamCount,
    recentActivity,
    mrrResult,
    deploysResult,
    revenueTrendResult,
  ] = await Promise.all([
    getActiveProjectCount(),
    getOpenInvoiceStats(),
    getTeamCount(),
    getRecentActivity(15),
    stripeConnector.getMRR(),
    vercelConnector.getRecentDeployments(10),
    stripeConnector.getRevenueTrend(6),
  ]);

  const mrr = mrrResult.success ? mrrResult.data?.mrr ?? 0 : null;
  const deploys = deploysResult.success ? deploysResult.data ?? [] : [];
  const revenueTrend = revenueTrendResult.success
    ? revenueTrendResult.data ?? []
    : [];

  const kpis = [
    {
      label: "Monthly Revenue",
      value: mrr !== null ? `$${(mrr / 100).toLocaleString()}` : "--",
      sub: mrr !== null
        ? `${mrrResult.data?.activeSubscriptions ?? 0} active subs`
        : "Stripe not connected",
      connected: mrr !== null,
    },
    {
      label: "Active Projects",
      value: activeProjects,
      connected: true,
    },
    {
      label: "Open Invoices",
      value: invoiceStats.count,
      sub: `$${(invoiceStats.totalCents / 100).toLocaleString("en-US", { minimumFractionDigits: 2 })}`,
      connected: true,
    },
    {
      label: "Team Size",
      value: teamCount,
      connected: true,
    },
  ];

  return (
    <div>
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold font-serif tracking-tight">
          Dashboard
        </h1>
        <p className="text-[#0A0A0A]/40 font-mono text-xs mt-1">
          AM Collective Operations
        </p>
      </div>

      {/* KPI Row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-10">
        {kpis.map((kpi) => (
          <div
            key={kpi.label}
            className="border border-[#0A0A0A]/10 bg-white p-5"
          >
            <p className="font-mono text-3xl font-bold text-[#0A0A0A] tracking-tight">
              {kpi.value}
            </p>
            {kpi.sub && (
              <p className="font-mono text-sm text-[#0A0A0A]/50 mt-0.5">
                {kpi.sub}
              </p>
            )}
            <p className="font-serif text-sm text-[#0A0A0A]/50 mt-2">
              {kpi.label}
            </p>
            {!kpi.connected && (
              <p className="font-mono text-[10px] text-amber-600 mt-1">
                Connection needed
              </p>
            )}
          </div>
        ))}
      </div>

      {/* Two-column layout: Deploys + Revenue Chart */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-10">
        {/* Deploy Activity */}
        <div>
          <h2 className="font-serif text-lg font-bold text-[#0A0A0A] mb-4">
            Recent Deploys
          </h2>
          {deploys.length === 0 ? (
            <div className="border border-[#0A0A0A]/10 py-12 text-center">
              <p className="text-[#0A0A0A]/40 font-serif">
                {deploysResult.success
                  ? "No recent deployments."
                  : "Vercel not connected"}
              </p>
              {!deploysResult.success && (
                <p className="text-[#0A0A0A]/25 font-mono text-xs mt-1">
                  {deploysResult.error}
                </p>
              )}
            </div>
          ) : (
            <div className="border border-[#0A0A0A]/10 bg-white divide-y divide-[#0A0A0A]/5">
              {deploys.map((deploy) => (
                <div
                  key={deploy.uid}
                  className="px-5 py-3 flex items-center justify-between gap-3"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <span
                      className={`w-2 h-2 rounded-full shrink-0 ${
                        deploy.state === "READY"
                          ? "bg-emerald-500"
                          : deploy.state === "ERROR"
                            ? "bg-red-500"
                            : deploy.state === "BUILDING"
                              ? "bg-amber-500"
                              : "bg-gray-400"
                      }`}
                    />
                    <span className="font-mono text-xs font-medium text-[#0A0A0A] truncate">
                      {deploy.name}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <span className="font-mono text-[10px] text-[#0A0A0A]/40 max-w-32 truncate hidden sm:block">
                      {deploy.meta?.githubCommitMessage ?? ""}
                    </span>
                    <span className="font-mono text-[10px] text-[#0A0A0A]/30">
                      {formatDistanceToNow(new Date(deploy.created), {
                        addSuffix: true,
                      })}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Revenue Chart */}
        <div>
          <h2 className="font-serif text-lg font-bold text-[#0A0A0A] mb-4">
            Revenue Trend
          </h2>
          {revenueTrend.length === 0 ? (
            <div className="border border-[#0A0A0A]/10 py-12 text-center">
              <p className="text-[#0A0A0A]/40 font-serif">
                {revenueTrendResult.success
                  ? "No revenue data yet."
                  : "Stripe not connected"}
              </p>
            </div>
          ) : (
            <div className="border border-[#0A0A0A]/10 bg-white p-5">
              <RevenueChart
                data={revenueTrend.map((p) => ({
                  month: p.month,
                  revenue: p.revenue / 100,
                }))}
              />
            </div>
          )}
        </div>
      </div>

      {/* Recent Activity */}
      <div className="mb-10">
        <h2 className="font-serif text-lg font-bold text-[#0A0A0A] mb-4">
          Recent Activity
        </h2>
        {recentActivity.length === 0 ? (
          <div className="border border-[#0A0A0A]/10 py-12 text-center">
            <p className="text-[#0A0A0A]/40 font-serif">
              No activity recorded yet.
            </p>
            <p className="text-[#0A0A0A]/25 font-mono text-xs mt-1">
              Actions will appear here as you use the system.
            </p>
          </div>
        ) : (
          <div className="border border-[#0A0A0A]/10 bg-white divide-y divide-[#0A0A0A]/5">
            {recentActivity.map((entry) => (
              <div
                key={entry.id}
                className="px-5 py-3.5 flex items-center justify-between gap-4"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <span className="font-mono text-xs font-medium text-[#0A0A0A] uppercase shrink-0">
                    {entry.action}
                  </span>
                  <span className="font-serif text-sm text-[#0A0A0A]/60 truncate">
                    {entry.entityType}
                    <span className="text-[#0A0A0A]/30 mx-1">/</span>
                    <span className="font-mono text-xs text-[#0A0A0A]/40">
                      {entry.entityId.length > 12
                        ? `${entry.entityId.slice(0, 12)}...`
                        : entry.entityId}
                    </span>
                  </span>
                </div>
                <span className="font-mono text-[11px] text-[#0A0A0A]/30 shrink-0">
                  {formatDistanceToNow(new Date(entry.createdAt), {
                    addSuffix: true,
                  })}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Quick Actions */}
      <div>
        <h2 className="font-serif text-lg font-bold text-[#0A0A0A] mb-4">
          Quick Actions
        </h2>
        <div className="flex flex-wrap gap-3">
          <Link
            href="/clients"
            className="border border-[#0A0A0A] bg-[#0A0A0A] text-white px-5 py-2.5 font-mono text-xs uppercase tracking-wider hover:bg-[#0A0A0A]/90 transition-colors"
          >
            Add Client
          </Link>
          <Link
            href="/invoices"
            className="border border-[#0A0A0A] bg-white text-[#0A0A0A] px-5 py-2.5 font-mono text-xs uppercase tracking-wider hover:bg-[#0A0A0A]/5 transition-colors"
          >
            Create Invoice
          </Link>
          <Link
            href="/costs"
            className="border border-[#0A0A0A] bg-white text-[#0A0A0A] px-5 py-2.5 font-mono text-xs uppercase tracking-wider hover:bg-[#0A0A0A]/5 transition-colors"
          >
            View Costs
          </Link>
        </div>
      </div>
    </div>
  );
}
