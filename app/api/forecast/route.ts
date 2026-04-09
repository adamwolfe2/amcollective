/**
 * GET /api/forecast -- revenue forecast model
 *
 * Sources: recurring invoices, pipeline (leads), active contracts, historical invoices.
 * Returns 6-month forecast with confidence ranges.
 */

import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { eq, and, gte, sql, count } from "drizzle-orm";
import { checkAdmin } from "@/lib/auth";
import { captureError } from "@/lib/errors";

// Conversion probability by pipeline stage
const STAGE_PROBABILITIES: Record<string, number> = {
  awareness: 0.05,
  interest: 0.15,
  consideration: 0.3,
  intent: 0.6,
  closed_won: 1.0,
  nurture: 0.1,
};

export async function GET() {
  try {
    const userId = await checkAdmin();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

    // Run all 4 independent DB queries in parallel
    const [recurringRows, leads, contracts, historicalMonths] = await Promise.all([
      // 1. Recurring revenue
      db
        .select({
          amount: schema.recurringInvoices.total,
          interval: schema.recurringInvoices.interval,
        })
        .from(schema.recurringInvoices)
        .where(eq(schema.recurringInvoices.status, "active")),
      // 2. Pipeline leads
      db
        .select({
          stage: schema.leads.stage,
          estimatedValue: schema.leads.estimatedValue,
        })
        .from(schema.leads)
        .where(
          and(
            eq(schema.leads.isArchived, false),
            sql`${schema.leads.stage} NOT IN ('closed_won', 'closed_lost')`
          )
        ),
      // 3. Active contracts
      db
        .select({
          totalValue: schema.contracts.totalValue,
          startDate: schema.contracts.startDate,
          endDate: schema.contracts.endDate,
        })
        .from(schema.contracts)
        .where(eq(schema.contracts.status, "active")),
      // 4. Historical monthly revenue
      db
        .select({
          month: sql<string>`TO_CHAR(${schema.invoices.paidAt}, 'YYYY-MM')`,
          total: sql<number>`SUM(${schema.invoices.amount})`,
          invoiceCount: count(),
        })
        .from(schema.invoices)
        .where(
          and(
            eq(schema.invoices.status, "paid"),
            gte(schema.invoices.paidAt, sixMonthsAgo)
          )
        )
        .groupBy(sql`TO_CHAR(${schema.invoices.paidAt}, 'YYYY-MM')`)
        .orderBy(sql`TO_CHAR(${schema.invoices.paidAt}, 'YYYY-MM')`),
    ]);

    let monthlyRecurring = 0;
    for (const row of recurringRows) {
      const amount = row.amount ?? 0;
      switch (row.interval) {
        case "weekly":
          monthlyRecurring += amount * 4.33;
          break;
        case "biweekly":
          monthlyRecurring += amount * 2.17;
          break;
        case "monthly":
          monthlyRecurring += amount;
          break;
        case "quarterly":
          monthlyRecurring += amount / 3;
          break;
        case "annual":
          monthlyRecurring += amount / 12;
          break;
      }
    }

    let weightedPipeline = 0;
    let totalPipeline = 0;
    for (const lead of leads) {
      const value = lead.estimatedValue ?? 0;
      totalPipeline += value;
      const prob = STAGE_PROBABILITIES[lead.stage] ?? 0.1;
      weightedPipeline += value * prob;
    }

    let contractedRevenue = 0;
    for (const c of contracts) {
      contractedRevenue += c.totalValue ?? 0;
    }

    const monthlyRevenues = historicalMonths.map((m) => Number(m.total) || 0);
    const avgMonthlyRevenue =
      monthlyRevenues.length > 0
        ? monthlyRevenues.reduce((a, b) => a + b, 0) / monthlyRevenues.length
        : 0;

    // Calculate trend (simple linear regression slope)
    let trend = 0;
    if (monthlyRevenues.length >= 2) {
      const n = monthlyRevenues.length;
      const xMean = (n - 1) / 2;
      const yMean = avgMonthlyRevenue;
      let numerator = 0;
      let denominator = 0;
      for (let i = 0; i < n; i++) {
        numerator += (i - xMean) * (monthlyRevenues[i] - yMean);
        denominator += (i - xMean) * (i - xMean);
      }
      trend = denominator !== 0 ? numerator / denominator : 0;
    }

    // 5. Build 6-month forecast
    const forecast: Array<{
      month: string;
      recurring: number;
      pipeline: number;
      historical: number;
      total: number;
      low: number;
      high: number;
    }> = [];

    const now = new Date();
    for (let i = 0; i < 6; i++) {
      const forecastDate = new Date(now.getFullYear(), now.getMonth() + i + 1, 1);
      const monthLabel = forecastDate.toLocaleDateString("en-US", {
        month: "short",
        year: "numeric",
      });

      // Recurring stays stable
      const recurring = monthlyRecurring;

      // Pipeline converts over time (spread weighted pipeline over 3 months with decay)
      const pipelineContribution =
        i < 3 ? (weightedPipeline / 3) * (1 - i * 0.2) : 0;

      // Historical trend extrapolation
      const historicalProjection = avgMonthlyRevenue + trend * (monthlyRevenues.length + i);

      // Blended forecast
      const total = recurring + pipelineContribution + Math.max(0, historicalProjection - recurring);
      const low = total * 0.7;
      const high = total * 1.3;

      forecast.push({
        month: monthLabel,
        recurring: Math.round(recurring),
        pipeline: Math.round(pipelineContribution),
        historical: Math.round(Math.max(0, historicalProjection)),
        total: Math.round(total),
        low: Math.round(low),
        high: Math.round(high),
      });
    }

    return NextResponse.json({
      summary: {
        monthlyRecurring: Math.round(monthlyRecurring),
        weightedPipeline: Math.round(weightedPipeline),
        totalPipeline: Math.round(totalPipeline),
        contractedRevenue: Math.round(contractedRevenue),
        avgMonthlyRevenue: Math.round(avgMonthlyRevenue),
        trend: Math.round(trend),
        leadCount: leads.length,
        activeContracts: contracts.length,
      },
      historical: historicalMonths.map((m) => ({
        month: m.month,
        revenue: Number(m.total) || 0,
        invoices: Number(m.invoiceCount),
      })),
      forecast,
      calculatedAt: new Date().toISOString(),
    }, {
      headers: { "Cache-Control": "private, max-age=60, stale-while-revalidate=120" },
    });
  } catch (error) {
    captureError(error);
    return NextResponse.json(
      { error: "Failed to build forecast" },
      { status: 500 }
    );
  }
}
