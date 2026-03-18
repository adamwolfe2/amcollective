import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { desc, eq, sql, and, gte, asc, lte, isNotNull } from "drizzle-orm";
import { formatCents } from "@/lib/stripe/format";
import { CostTrendChart } from "./cost-trend-chart";
import { SyncButton } from "./sync-button";
import { SubscriptionManager, type ProjectOption } from "./subscription-manager";
import * as stripeConnector from "@/lib/connectors/stripe";
import Link from "next/link";

// ─── Data Fetchers ────────────────────────────────────────────────────────────

async function getCommandCenterMetrics() {
  try {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const sixtyDaysAgo = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000);

    const [accounts, mrrResult, activeSubs, toolCostResult, aiCostResult, spendResult] =
      await Promise.all([
        db.select({ balance: schema.mercuryAccounts.balance }).from(schema.mercuryAccounts),
        stripeConnector.getMRR(),
        db
          .select({ amount: schema.subscriptionCosts.amount, billingCycle: schema.subscriptionCosts.billingCycle })
          .from(schema.subscriptionCosts)
          .where(eq(schema.subscriptionCosts.isActive, true)),
        db
          .select({ total: sql<number>`COALESCE(SUM(${schema.toolCosts.amount}), 0)` })
          .from(schema.toolCosts)
          .where(gte(schema.toolCosts.createdAt, monthStart)),
        db
          .select({ total: sql<number>`COALESCE(SUM(${schema.apiUsage.cost}), 0)` })
          .from(schema.apiUsage)
          .where(gte(schema.apiUsage.createdAt, monthStart)),
        db
          .select({ totalSpend: sql<string>`COALESCE(SUM(ABS(${schema.mercuryTransactions.amount})), 0)` })
          .from(schema.mercuryTransactions)
          .where(
            and(
              eq(schema.mercuryTransactions.direction, "debit"),
              gte(schema.mercuryTransactions.postedAt, sixtyDaysAgo)
            )
          ),
      ]);

    const totalCash = accounts.reduce((s, a) => s + Number(a.balance), 0);
    const mrr = mrrResult.success ? (mrrResult.data?.mrr ?? 0) / 100 : 0;

    const subscriptionBurn = activeSubs.reduce((sum, sub) => {
      const monthly = sub.billingCycle === "annual"
        ? Math.round(sub.amount / 12)
        : sub.amount;
      return sum + monthly;
    }, 0);

    const toolBurn = Number(toolCostResult[0]?.total ?? 0);
    const aiApiBurn = Number(aiCostResult[0]?.total ?? 0);
    const totalMonthlyBurn = subscriptionBurn + toolBurn + aiApiBurn;
    const monthlySpend = Number(spendResult[0]?.totalSpend ?? 0) / 2;
    const runway = monthlySpend > 0 ? totalCash / monthlySpend : null;

    return {
      totalCash,
      mrr,
      subscriptionBurn,
      toolBurn,
      aiApiBurn,
      totalMonthlyBurn,
      net: mrr * 100 - totalMonthlyBurn, // in cents
      runway,
      monthlySpend,
    };
  } catch (err) {
    console.error("[Costs] getCommandCenterMetrics failed:", err);
    return { totalCash: 0, mrr: 0, subscriptionBurn: 0, toolBurn: 0, aiApiBurn: 0, totalMonthlyBurn: 0, net: 0, runway: null, monthlySpend: 0 };
  }
}

async function getAiUsageBreakdown() {
  try {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    return db
      .select({
        agent: sql<string>`COALESCE(${schema.apiUsage.metadata}->>'agent', 'unknown')`,
        model: sql<string>`COALESCE(${schema.apiUsage.metadata}->>'model', 'unknown')`,
        calls: sql<number>`COUNT(*)`,
        tokens: sql<number>`COALESCE(SUM(${schema.apiUsage.tokensUsed}), 0)`,
        cost: sql<number>`COALESCE(SUM(${schema.apiUsage.cost}), 0)`,
      })
      .from(schema.apiUsage)
      .where(gte(schema.apiUsage.createdAt, monthStart))
      .groupBy(
        sql`${schema.apiUsage.metadata}->>'agent'`,
        sql`${schema.apiUsage.metadata}->>'model'`
      )
      .orderBy(desc(sql`COALESCE(SUM(${schema.apiUsage.cost}), 0)`));
  } catch (err) {
    console.error("[Costs] getAiUsageBreakdown failed:", err);
    return [];
  }
}

async function getUpcomingCharges() {
  try {
    const fourteenDaysOut = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);

    return db
      .select()
      .from(schema.subscriptionCosts)
      .where(
        and(
          eq(schema.subscriptionCosts.isActive, true),
          lte(schema.subscriptionCosts.nextRenewal, fourteenDaysOut)
        )
      )
      .orderBy(asc(schema.subscriptionCosts.nextRenewal));
  } catch (err) {
    console.error("[Costs] getUpcomingCharges failed:", err);
    return [];
  }
}

async function getSubscriptions() {
  try {
    return await db
      .select()
      .from(schema.subscriptionCosts)
      .where(eq(schema.subscriptionCosts.isActive, true))
      .orderBy(asc(schema.subscriptionCosts.nextRenewal));
  } catch (err) {
    console.error("[Costs] getSubscriptions failed:", err);
    return [];
  }
}

async function getCostSummary() {
  try {
    const now = new Date();
    const threeMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 3, 1);

    return await db
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
  } catch (err) {
    console.error("[Costs] getCostSummary failed:", err);
    return [];
  }
}

async function getPerProjectCosts() {
  try {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    const [projects, toolCostRows, subCostRows, aiCostRows] = await Promise.all([
      db
        .select({ id: schema.portfolioProjects.id, name: schema.portfolioProjects.name })
        .from(schema.portfolioProjects)
        .orderBy(asc(schema.portfolioProjects.name)),

      db
        .select({
          projectId: schema.toolCosts.projectId,
          total: sql<number>`COALESCE(SUM(${schema.toolCosts.amount}), 0)`,
        })
        .from(schema.toolCosts)
        .where(and(isNotNull(schema.toolCosts.projectId), gte(schema.toolCosts.createdAt, monthStart)))
        .groupBy(schema.toolCosts.projectId),

      db
        .select({
          projectId: schema.subscriptionCosts.projectId,
          total: sql<number>`COALESCE(SUM(
            CASE WHEN ${schema.subscriptionCosts.billingCycle} = 'annual'
              THEN ROUND(${schema.subscriptionCosts.amount} / 12.0)
              ELSE ${schema.subscriptionCosts.amount}
          END
          ), 0)`,
        })
        .from(schema.subscriptionCosts)
        .where(and(eq(schema.subscriptionCosts.isActive, true), isNotNull(schema.subscriptionCosts.projectId)))
        .groupBy(schema.subscriptionCosts.projectId),

      db
        .select({
          projectId: schema.apiUsage.projectId,
          total: sql<number>`COALESCE(SUM(${schema.apiUsage.cost}), 0)`,
        })
        .from(schema.apiUsage)
        .where(and(isNotNull(schema.apiUsage.projectId), gte(schema.apiUsage.createdAt, monthStart)))
        .groupBy(schema.apiUsage.projectId),
    ]);

    const toolMap = new Map(toolCostRows.map((r) => [r.projectId!, Number(r.total)]));
    const subMap = new Map(subCostRows.map((r) => [r.projectId!, Number(r.total)]));
    const aiMap = new Map(aiCostRows.map((r) => [r.projectId!, Number(r.total)]));

    const rows = projects.map((p) => ({
      projectId: p.id,
      projectName: p.name,
      toolCosts: toolMap.get(p.id) ?? 0,
      subCosts: subMap.get(p.id) ?? 0,
      aiCosts: aiMap.get(p.id) ?? 0,
      totalCost: (toolMap.get(p.id) ?? 0) + (subMap.get(p.id) ?? 0) + (aiMap.get(p.id) ?? 0),
    }));

    rows.sort((a, b) => b.totalCost - a.totalCost);
    return rows;
  } catch (err) {
    console.error("[Costs] getPerProjectCosts failed:", err);
    return [];
  }
}

async function getPortfolioProjectsList(): Promise<ProjectOption[]> {
  try {
    return await db
      .select({ id: schema.portfolioProjects.id, name: schema.portfolioProjects.name })
      .from(schema.portfolioProjects)
      .orderBy(asc(schema.portfolioProjects.name));
  } catch (err) {
    console.error("[Costs] getPortfolioProjectsList failed:", err);
    return [];
  }
}

async function getClientMargins() {
  try {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    const [clients, clientCosts] = await Promise.all([
      db
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
        .groupBy(schema.clients.id),
      db
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
        .groupBy(schema.clientProjects.clientId),
    ]);

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
  } catch (err) {
    console.error("[Costs] getClientMargins failed:", err);
    return [];
  }
}

async function getCostTrend() {
  try {
    const now = new Date();
    const threeMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 3, 1);

    return db
      .select({
        month: sql<string>`TO_CHAR(${schema.toolCosts.createdAt}, 'YYYY-MM')`.as("month"),
        total: sql<number>`COALESCE(SUM(${schema.toolCosts.amount}), 0)`.as("total"),
      })
      .from(schema.toolCosts)
      .where(gte(schema.toolCosts.createdAt, threeMonthsAgo))
      .groupBy(sql`TO_CHAR(${schema.toolCosts.createdAt}, 'YYYY-MM')`)
      .orderBy(sql`month`);
  } catch (err) {
    console.error("[Costs] getCostTrend failed:", err);
    return [];
  }
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default async function CostsPage() {
  const [
    metrics,
    upcomingCharges,
    subscriptions,
    costSummary,
    projectCosts,
    clientMargins,
    costTrend,
    aiUsage,
    portfolioProjects,
  ] = await Promise.all([
    getCommandCenterMetrics(),
    getUpcomingCharges(),
    getSubscriptions(),
    getCostSummary(),
    getPerProjectCosts(),
    getClientMargins(),
    getCostTrend(),
    getAiUsageBreakdown(),
    getPortfolioProjectsList(),
  ]);

  // Serialize subscriptions for client component (dates → ISO strings)
  const serializedSubscriptions = subscriptions.map((sub) => ({
    ...sub,
    amount: Number(sub.amount),
    projectId: sub.projectId ?? null,
    nextRenewal: sub.nextRenewal ? sub.nextRenewal.toISOString().slice(0, 10) : null,
    createdAt: sub.createdAt.toISOString(),
    updatedAt: sub.updatedAt.toISOString(),
  }));

  function formatCurrency(n: number) {
    return n.toLocaleString("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    });
  }

  const netCents = metrics.net;
  const netPositive = netCents >= 0;

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold font-serif tracking-tight">
            Cost Command Center
          </h1>
          <p className="text-[#0A0A0A]/40 font-mono text-xs mt-1">
            Full-stack financial visibility across all companies
          </p>
        </div>
        <SyncButton />
      </div>

      {/* ── Command Center KPI Strip ── */}
      <div className="grid grid-cols-2 lg:grid-cols-6 gap-4 mb-8">
        <div className="border border-[#0A0A0A]/10 bg-white p-5">
          <p className="font-mono text-[10px] uppercase tracking-wider text-[#0A0A0A]/40">
            Cash on Hand
          </p>
          <p className="font-mono text-2xl font-bold text-[#0A0A0A] mt-1">
            {formatCurrency(metrics.totalCash)}
          </p>
          <p className="font-mono text-[10px] text-[#0A0A0A]/30 mt-1">
            Mercury
          </p>
        </div>

        <div className="border border-[#0A0A0A]/10 bg-white p-5">
          <p className="font-mono text-[10px] uppercase tracking-wider text-[#0A0A0A]/40">
            MRR
          </p>
          <p className="font-mono text-2xl font-bold text-[#0A0A0A] mt-1">
            {formatCurrency(metrics.mrr)}
          </p>
          <p className="font-mono text-[10px] text-[#0A0A0A]/30 mt-1">
            Stripe
          </p>
        </div>

        <div className="border border-[#0A0A0A]/10 bg-white p-5">
          <p className="font-mono text-[10px] uppercase tracking-wider text-[#0A0A0A]/40">
            Monthly Burn
          </p>
          <p className="font-mono text-2xl font-bold text-[#0A0A0A]/70 mt-1">
            {formatCents(metrics.totalMonthlyBurn)}
          </p>
          <p className="font-mono text-[10px] text-[#0A0A0A]/30 mt-1">
            {formatCents(metrics.subscriptionBurn)} subs
            {metrics.aiApiBurn > 0 ? ` · ${formatCents(metrics.aiApiBurn)} AI` : ""}
          </p>
        </div>

        <div className="border border-[#0A0A0A]/10 bg-white p-5">
          <p className="font-mono text-[10px] uppercase tracking-wider text-[#0A0A0A]/40">
            Net (MRR − Burn)
          </p>
          <p
            className={`font-mono text-2xl font-bold mt-1 ${
              netPositive ? "text-[#0A0A0A]" : "text-[#0A0A0A]/70"
            }`}
          >
            {netPositive ? "+" : ""}
            {formatCents(netCents)}
          </p>
          <p className="font-mono text-[10px] text-[#0A0A0A]/30 mt-1">
            /month
          </p>
        </div>

        <div className="border border-[#0A0A0A]/10 bg-white p-5">
          <p className="font-mono text-[10px] uppercase tracking-wider text-[#0A0A0A]/40">
            Runway
          </p>
          <p className="font-mono text-2xl font-bold text-[#0A0A0A] mt-1">
            {metrics.runway ? `${metrics.runway.toFixed(1)} mo` : "—"}
          </p>
          <p className="font-mono text-[10px] text-[#0A0A0A]/30 mt-1">
            {metrics.monthlySpend > 0
              ? `${formatCurrency(metrics.monthlySpend)}/mo spend`
              : "No bank data"}
          </p>
        </div>

        <div className="border border-[#0A0A0A]/10 bg-white p-5">
          <p className="font-mono text-[10px] uppercase tracking-wider text-[#0A0A0A]/40">
            Sub Burn
          </p>
          <p className="font-mono text-2xl font-bold text-[#0A0A0A] mt-1">
            {formatCents(metrics.subscriptionBurn)}
          </p>
          <p className="font-mono text-[10px] text-[#0A0A0A]/30 mt-1">
            {subscriptions.length} active
          </p>
        </div>
      </div>

      {/* ── Upcoming Charges (next 14 days) ── */}
      {upcomingCharges.length > 0 && (
        <div className="mb-8">
          <h2 className="font-serif text-lg font-bold text-[#0A0A0A] mb-4">
            Upcoming Charges — Next 14 Days
          </h2>
          <div className="border border-[#0A0A0A]/20 bg-[#0A0A0A]/5">
            <div className="divide-y divide-[#0A0A0A]/10">
              {upcomingCharges.map((charge) => {
                const daysOut = charge.nextRenewal
                  ? Math.ceil(
                      (charge.nextRenewal.getTime() - Date.now()) /
                        (1000 * 60 * 60 * 24)
                    )
                  : null;
                const amount =
                  charge.billingCycle === "annual"
                    ? charge.amount
                    : charge.amount;
                return (
                  <div
                    key={charge.id}
                    className="px-5 py-3 flex items-center justify-between"
                  >
                    <div className="flex items-center gap-4">
                      <div>
                        <p className="font-serif text-sm font-medium text-[#0A0A0A]">
                          {charge.name}
                        </p>
                        <p className="font-mono text-[10px] text-[#0A0A0A]/60">
                          {charge.vendor} ·{" "}
                          {charge.companyTag.replace(/_/g, " ")} ·{" "}
                          {charge.billingCycle}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-6">
                      <span className="font-mono text-xs text-[#0A0A0A]/60 font-medium">
                        {daysOut !== null
                          ? daysOut === 0
                            ? "Today"
                            : daysOut === 1
                              ? "Tomorrow"
                              : `In ${daysOut}d`
                          : "Soon"}
                      </span>
                      <span className="font-mono text-sm font-bold text-[#0A0A0A]">
                        {formatCents(amount)}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* ── Tool Cost Breakdown ── */}
      {costSummary.length > 0 && (
        <div className="mb-8">
          <h2 className="font-serif text-lg font-bold text-[#0A0A0A] mb-4">
            Tool Costs (3 Months)
          </h2>
          <div className="border border-[#0A0A0A]/10 bg-white overflow-x-auto">
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

      {/* ── Subscriptions — CRUD ── */}
      <SubscriptionManager subscriptions={serializedSubscriptions} projects={portfolioProjects} />

      {/* ── Per-Project Costs ── */}
      <div className="mb-8">
        <h2 className="font-serif text-lg font-bold text-[#0A0A0A] mb-4">
          Per-Project Costs (This Month)
        </h2>
        <div className="border border-[#0A0A0A]/10 bg-white overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-[#0A0A0A]/10">
                <th className="text-left px-5 py-3 font-mono text-xs uppercase text-[#0A0A0A]/50">
                  Project
                </th>
                <th className="text-right px-5 py-3 font-mono text-xs uppercase text-[#0A0A0A]/50">
                  Subs
                </th>
                <th className="text-right px-5 py-3 font-mono text-xs uppercase text-[#0A0A0A]/50">
                  Tools
                </th>
                <th className="text-right px-5 py-3 font-mono text-xs uppercase text-[#0A0A0A]/50">
                  AI
                </th>
                <th className="text-right px-5 py-3 font-mono text-xs uppercase text-[#0A0A0A]/50">
                  Total
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#0A0A0A]/5">
              {projectCosts.length === 0 ? (
                <tr>
                  <td
                    colSpan={5}
                    className="px-5 py-8 text-center text-[#0A0A0A]/40 font-serif"
                  >
                    No cost data yet. Run a sync to populate.
                  </td>
                </tr>
              ) : (
                projectCosts.map((p) => (
                  <tr key={p.projectId} className="group hover:bg-[#F3F3EF]/50">
                    <td className="px-5 py-3">
                      <Link
                        href={`/projects/${p.projectId}`}
                        className="font-serif text-sm group-hover:underline underline-offset-2"
                      >
                        {p.projectName}
                      </Link>
                    </td>
                    <td className="px-5 py-3 text-right font-mono text-sm text-[#0A0A0A]/60">
                      {p.subCosts > 0 ? formatCents(p.subCosts) : "—"}
                    </td>
                    <td className="px-5 py-3 text-right font-mono text-sm text-[#0A0A0A]/60">
                      {p.toolCosts > 0 ? formatCents(p.toolCosts) : "—"}
                    </td>
                    <td className="px-5 py-3 text-right font-mono text-sm text-[#0A0A0A]/60">
                      {p.aiCosts > 0 ? formatCents(p.aiCosts) : "—"}
                    </td>
                    <td className="px-5 py-3 text-right font-mono text-sm font-bold">
                      {p.totalCost > 0 ? formatCents(p.totalCost) : "—"}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <p className="font-mono text-[10px] text-[#0A0A0A]/30 mt-2">
          Subs = recurring subscriptions attributed to project · Tools = Vercel/Neon overages · AI = Claude API usage
        </p>
      </div>

      {/* ── Client Margins ── */}
      <div className="mb-8">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-serif text-lg font-bold text-[#0A0A0A]">
            Client Margins (This Month)
          </h2>
          <Link
            href="/costs/margins"
            className="font-mono text-xs text-[#0A0A0A]/50 underline underline-offset-2 hover:text-[#0A0A0A]"
          >
            Full breakdown →
          </Link>
        </div>
        <div className="border border-[#0A0A0A]/10 bg-white overflow-x-auto">
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
                  %
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
                    <td className="px-5 py-3 font-serif text-sm">
                      {c.companyName || c.clientName}
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
                            ? "text-[#0A0A0A]"
                            : c.marginPct >= 50
                              ? "text-[#0A0A0A]/60"
                              : "text-[#0A0A0A]/70"
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

      {/* ── AI API Usage (This Month) ── */}
      <div className="mb-8">
        <h2 className="font-serif text-lg font-bold text-[#0A0A0A] mb-4">
          AI API Usage (This Month)
        </h2>
        <div className="border border-[#0A0A0A]/10 bg-white overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-[#0A0A0A]/10">
                <th className="text-left px-5 py-3 font-mono text-xs uppercase text-[#0A0A0A]/50">Agent</th>
                <th className="text-left px-5 py-3 font-mono text-xs uppercase text-[#0A0A0A]/50">Model</th>
                <th className="text-right px-5 py-3 font-mono text-xs uppercase text-[#0A0A0A]/50">Calls</th>
                <th className="text-right px-5 py-3 font-mono text-xs uppercase text-[#0A0A0A]/50">Tokens</th>
                <th className="text-right px-5 py-3 font-mono text-xs uppercase text-[#0A0A0A]/50">Cost</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#0A0A0A]/5">
              {aiUsage.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-5 py-8 text-center text-[#0A0A0A]/40 font-serif">
                    No AI usage this month yet.
                  </td>
                </tr>
              ) : (
                aiUsage.map((row, i) => (
                  <tr key={i} className="hover:bg-[#F3F3EF]/50">
                    <td className="px-5 py-3 font-serif text-sm">{row.agent}</td>
                    <td className="px-5 py-3 font-mono text-xs text-[#0A0A0A]/50">
                      {row.model.replace("claude-", "").replace(/-\d{8}$/, "")}
                    </td>
                    <td className="px-5 py-3 text-right font-mono text-sm">{Number(row.calls).toLocaleString()}</td>
                    <td className="px-5 py-3 text-right font-mono text-sm">{Number(row.tokens).toLocaleString()}</td>
                    <td className="px-5 py-3 text-right font-mono text-sm font-bold">
                      {Number(row.cost) === 0 ? "<$0.01" : formatCents(Number(row.cost))}
                    </td>
                  </tr>
                ))
              )}
              {aiUsage.length > 0 && (
                <tr className="border-t border-[#0A0A0A]/10 bg-[#F3F3EF]/30">
                  <td colSpan={4} className="px-5 py-3 font-mono text-xs text-[#0A0A0A]/50 uppercase">Total</td>
                  <td className="px-5 py-3 text-right font-mono text-sm font-bold">
                    {metrics.aiApiBurn === 0 ? "<$0.01" : formatCents(metrics.aiApiBurn)}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Cost Trend Chart ── */}
      <div className="mb-8">
        <h2 className="font-serif text-lg font-bold text-[#0A0A0A] mb-4">
          Tool Cost Trend (3 Months)
        </h2>
        {costTrend.length === 0 ? (
          <div className="border border-[#0A0A0A]/10 py-12 text-center">
            <p className="text-[#0A0A0A]/40 font-serif">
              No cost data yet. Sync jobs populate this automatically.
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
