import Link from "next/link";
import { formatDistanceToNow } from "date-fns";
import { getClientCount } from "@/lib/db/repositories/clients";
import { getActiveProjectCount } from "@/lib/db/repositories/projects";
import { getOpenInvoiceStats } from "@/lib/db/repositories/invoices";
import { getTeamCount } from "@/lib/db/repositories/team";
import { getRecentActivity } from "@/lib/db/repositories/activity";

export default async function DashboardPage() {
  const [clientCount, activeProjects, invoiceStats, teamCount, recentActivity] =
    await Promise.all([
      getClientCount(),
      getActiveProjectCount(),
      getOpenInvoiceStats(),
      getTeamCount(),
      getRecentActivity(10),
    ]);

  const kpis = [
    { label: "Total Clients", value: clientCount },
    { label: "Active Projects", value: activeProjects },
    {
      label: "Open Invoices",
      value: invoiceStats.count,
      sub: `$${(invoiceStats.totalCents / 100).toLocaleString("en-US", { minimumFractionDigits: 2 })}`,
    },
    { label: "Team Size", value: teamCount },
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
          </div>
        ))}
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
            href="/team"
            className="border border-[#0A0A0A] bg-white text-[#0A0A0A] px-5 py-2.5 font-mono text-xs uppercase tracking-wider hover:bg-[#0A0A0A]/5 transition-colors"
          >
            Add Member
          </Link>
        </div>
      </div>
    </div>
  );
}
