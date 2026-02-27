import Link from "next/link";
import { format, formatDistanceToNow } from "date-fns";
import { getActiveProjectCount } from "@/lib/db/repositories/projects";
import { getOpenInvoiceStats } from "@/lib/db/repositories/invoices";
import { getTeamCount } from "@/lib/db/repositories/team";
import { getRecentActivity } from "@/lib/db/repositories/activity";
import { getUnresolvedCount } from "@/lib/db/repositories/alerts";
import * as vercelConnector from "@/lib/connectors/vercel";
import * as stripeConnector from "@/lib/connectors/stripe";
import { gatherBriefingData, generateBriefing } from "@/lib/ai/agents/morning-briefing";
import { RevenueChart } from "./revenue-chart";
import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { eq, and, sql, desc, gte, lte } from "drizzle-orm";

export default async function DashboardPage() {
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const weekFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

  const [
    activeProjects,
    invoiceStats,
    teamCount,
    recentActivity,
    mrrResult,
    deploysResult,
    revenueTrendResult,
    unresolvedAlerts,
    briefingData,
    dbMrrResult,
    collectedResult,
    outstandingResult,
    atRiskRevenueResult,
    upcomingInvoices,
    recentPayments,
  ] = await Promise.all([
    getActiveProjectCount(),
    getOpenInvoiceStats(),
    getTeamCount(),
    getRecentActivity(15),
    stripeConnector.getMRR(),
    vercelConnector.getRecentDeployments(10),
    stripeConnector.getRevenueTrend(6),
    getUnresolvedCount(),
    gatherBriefingData().catch(() => null),
    // Financial Health: MRR from subscriptions
    db
      .select({ total: sql<number>`coalesce(sum(${schema.subscriptions.amount}), 0)` })
      .from(schema.subscriptions)
      .where(eq(schema.subscriptions.status, "active")),
    // Financial Health: Collected this month
    db
      .select({ total: sql<number>`coalesce(sum(${schema.invoices.amount}), 0)` })
      .from(schema.invoices)
      .where(
        and(
          eq(schema.invoices.status, "paid"),
          gte(schema.invoices.paidAt, monthStart)
        )
      ),
    // Financial Health: Outstanding
    db
      .select({ total: sql<number>`coalesce(sum(${schema.invoices.amount}), 0)` })
      .from(schema.invoices)
      .where(
        sql`${schema.invoices.status} IN ('open', 'sent', 'overdue')`
      ),
    // Financial Health: At-Risk Revenue
    db
      .select({ total: sql<number>`coalesce(sum(${schema.clients.currentMrr}), 0)` })
      .from(schema.clients)
      .where(eq(schema.clients.paymentStatus, "at_risk")),
    // Upcoming This Week: invoices due in next 7 days
    db
      .select({
        id: schema.invoices.id,
        number: schema.invoices.number,
        amount: schema.invoices.amount,
        dueDate: schema.invoices.dueDate,
        clientName: schema.clients.name,
      })
      .from(schema.invoices)
      .leftJoin(schema.clients, eq(schema.invoices.clientId, schema.clients.id))
      .where(
        and(
          sql`${schema.invoices.status} IN ('open', 'sent')`,
          gte(schema.invoices.dueDate, now),
          lte(schema.invoices.dueDate, weekFromNow)
        )
      )
      .orderBy(schema.invoices.dueDate)
      .limit(10),
    // Recent Payments Feed: last 10 payments
    db
      .select({
        id: schema.payments.id,
        amount: schema.payments.amount,
        status: schema.payments.status,
        paymentDate: schema.payments.paymentDate,
        clientName: schema.clients.name,
      })
      .from(schema.payments)
      .leftJoin(schema.clients, eq(schema.payments.clientId, schema.clients.id))
      .orderBy(desc(schema.payments.paymentDate))
      .limit(10),
  ]);

  const financialMrr = Number(dbMrrResult[0]?.total ?? 0);
  const financialCollected = Number(collectedResult[0]?.total ?? 0);
  const financialOutstanding = Number(outstandingResult[0]?.total ?? 0);
  const financialAtRisk = Number(atRiskRevenueResult[0]?.total ?? 0);

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

      {/* Financial Health */}
      <div className="mb-10">
        <h2 className="font-serif text-lg font-bold text-[#0A0A0A] mb-4">
          Financial Health
        </h2>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          {[
            { label: "MRR", value: financialMrr },
            { label: "Collected This Month", value: financialCollected },
            { label: "Outstanding", value: financialOutstanding },
            { label: "At-Risk Revenue", value: financialAtRisk },
          ].map((card) => (
            <div
              key={card.label}
              className="border border-[#0A0A0A]/10 bg-white p-5"
            >
              <p className="font-mono text-2xl font-bold text-[#0A0A0A] tracking-tight">
                ${(card.value / 100).toLocaleString("en-US", { minimumFractionDigits: 2 })}
              </p>
              <p className="font-serif text-sm text-[#0A0A0A]/50 mt-2">
                {card.label}
              </p>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Upcoming This Week */}
          <div>
            <h3 className="font-serif text-sm font-bold text-[#0A0A0A]/70 mb-3 uppercase tracking-wide">
              Upcoming This Week
            </h3>
            {upcomingInvoices.length === 0 ? (
              <div className="border border-[#0A0A0A]/10 bg-white py-8 text-center">
                <p className="text-[#0A0A0A]/40 font-serif text-sm">
                  No invoices due this week.
                </p>
              </div>
            ) : (
              <div className="border border-[#0A0A0A]/10 bg-white divide-y divide-[#0A0A0A]/5">
                {upcomingInvoices.map((inv) => (
                  <div key={inv.id} className="px-5 py-3 flex items-center justify-between gap-3">
                    <span className="font-serif text-sm text-[#0A0A0A] truncate">
                      {inv.clientName ?? "Unknown"}
                    </span>
                    <span className="font-mono text-sm text-[#0A0A0A]/70 shrink-0">
                      ${(inv.amount / 100).toLocaleString("en-US", { minimumFractionDigits: 2 })}
                      {" "}
                      <span className="text-[#0A0A0A]/40 text-xs">
                        due {inv.dueDate ? format(new Date(inv.dueDate), "MMM d") : "—"}
                      </span>
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Recent Payments Feed */}
          <div>
            <h3 className="font-serif text-sm font-bold text-[#0A0A0A]/70 mb-3 uppercase tracking-wide">
              Recent Payments
            </h3>
            {recentPayments.length === 0 ? (
              <div className="border border-[#0A0A0A]/10 bg-white py-8 text-center">
                <p className="text-[#0A0A0A]/40 font-serif text-sm">
                  No payments recorded yet.
                </p>
              </div>
            ) : (
              <div className="border border-[#0A0A0A]/10 bg-white divide-y divide-[#0A0A0A]/5">
                {recentPayments.map((pmt) => (
                  <div key={pmt.id} className="px-5 py-3 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <span
                        className={`w-2 h-2 rounded-full shrink-0 ${
                          pmt.status === "succeeded"
                            ? "bg-emerald-500"
                            : pmt.status === "failed"
                              ? "bg-red-500"
                              : pmt.status === "refunded"
                                ? "bg-amber-500"
                                : "bg-gray-400"
                        }`}
                      />
                      <span className="font-serif text-sm text-[#0A0A0A] truncate">
                        {pmt.clientName ?? "Unknown"}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <span className="font-mono text-sm text-[#0A0A0A]/70">
                        ${(pmt.amount / 100).toLocaleString("en-US", { minimumFractionDigits: 2 })}
                      </span>
                      <span className="font-mono text-[10px] text-[#0A0A0A]/30">
                        {formatDistanceToNow(new Date(pmt.paymentDate), {
                          addSuffix: true,
                        })}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Morning Briefing + Alerts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-10">
        <div>
          <h2 className="font-serif text-lg font-bold text-[#0A0A0A] mb-4">
            Morning Briefing
          </h2>
          <div className="border border-[#0A0A0A]/10 bg-white p-5">
            {briefingData ? (
              <BriefingCard data={briefingData} />
            ) : (
              <p className="text-[#0A0A0A]/40 font-serif text-sm">
                Briefing data unavailable.
              </p>
            )}
          </div>
        </div>
        <div>
          <h2 className="font-serif text-lg font-bold text-[#0A0A0A] mb-4">
            AM Agent
          </h2>
          <div className="border border-[#0A0A0A]/10 bg-white p-5 flex flex-col gap-4">
            <p className="font-serif text-sm text-[#0A0A0A]/60">
              Ask AM Agent about clients, costs, invoices, or anything else.
            </p>
            <div className="flex flex-wrap gap-2">
              {unresolvedAlerts > 0 && (
                <span className="px-2 py-1 text-xs font-mono bg-red-50 text-red-700 border border-red-200">
                  {unresolvedAlerts} unresolved alert{unresolvedAlerts !== 1 ? "s" : ""}
                </span>
              )}
            </div>
            <Link
              href="/ai"
              className="inline-flex items-center justify-center border border-[#0A0A0A] bg-[#0A0A0A] text-white px-5 py-2.5 font-mono text-xs uppercase tracking-wider hover:bg-[#0A0A0A]/90 transition-colors"
            >
              Open AM Agent
            </Link>
          </div>
        </div>
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
          <Link
            href="/ai"
            className="border border-[#0A0A0A] bg-white text-[#0A0A0A] px-5 py-2.5 font-mono text-xs uppercase tracking-wider hover:bg-[#0A0A0A]/5 transition-colors"
          >
            Ask AM Agent
          </Link>
        </div>
      </div>
    </div>
  );
}

function BriefingCard({ data }: { data: Awaited<ReturnType<typeof gatherBriefingData>> }) {
  const items = [
    {
      label: "MRR",
      value: data.mrr !== null ? `$${(data.mrr / 100).toLocaleString()}` : "Not connected",
      alert: false,
    },
    {
      label: "Failed Deploys",
      value: String(data.failedDeploys),
      alert: data.failedDeploys > 0,
    },
    {
      label: "Unresolved Alerts",
      value: String(data.unresolvedAlerts),
      alert: data.unresolvedAlerts > 0,
    },
    {
      label: "Unread Messages",
      value: String(data.unreadMessages),
      alert: data.unreadMessages > 3,
    },
    {
      label: "At-Risk Rocks",
      value: String(data.atRiskRocks),
      alert: data.atRiskRocks > 0,
    },
    {
      label: "Overdue Invoices",
      value: data.overdueInvoices > 0
        ? `${data.overdueInvoices} ($${(data.overdueAmount / 100).toLocaleString()})`
        : "0",
      alert: data.overdueInvoices > 0,
    },
  ];

  return (
    <div className="space-y-2">
      {items.map((item) => (
        <div key={item.label} className="flex items-center justify-between py-1">
          <span className="font-serif text-sm text-[#0A0A0A]/60">{item.label}</span>
          <span
            className={`font-mono text-sm ${
              item.alert ? "text-red-600 font-bold" : "text-[#0A0A0A]"
            }`}
          >
            {item.value}
          </span>
        </div>
      ))}
    </div>
  );
}
