import type { Metadata } from "next";
import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { desc, eq, and, gte, lte, sql, count } from "drizzle-orm";

export const metadata: Metadata = {
  title: "Finance | AM Collective",
};
import { format } from "date-fns";
import * as stripeConnector from "@/lib/connectors/stripe";
import * as mercuryConnector from "@/lib/connectors/mercury";
import type { MercuryAccount } from "@/lib/connectors/mercury";
import dynamic from "next/dynamic";
const CashFlowChart = dynamic(
  () => import("./cash-flow-chart").then((mod) => mod.CashFlowChart)
);
import { TransactionFeed } from "./transaction-feed";
import { MercurySyncButton } from "./sync-button";
import { captureError } from "@/lib/errors";

const PAGE_SIZE = 50;

async function getMetrics() {
  try {
    const sixtyDaysAgo = new Date();
    sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60);

    const [accountsResult, mrrResult, spendResult] = await Promise.all([
      mercuryConnector.getAccounts(),
      stripeConnector.getMRR(),
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

    const accounts = accountsResult.success ? (accountsResult.data ?? []) : [];
    const totalCash = accounts.reduce((s, a) => s + a.currentBalance, 0);
    const mrr = mrrResult.success ? (mrrResult.data?.mrr ?? 0) / 100 : 0;
    const arr = mrr * 12;
    const monthlySpend = Number(spendResult[0]?.totalSpend ?? 0) / 2;
    const runway = monthlySpend > 0 ? totalCash / monthlySpend : null;

    return { totalCash, mrr, arr, runway, monthlySpend, accounts };
  } catch (err) {
    captureError(err, { tags: { component: "Finance" } });
    return { totalCash: 0, mrr: 0, arr: 0, runway: null, monthlySpend: 0, accounts: [] as MercuryAccount[] };
  }
}

async function getCashFlowData() {
  try {
    const ninetyDaysAgo = new Date();
    ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

    const dailyTxns = await db
      .select({
        date: sql<string>`TO_CHAR(${schema.mercuryTransactions.postedAt}, 'YYYY-MM-DD')`,
        credits: sql<string>`COALESCE(SUM(CASE WHEN ${schema.mercuryTransactions.direction} = 'credit' THEN ABS(${schema.mercuryTransactions.amount}) ELSE 0 END), 0)`,
        debits: sql<string>`COALESCE(SUM(CASE WHEN ${schema.mercuryTransactions.direction} = 'debit' THEN ABS(${schema.mercuryTransactions.amount}) ELSE 0 END), 0)`,
      })
      .from(schema.mercuryTransactions)
      .where(gte(schema.mercuryTransactions.postedAt, ninetyDaysAgo))
      .groupBy(
        sql`TO_CHAR(${schema.mercuryTransactions.postedAt}, 'YYYY-MM-DD')`
      )
      .orderBy(
        sql`TO_CHAR(${schema.mercuryTransactions.postedAt}, 'YYYY-MM-DD')`
      );

    // Calculate running balance
    let balance = 0;
    return dailyTxns.map((d) => {
      const credits = Number(d.credits);
      const debits = Number(d.debits);
      balance += credits - debits;
      return {
        date: d.date ?? "",
        credits,
        debits,
        balance,
      };
    });
  } catch (err) {
    captureError(err, { tags: { component: "Finance" } });
    return [];
  }
}

async function getTransactions(page: number) {
  try {
    const offset = (page - 1) * PAGE_SIZE;

    const [totalRows, txns] = await Promise.all([
      db.select({ total: count() }).from(schema.mercuryTransactions),
      db
        .select({
          id: schema.mercuryTransactions.id,
          accountName: schema.mercuryAccounts.name,
          counterpartyName: schema.mercuryTransactions.counterpartyName,
          amount: schema.mercuryTransactions.amount,
          direction: schema.mercuryTransactions.direction,
          status: schema.mercuryTransactions.status,
          description: schema.mercuryTransactions.description,
          companyTag: schema.mercuryTransactions.companyTag,
          postedAt: schema.mercuryTransactions.postedAt,
          createdAt: schema.mercuryTransactions.createdAt,
        })
        .from(schema.mercuryTransactions)
        .innerJoin(
          schema.mercuryAccounts,
          eq(schema.mercuryTransactions.accountId, schema.mercuryAccounts.id)
        )
        .orderBy(desc(schema.mercuryTransactions.postedAt))
        .limit(PAGE_SIZE)
        .offset(offset),
    ]);

    return {
      transactions: txns.map((t) => ({
        ...t,
        amount: String(t.amount),
        postedAt: t.postedAt?.toISOString() ?? null,
        createdAt: t.createdAt.toISOString(),
      })),
      totalCount: totalRows[0]?.total ?? 0,
    };
  } catch (err) {
    captureError(err, { tags: { component: "Finance" } });
    return { transactions: [], totalCount: 0 };
  }
}

async function getRevenueTrend() {
  try {
    const result = await stripeConnector.getRevenueTrend(6);
    if (!result.success || !result.data) return [];
    return result.data.map((p) => ({
      month: p.month,
      revenue: p.revenue / 100,
    }));
  } catch (err) {
    captureError(err, { tags: { component: "Finance" } });
    return [];
  }
}

async function getCostData() {
  try {
    const thirtyDaysFromNow = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

    const [activeCosts, upcomingRenewals] = await Promise.all([
      db
        .select()
        .from(schema.subscriptionCosts)
        .where(eq(schema.subscriptionCosts.isActive, true))
        .orderBy(desc(schema.subscriptionCosts.amount)),
      db
        .select()
        .from(schema.subscriptionCosts)
        .where(
          and(
            eq(schema.subscriptionCosts.isActive, true),
            lte(schema.subscriptionCosts.nextRenewal, thirtyDaysFromNow)
          )
        )
        .orderBy(schema.subscriptionCosts.nextRenewal),
    ]);

    // Group by company tag for burn breakdown
    const burnByCompany = new Map<string, number>();
    let totalMonthlyBurn = 0;
    for (const cost of activeCosts) {
      const monthly = cost.billingCycle === "annual" ? cost.amount / 12 : cost.amount;
      totalMonthlyBurn += monthly;
      const current = burnByCompany.get(cost.companyTag) ?? 0;
      burnByCompany.set(cost.companyTag, current + monthly);
    }

    return {
      activeCosts,
      upcomingRenewals,
      totalMonthlyBurn: Math.round(totalMonthlyBurn) / 100,
      burnByCompany: Array.from(burnByCompany.entries())
        .map(([tag, amount]) => ({ tag, amount: Math.round(amount) / 100 }))
        .sort((a, b) => b.amount - a.amount),
    };
  } catch (err) {
    captureError(err, { tags: { component: "Finance" } });
    return { activeCosts: [], upcomingRenewals: [], totalMonthlyBurn: 0, burnByCompany: [] };
  }
}

export default async function FinancePage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const params = await searchParams;
  const page = Math.max(1, parseInt(params.page ?? "1", 10));

  const [metrics, cashFlowData, txnData, revenueTrend, costData] = await Promise.all([
    getMetrics(),
    getCashFlowData(),
    getTransactions(page),
    getRevenueTrend(),
    getCostData(),
  ]);

  function formatCurrency(amount: number) {
    return amount.toLocaleString("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    });
  }

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold font-serif tracking-tight">
            Finance
          </h1>
          <p className="text-[#0A0A0A]/40 font-mono text-xs mt-1">
            Mercury Banking + Stripe Revenue
          </p>
        </div>
        <MercurySyncButton />
      </div>

      {/* Metric Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <MetricCard
          label="Total Cash"
          value={formatCurrency(metrics.totalCash)}
          sub={`${metrics.accounts.length} account${metrics.accounts.length !== 1 ? "s" : ""}`}
        />
        <MetricCard
          label="MRR"
          value={formatCurrency(metrics.mrr)}
          sub="Stripe subscriptions"
        />
        <MetricCard
          label="ARR"
          value={formatCurrency(metrics.arr)}
          sub="Annualized"
        />
        <MetricCard
          label="Runway"
          value={
            metrics.runway
              ? `${metrics.runway.toFixed(1)} mo`
              : "—"
          }
          sub={
            metrics.monthlySpend > 0
              ? `${formatCurrency(metrics.monthlySpend)}/mo spend`
              : "No spend data"
          }
        />
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        {/* Cash Flow Chart */}
        <div className="border border-[#0A0A0A]/10 bg-white p-5">
          <h2 className="font-serif font-bold text-[#0A0A0A] mb-4">
            Cash Flow — Last 90 Days
          </h2>
          <CashFlowChart data={cashFlowData} />
        </div>

        {/* Revenue Breakdown */}
        <div className="border border-[#0A0A0A]/10 bg-white p-5">
          <h2 className="font-serif font-bold text-[#0A0A0A] mb-4">
            Revenue Trend
          </h2>
          {revenueTrend.length > 0 ? (
            <div className="space-y-3">
              {revenueTrend.map((point) => (
                <div
                  key={point.month}
                  className="flex items-center justify-between"
                >
                  <span className="font-mono text-xs text-[#0A0A0A]/60">
                    {point.month}
                  </span>
                  <div className="flex items-center gap-3">
                    <div className="w-40 h-2 bg-[#0A0A0A]/5">
                      <div
                        className="h-full bg-[#0A0A0A]"
                        style={{
                          width: `${Math.min(100, (point.revenue / Math.max(...revenueTrend.map((r) => r.revenue), 1)) * 100)}%`,
                        }}
                      />
                    </div>
                    <span className="font-mono text-xs font-medium w-20 text-right">
                      {formatCurrency(point.revenue)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex items-center justify-center h-[200px] text-[#0A0A0A]/30 font-mono text-xs">
              No Stripe revenue data
            </div>
          )}
        </div>
      </div>

      {/* Cost Tracker — Monthly Burn + Upcoming Renewals + MRR vs Burn */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
        {/* MRR vs Burn Comparison */}
        <div className="border border-[#0A0A0A]/10 bg-white p-5">
          <h3 className="font-serif font-bold text-[#0A0A0A] mb-4">
            MRR vs Burn
          </h3>
          <div className="space-y-4">
            <div>
              <span className="font-mono text-[10px] uppercase tracking-wider text-[#0A0A0A]/40">
                Monthly Revenue (MRR)
              </span>
              <div className="font-mono text-xl font-bold text-[#0A0A0A] mt-1">
                {formatCurrency(metrics.mrr)}
              </div>
            </div>
            <div>
              <span className="font-mono text-[10px] uppercase tracking-wider text-[#0A0A0A]/40">
                Monthly Burn (SaaS)
              </span>
              <div className="font-mono text-xl font-bold text-[#0A0A0A]/70 mt-1">
                {formatCurrency(costData.totalMonthlyBurn)}
              </div>
            </div>
            <div className="border-t border-[#0A0A0A]/10 pt-3">
              <span className="font-mono text-[10px] uppercase tracking-wider text-[#0A0A0A]/40">
                Net
              </span>
              <div
                className={`font-mono text-lg font-bold mt-1 ${
                  metrics.mrr - costData.totalMonthlyBurn >= 0
                    ? "text-[#0A0A0A]"
                    : "text-[#0A0A0A]/70"
                }`}
              >
                {formatCurrency(metrics.mrr - costData.totalMonthlyBurn)}
              </div>
            </div>
          </div>
        </div>

        {/* Monthly Burn by Company */}
        <div className="border border-[#0A0A0A]/10 bg-white p-5">
          <h3 className="font-serif font-bold text-[#0A0A0A] mb-4">
            Monthly Burn by Company
          </h3>
          {costData.burnByCompany.length === 0 ? (
            <p className="text-[#0A0A0A]/40 font-mono text-xs">
              No subscription costs tracked yet.
            </p>
          ) : (
            <div className="space-y-3">
              {costData.burnByCompany.map((entry) => (
                <div key={entry.tag} className="flex items-center justify-between">
                  <span className="font-mono text-xs text-[#0A0A0A]/60">
                    {entry.tag.replace(/_/g, " ")}
                  </span>
                  <div className="flex items-center gap-3">
                    <div className="w-24 h-2 bg-[#0A0A0A]/5">
                      <div
                        className="h-full bg-[#0A0A0A]"
                        style={{
                          width: `${Math.min(100, (entry.amount / Math.max(...costData.burnByCompany.map((b) => b.amount), 1)) * 100)}%`,
                        }}
                      />
                    </div>
                    <span className="font-mono text-xs font-medium w-16 text-right">
                      {formatCurrency(entry.amount)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Upcoming Renewals */}
        <div className="border border-[#0A0A0A]/10 bg-white p-5">
          <h3 className="font-serif font-bold text-[#0A0A0A] mb-4">
            Upcoming Renewals
          </h3>
          {costData.upcomingRenewals.length === 0 ? (
            <p className="text-[#0A0A0A]/40 font-mono text-xs">
              No renewals in the next 30 days.
            </p>
          ) : (
            <div className="divide-y divide-[#0A0A0A]/5">
              {costData.upcomingRenewals.slice(0, 8).map((cost) => (
                <div key={cost.id} className="py-2.5 flex items-center justify-between">
                  <div className="min-w-0">
                    <p className="font-mono text-xs font-medium text-[#0A0A0A] truncate">
                      {cost.name}
                    </p>
                    <p className="font-mono text-[10px] text-[#0A0A0A]/40">
                      {cost.vendor} · {cost.nextRenewal ? format(cost.nextRenewal, "MMM d") : "—"}
                    </p>
                  </div>
                  <span className="font-mono text-xs font-medium shrink-0">
                    {formatCurrency(cost.amount / 100)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Transaction Feed */}
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-4">
          <h2 className="font-serif text-lg font-bold text-[#0A0A0A]">
            Transactions
          </h2>
          <span className="px-2 py-0.5 text-xs font-mono border border-[#0A0A0A]">
            {txnData.totalCount}
          </span>
        </div>
        <TransactionFeed
          transactions={txnData.transactions}
          totalCount={txnData.totalCount}
          page={page}
          pageSize={PAGE_SIZE}
        />
      </div>

      {/* Account Cards */}
      {metrics.accounts.length > 0 && (
        <div>
          <h2 className="font-serif text-lg font-bold text-[#0A0A0A] mb-4">
            Mercury Accounts
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {metrics.accounts.map((account) => (
              <div
                key={account.id}
                className="border border-[#0A0A0A]/10 bg-white p-5"
              >
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-serif font-bold text-[#0A0A0A]">
                    {account.name}
                  </h3>
                  <span className="font-mono text-[10px] uppercase tracking-wider text-[#0A0A0A]/40">
                    {account.type} ····{account.accountNumber}
                  </span>
                </div>
                <div className="font-mono text-xl font-bold">
                  {account.currentBalance.toLocaleString("en-US", {
                    style: "currency",
                    currency: "USD",
                  })}
                </div>
                <div className="flex items-center justify-between mt-2">
                  <span className="font-mono text-xs text-[#0A0A0A]/40">
                    Available:{" "}
                    {account.availableBalance.toLocaleString("en-US", {
                      style: "currency",
                      currency: "USD",
                    })}
                  </span>
                  <span className="font-mono text-[10px] text-[#0A0A0A]/30">
                    Live
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function MetricCard({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub: string;
}) {
  return (
    <div className="border border-[#0A0A0A]/10 bg-white p-5">
      <span className="font-mono text-[10px] uppercase tracking-wider text-[#0A0A0A]/40">
        {label}
      </span>
      <div className="font-mono text-2xl font-bold mt-1">{value}</div>
      <span className="font-mono text-xs text-[#0A0A0A]/40">{sub}</span>
    </div>
  );
}
