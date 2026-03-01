import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { desc, eq, sql, and, gte, asc } from "drizzle-orm";
import { formatCents } from "@/lib/stripe/format";
import { CostTrendChart } from "./cost-trend-chart";
import { SyncButton } from "./sync-button";

async function getSubscriptionCosts() {
  const subscriptions = await db
    .select()
    .from(schema.subscriptionCosts)
    .where(eq(schema.subscriptionCosts.isActive, true))
    .orderBy(asc(schema.subscriptionCosts.nextRenewal));

  return subscriptions;
}

async function getCostSummary() {
  const now = new Date();
  const threeMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 3, 1);

  // Get all tool accounts with their total costs for this period
  const accounts = await db
    .select({
      id: schema.toolAccounts.id,
      name: schema.toolAccounts.name,
      monthlyBudget: schema.toolAccounts.monthlyBudget,
      totalCost: sql<number>`COALESCE(SUM(${schema.toolCosts.amount}), 0)`.as("total_cost"),
    })
    .from(schema.toolAccounts)
    .leftJoin(
      schema.toolCosts,
      and(
        eq(schema.toolCosts.toolAccountId, schema.toolAccounts.id),
        gte(schema.toolCosts.createdAt, threeMonthsAgo)
      )
    )
    .groupBy(schema.toolAccounts.id);

  return accounts;
}

async function getPerProjectCosts() {
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  const costs = await db
    .select({
      projectId: schema.portfolioProjects.id,
      projectName: schema.portfolioProjects.name,
      projectSlug: schema.portfolioProjects.slug,
      totalCost: sql<number>`COALESCE(SUM(${schema.toolCosts.amount}), 0)`.as("total_cost"),
    })
    .from(schema.portfolioProjects)
    .leftJoin(
      schema.toolCosts,
      and(
        eq(schema.toolCosts.projectId, schema.portfolioProjects.id),
        gte(schema.toolCosts.createdAt, monthStart)
      )
    )
    .groupBy(schema.portfolioProjects.id)
    .orderBy(desc(sql`total_cost`));

  return costs;
}

async function getClientMargins() {
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  // Get clients with their invoice revenue this month
  const clients = await db
    .select({
      clientId: schema.clients.id,
      clientName: schema.clients.name,
      companyName: schema.clients.companyName,
      revenue: sql<number>`COALESCE(SUM(CASE WHEN ${schema.invoices.status} = 'paid' THEN ${schema.invoices.amount} ELSE 0 END), 0)`.as("revenue"),
    })
    .from(schema.clients)
    .leftJoin(
      schema.invoices,
      and(
        eq(schema.invoices.clientId, schema.clients.id),
        gte(schema.invoices.createdAt, monthStart)
      )
    )
    .groupBy(schema.clients.id);

  // Get project costs per client (via clientProjects join)
  const clientCosts = await db
    .select({
      clientId: schema.clientProjects.clientId,
      totalCost: sql<number>`COALESCE(SUM(${schema.toolCosts.amount}), 0)`.as("total_cost"),
    })
    .from(schema.clientProjects)
    .leftJoin(
      schema.toolCosts,
      and(
        eq(schema.toolCosts.projectId, schema.clientProjects.projectId),
        gte(schema.toolCosts.createdAt, monthStart)
      )
    )
    .groupBy(schema.clientProjects.clientId);

  const costMap = new Map(clientCosts.map((c) => [c.clientId, c.totalCost]));

  return clients.map((c) => {
    const costs = costMap.get(c.clientId) ?? 0;
    const revenue = c.revenue;
    const margin = revenue > 0 ? revenue - costs : 0;
    const marginPct = revenue > 0 ? ((margin / revenue) * 100) : 0;
    return {
      ...c,
      costs,
      margin,
      marginPct: Math.round(marginPct * 10) / 10,
    };
  });
}

async function getCostTrend() {
  const now = new Date();
  const threeMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 3, 1);

  const trend = await db
    .select({
      month: sql<string>`TO_CHAR(${schema.toolCosts.createdAt}, 'YYYY-MM')`.as("month"),
      total: sql<number>`COALESCE(SUM(${schema.toolCosts.amount}), 0)`.as("total"),
    })
    .from(schema.toolCosts)
    .where(gte(schema.toolCosts.createdAt, threeMonthsAgo))
    .groupBy(sql`TO_CHAR(${schema.toolCosts.createdAt}, 'YYYY-MM')`)
    .orderBy(sql`month`);

  return trend;
}

export default async function CostsPage() {
  const [costSummary, projectCosts, clientMargins, costTrend, subscriptionCosts] =
    await Promise.all([
      getCostSummary(),
      getPerProjectCosts(),
      getClientMargins(),
      getCostTrend(),
      getSubscriptionCosts(),
    ]);

  // Calculate subscription monthly total (normalize annual → monthly)
  const subscriptionMonthlyTotal = subscriptionCosts.reduce((sum, sub) => {
    const monthly = sub.billingCycle === "annual" ? Math.round(sub.amount / 12) : sub.amount;
    return sum + monthly;
  }, 0);

  const totalMonthlySpend = costSummary.reduce(
    (sum, a) => sum + Number(a.totalCost),
    0
  ) + subscriptionMonthlyTotal;

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold font-serif tracking-tight">
            Costs
          </h1>
          <p className="text-[#0A0A0A]/40 font-mono text-xs mt-1">
            Infrastructure spend across all projects
          </p>
        </div>
        <SyncButton />
      </div>

      {/* Cost Overview Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-10">
        <div className="border border-[#0A0A0A]/10 bg-white p-5">
          <p className="font-mono text-3xl font-bold text-[#0A0A0A] tracking-tight">
            {formatCents(totalMonthlySpend)}
          </p>
          <p className="font-serif text-sm text-[#0A0A0A]/50 mt-2">
            Total Monthly Spend
          </p>
        </div>
        {costSummary.slice(0, 3).map((account) => (
          <div
            key={account.id}
            className="border border-[#0A0A0A]/10 bg-white p-5"
          >
            <p className="font-mono text-3xl font-bold text-[#0A0A0A] tracking-tight">
              {formatCents(Number(account.totalCost))}
            </p>
            <p className="font-serif text-sm text-[#0A0A0A]/50 mt-2">
              {account.name}
            </p>
            {account.monthlyBudget && (
              <p className="font-mono text-[10px] text-[#0A0A0A]/30 mt-1">
                Budget: {formatCents(account.monthlyBudget)}
              </p>
            )}
          </div>
        ))}
      </div>

      {/* Tool Breakdown Table */}
      {costSummary.length > 3 && (
        <div className="mb-10">
          <h2 className="font-serif text-lg font-bold text-[#0A0A0A] mb-4">
            All Tools
          </h2>
          <div className="border border-[#0A0A0A]/10 bg-white">
            <table className="w-full">
              <thead>
                <tr className="border-b border-[#0A0A0A]/10">
                  <th className="text-left px-5 py-3 font-mono text-xs uppercase text-[#0A0A0A]/50">
                    Tool
                  </th>
                  <th className="text-right px-5 py-3 font-mono text-xs uppercase text-[#0A0A0A]/50">
                    Spend
                  </th>
                  <th className="text-right px-5 py-3 font-mono text-xs uppercase text-[#0A0A0A]/50">
                    Budget
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#0A0A0A]/5">
                {costSummary.map((account) => (
                  <tr key={account.id}>
                    <td className="px-5 py-3 font-serif text-sm">
                      {account.name}
                    </td>
                    <td className="px-5 py-3 text-right font-mono text-sm">
                      {formatCents(Number(account.totalCost))}
                    </td>
                    <td className="px-5 py-3 text-right font-mono text-sm text-[#0A0A0A]/40">
                      {account.monthlyBudget
                        ? formatCents(account.monthlyBudget)
                        : "--"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Subscriptions Table */}
      {subscriptionCosts.length > 0 && (
        <div className="mb-10">
          <h2 className="font-serif text-lg font-bold text-[#0A0A0A] mb-4">
            Subscriptions ({subscriptionCosts.length})
          </h2>
          <div className="border border-[#0A0A0A]/10 bg-white">
            <table className="w-full">
              <thead>
                <tr className="border-b border-[#0A0A0A]/10">
                  <th className="text-left px-5 py-3 font-mono text-xs uppercase text-[#0A0A0A]/50">
                    Name
                  </th>
                  <th className="text-left px-5 py-3 font-mono text-xs uppercase text-[#0A0A0A]/50">
                    Project
                  </th>
                  <th className="text-left px-5 py-3 font-mono text-xs uppercase text-[#0A0A0A]/50">
                    Category
                  </th>
                  <th className="text-right px-5 py-3 font-mono text-xs uppercase text-[#0A0A0A]/50">
                    Monthly
                  </th>
                  <th className="text-right px-5 py-3 font-mono text-xs uppercase text-[#0A0A0A]/50">
                    Cycle
                  </th>
                  <th className="text-right px-5 py-3 font-mono text-xs uppercase text-[#0A0A0A]/50">
                    Next Renewal
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#0A0A0A]/5">
                {subscriptionCosts.map((sub) => {
                  const monthlyCost = sub.billingCycle === "annual" ? Math.round(sub.amount / 12) : sub.amount;
                  const now = new Date();
                  const renewalSoon = sub.nextRenewal && (sub.nextRenewal.getTime() - now.getTime()) < 30 * 24 * 60 * 60 * 1000;

                  return (
                    <tr key={sub.id}>
                      <td className="px-5 py-3 font-serif text-sm">
                        {sub.name}
                      </td>
                      <td className="px-5 py-3">
                        <span className="font-mono text-xs px-2 py-0.5 bg-[#0A0A0A]/5 text-[#0A0A0A]/60">
                          {sub.companyTag}
                        </span>
                      </td>
                      <td className="px-5 py-3 font-mono text-xs text-[#0A0A0A]/50">
                        {sub.category ?? "--"}
                      </td>
                      <td className="px-5 py-3 text-right font-mono text-sm">
                        {formatCents(monthlyCost)}
                      </td>
                      <td className="px-5 py-3 text-right font-mono text-xs text-[#0A0A0A]/50">
                        {sub.billingCycle}
                      </td>
                      <td className={`px-5 py-3 text-right font-mono text-xs ${renewalSoon ? "text-amber-600 font-bold" : "text-[#0A0A0A]/50"}`}>
                        {sub.nextRenewal
                          ? sub.nextRenewal.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
                          : "--"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="border-t border-[#0A0A0A]/10 bg-[#0A0A0A]/[0.02]">
                  <td colSpan={3} className="px-5 py-3 font-serif text-sm font-bold">
                    Subscription Total
                  </td>
                  <td className="px-5 py-3 text-right font-mono text-sm font-bold">
                    {formatCents(subscriptionMonthlyTotal)}
                  </td>
                  <td colSpan={2} className="px-5 py-3 text-right font-mono text-xs text-[#0A0A0A]/50">
                    /month
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}

      {/* Per-Project Cost Table */}
      <div className="mb-10">
        <h2 className="font-serif text-lg font-bold text-[#0A0A0A] mb-4">
          Per-Project Costs (This Month)
        </h2>
        <div className="border border-[#0A0A0A]/10 bg-white">
          <table className="w-full">
            <thead>
              <tr className="border-b border-[#0A0A0A]/10">
                <th className="text-left px-5 py-3 font-mono text-xs uppercase text-[#0A0A0A]/50">
                  Project
                </th>
                <th className="text-right px-5 py-3 font-mono text-xs uppercase text-[#0A0A0A]/50">
                  Total Cost
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#0A0A0A]/5">
              {projectCosts.length === 0 ? (
                <tr>
                  <td
                    colSpan={2}
                    className="px-5 py-8 text-center text-[#0A0A0A]/40 font-serif"
                  >
                    No cost data yet. Run a sync to populate.
                  </td>
                </tr>
              ) : (
                projectCosts.map((p) => (
                  <tr key={p.projectId}>
                    <td className="px-5 py-3 font-serif text-sm">
                      {p.projectName}
                    </td>
                    <td className="px-5 py-3 text-right font-mono text-sm">
                      {formatCents(Number(p.totalCost))}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Per-Client Margin Table — THE KILLER FEATURE */}
      <div className="mb-10">
        <h2 className="font-serif text-lg font-bold text-[#0A0A0A] mb-4">
          Client Margins (This Month)
        </h2>
        <div className="border border-[#0A0A0A]/10 bg-white">
          <table className="w-full">
            <thead>
              <tr className="border-b border-[#0A0A0A]/10">
                <th className="text-left px-5 py-3 font-mono text-xs uppercase text-[#0A0A0A]/50">
                  Client
                </th>
                <th className="text-right px-5 py-3 font-mono text-xs uppercase text-[#0A0A0A]/50">
                  Revenue
                </th>
                <th className="text-right px-5 py-3 font-mono text-xs uppercase text-[#0A0A0A]/50">
                  Costs
                </th>
                <th className="text-right px-5 py-3 font-mono text-xs uppercase text-[#0A0A0A]/50">
                  Margin
                </th>
                <th className="text-right px-5 py-3 font-mono text-xs uppercase text-[#0A0A0A]/50">
                  Margin %
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#0A0A0A]/5">
              {clientMargins.length === 0 ? (
                <tr>
                  <td
                    colSpan={5}
                    className="px-5 py-8 text-center text-[#0A0A0A]/40 font-serif"
                  >
                    No client data yet.
                  </td>
                </tr>
              ) : (
                clientMargins.map((c) => (
                  <tr key={c.clientId}>
                    <td className="px-5 py-3">
                      <span className="font-serif text-sm">{c.companyName || c.clientName}</span>
                    </td>
                    <td className="px-5 py-3 text-right font-mono text-sm">
                      {formatCents(c.revenue)}
                    </td>
                    <td className="px-5 py-3 text-right font-mono text-sm text-[#0A0A0A]/60">
                      {formatCents(c.costs)}
                    </td>
                    <td className="px-5 py-3 text-right font-mono text-sm font-bold">
                      {formatCents(c.margin)}
                    </td>
                    <td className="px-5 py-3 text-right">
                      <span
                        className={`font-mono text-sm font-bold ${
                          c.marginPct >= 80
                            ? "text-emerald-600"
                            : c.marginPct >= 50
                              ? "text-amber-600"
                              : "text-red-600"
                        }`}
                      >
                        {c.marginPct}%
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Cost Trend Chart */}
      <div className="mb-10">
        <h2 className="font-serif text-lg font-bold text-[#0A0A0A] mb-4">
          Cost Trend (3 Months)
        </h2>
        {costTrend.length === 0 ? (
          <div className="border border-[#0A0A0A]/10 py-12 text-center">
            <p className="text-[#0A0A0A]/40 font-serif">
              No cost data yet. Sync jobs will populate this automatically.
            </p>
          </div>
        ) : (
          <div className="border border-[#0A0A0A]/10 bg-white p-5">
            <CostTrendChart
              data={costTrend.map((t) => ({
                month: t.month,
                total: Number(t.total) / 100,
              }))}
            />
          </div>
        )}
      </div>
    </div>
  );
}
