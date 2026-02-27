/**
 * Monthly Profit & Loss report generator.
 * Aggregates revenue (paid invoices) vs costs (subscriptions + tool costs)
 * for a given month, then produces structured data and CSV.
 */

import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { eq, and, sql } from "drizzle-orm";

export type PandLMonth = {
  month: string; // YYYY-MM
  revenue: number; // cents
  subscriptionCosts: number; // cents
  toolCosts: number; // cents
  apiCosts: number; // cents
  totalCosts: number; // cents
  netProfit: number; // cents
  margin: number; // percentage
  invoiceCount: number;
  paidInvoiceCount: number;
};

/**
 * Generate P&L for a given month (YYYY-MM format).
 */
export async function generateMonthlyPandL(month: string): Promise<PandLMonth> {
  const startOfMonth = `${month}-01`;
  const endOfMonth = sql`(${startOfMonth}::date + INTERVAL '1 month')`;

  // Revenue: sum of paid invoices in this month
  const [revenueResult] = await db
    .select({
      totalRevenue: sql<number>`COALESCE(SUM(${schema.invoices.amount}), 0)`,
      paidCount: sql<number>`COUNT(*)`,
    })
    .from(schema.invoices)
    .where(
      and(
        eq(schema.invoices.status, "paid"),
        sql`${schema.invoices.paidAt} >= ${startOfMonth}::date`,
        sql`${schema.invoices.paidAt} < ${endOfMonth}`
      )
    );

  // Total invoices created this month (all statuses)
  const [invoiceCountResult] = await db
    .select({
      count: sql<number>`COUNT(*)`,
    })
    .from(schema.invoices)
    .where(
      and(
        sql`${schema.invoices.createdAt} >= ${startOfMonth}::date`,
        sql`${schema.invoices.createdAt} < ${endOfMonth}`
      )
    );

  // Subscription costs: active subscriptions, annualized to monthly
  const [subscriptionResult] = await db
    .select({
      monthlyCost: sql<number>`COALESCE(SUM(
        CASE
          WHEN ${schema.subscriptionCosts.billingCycle} = 'annual'
            THEN ${schema.subscriptionCosts.amount} / 12
          ELSE ${schema.subscriptionCosts.amount}
        END
      ), 0)`,
    })
    .from(schema.subscriptionCosts)
    .where(eq(schema.subscriptionCosts.isActive, true));

  // Tool costs for the month
  const [toolCostResult] = await db
    .select({
      totalCost: sql<number>`COALESCE(SUM(${schema.toolCosts.amount}), 0)`,
    })
    .from(schema.toolCosts)
    .where(
      and(
        sql`${schema.toolCosts.createdAt} >= ${startOfMonth}::date`,
        sql`${schema.toolCosts.createdAt} < ${endOfMonth}`
      )
    );

  // API usage costs for the month
  const [apiCostResult] = await db
    .select({
      totalCost: sql<number>`COALESCE(SUM(${schema.apiUsage.cost}), 0)`,
    })
    .from(schema.apiUsage)
    .where(
      and(
        sql`${schema.apiUsage.date} >= ${startOfMonth}::date`,
        sql`${schema.apiUsage.date} < ${endOfMonth}`
      )
    );

  const revenue = Number(revenueResult?.totalRevenue ?? 0);
  const subscriptionCosts = Number(subscriptionResult?.monthlyCost ?? 0);
  const toolCostsTotal = Number(toolCostResult?.totalCost ?? 0);
  const apiCosts = Number(apiCostResult?.totalCost ?? 0);
  const totalCosts = subscriptionCosts + toolCostsTotal + apiCosts;
  const netProfit = revenue - totalCosts;
  const margin = revenue > 0 ? Math.round((netProfit / revenue) * 100) : 0;

  return {
    month,
    revenue,
    subscriptionCosts,
    toolCosts: toolCostsTotal,
    apiCosts,
    totalCosts,
    netProfit,
    margin,
    invoiceCount: Number(invoiceCountResult?.count ?? 0),
    paidInvoiceCount: Number(revenueResult?.paidCount ?? 0),
  };
}

/**
 * Generate P&L for a range of months.
 */
export async function generatePandLRange(
  startMonth: string,
  endMonth: string
): Promise<PandLMonth[]> {
  const months: string[] = [];
  const [startYear, startMo] = startMonth.split("-").map(Number);
  const [endYear, endMo] = endMonth.split("-").map(Number);

  let y = startYear;
  let m = startMo;
  while (y < endYear || (y === endYear && m <= endMo)) {
    months.push(`${y}-${String(m).padStart(2, "0")}`);
    m++;
    if (m > 12) {
      m = 1;
      y++;
    }
  }

  return Promise.all(months.map(generateMonthlyPandL));
}
