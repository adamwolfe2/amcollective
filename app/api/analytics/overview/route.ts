/**
 * GET /api/analytics/overview
 *
 * Aggregates cross-domain analytics data:
 * - Revenue trend (from daily snapshots)
 * - Lead funnel (by stage)
 * - Task velocity (completed per week)
 * - Invoice aging (by status)
 * - Cost breakdown by tool
 * - Client growth
 */

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { eq, desc, sql, count, and, gte, asc } from "drizzle-orm";
import { checkAdmin } from "@/lib/auth";
import { captureError } from "@/lib/errors";
import { aj } from "@/lib/middleware/arcjet";

export async function GET(req: NextRequest) {
  if (aj) {
    const decision = await aj.protect(req, { requested: 1 });
    if (decision.isDenied()) {
      return NextResponse.json({ error: "Rate limited" }, { status: 429 });
    }
  }

  try {
    const userId = await checkAdmin();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const now = new Date();
    const ninetyDaysAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    const [
      // Revenue trend (last 90 days of daily snapshots)
      revenueTrend,
      // Lead funnel
      leadsByStage,
      // Tasks completed per week (last 12 weeks)
      taskVelocity,
      // Invoice breakdown by status
      invoiceBreakdown,
      // Cost breakdown by tool
      costByTool,
      // Monthly cost trend
      monthlyCosts,
      // Client count over time
      clientGrowth,
      // Lead conversion (last 30 days)
      recentConversions,
      // Active tasks by priority
      tasksByPriority,
    ] = await Promise.all([
      // Revenue trend
      db
        .select({
          date: schema.dailyMetricsSnapshots.date,
          mrr: schema.dailyMetricsSnapshots.mrr,
          arr: schema.dailyMetricsSnapshots.arr,
          totalCash: schema.dailyMetricsSnapshots.totalCash,
          activeClients: schema.dailyMetricsSnapshots.activeClients,
          overdueAmount: schema.dailyMetricsSnapshots.overdueAmount,
        })
        .from(schema.dailyMetricsSnapshots)
        .where(gte(schema.dailyMetricsSnapshots.date, ninetyDaysAgo))
        .orderBy(asc(schema.dailyMetricsSnapshots.date)),

      // Lead funnel
      db
        .select({
          stage: schema.leads.stage,
          count: count(),
          totalValue: sql<number>`COALESCE(SUM(${schema.leads.estimatedValue}), 0)`,
        })
        .from(schema.leads)
        .where(eq(schema.leads.isArchived, false))
        .groupBy(schema.leads.stage),

      // Task velocity: completed tasks grouped by week
      db
        .select({
          week: sql<string>`TO_CHAR(${schema.tasks.completedAt}, 'IYYY-IW')`,
          count: count(),
        })
        .from(schema.tasks)
        .where(
          and(
            eq(schema.tasks.status, "done"),
            gte(schema.tasks.completedAt, ninetyDaysAgo)
          )
        )
        .groupBy(sql`TO_CHAR(${schema.tasks.completedAt}, 'IYYY-IW')`)
        .orderBy(sql`TO_CHAR(${schema.tasks.completedAt}, 'IYYY-IW')`),

      // Invoice breakdown
      db
        .select({
          status: schema.invoices.status,
          count: count(),
          total: sql<number>`COALESCE(SUM(${schema.invoices.amount}), 0)`,
        })
        .from(schema.invoices)
        .groupBy(schema.invoices.status),

      // Cost by tool
      db
        .select({
          tool: schema.toolAccounts.name,
          totalCents: sql<number>`COALESCE(SUM(${schema.toolCosts.amount}), 0)`,
        })
        .from(schema.toolAccounts)
        .leftJoin(
          schema.toolCosts,
          eq(schema.toolCosts.toolAccountId, schema.toolAccounts.id)
        )
        .groupBy(schema.toolAccounts.name)
        .orderBy(desc(sql`COALESCE(SUM(${schema.toolCosts.amount}), 0)`)),

      // Monthly costs (last 6 months)
      db
        .select({
          month: sql<string>`TO_CHAR(${schema.toolCosts.periodStart}, 'YYYY-MM')`,
          total: sql<number>`COALESCE(SUM(${schema.toolCosts.amount}), 0)`,
        })
        .from(schema.toolCosts)
        .groupBy(sql`TO_CHAR(${schema.toolCosts.periodStart}, 'YYYY-MM')`)
        .orderBy(sql`TO_CHAR(${schema.toolCosts.periodStart}, 'YYYY-MM')`)
        .limit(6),

      // Client growth (creation dates)
      db
        .select({
          month: sql<string>`TO_CHAR(${schema.clients.createdAt}, 'YYYY-MM')`,
          count: count(),
        })
        .from(schema.clients)
        .groupBy(sql`TO_CHAR(${schema.clients.createdAt}, 'YYYY-MM')`)
        .orderBy(sql`TO_CHAR(${schema.clients.createdAt}, 'YYYY-MM')`),

      // Recent lead conversions
      db
        .select({ count: count() })
        .from(schema.leads)
        .where(
          and(
            eq(schema.leads.stage, "closed_won"),
            gte(schema.leads.updatedAt, thirtyDaysAgo)
          )
        ),

      // Tasks by priority
      db
        .select({
          priority: schema.tasks.priority,
          count: count(),
        })
        .from(schema.tasks)
        .where(
          and(
            eq(schema.tasks.isArchived, false),
            sql`${schema.tasks.status} NOT IN ('done', 'cancelled')`
          )
        )
        .groupBy(schema.tasks.priority),
    ]);

    // Format revenue trend
    const formattedRevenueTrend = revenueTrend.map((r) => ({
      date: r.date.toISOString().split("T")[0],
      mrr: r.mrr / 100,
      arr: r.arr / 100,
      cash: r.totalCash / 100,
      clients: r.activeClients,
      overdueAmount: r.overdueAmount / 100,
    }));

    // Format lead funnel with ordered stages
    const stageOrder = [
      "awareness",
      "interest",
      "consideration",
      "intent",
      "closed_won",
      "closed_lost",
      "nurture",
    ];
    const formattedFunnel = stageOrder.map((stage) => {
      const found = leadsByStage.find((l) => l.stage === stage);
      return {
        stage,
        count: found?.count ?? 0,
        value: (found?.totalValue ?? 0) / 100,
      };
    });

    // Format invoice breakdown
    const formattedInvoices = invoiceBreakdown.map((i) => ({
      status: i.status,
      count: i.count,
      total: i.total / 100,
    }));

    // Format cost breakdown
    const formattedCosts = costByTool.map((c) => ({
      tool: c.tool,
      total: c.totalCents / 100,
    }));

    // Format monthly costs
    const formattedMonthlyCosts = monthlyCosts.map((c) => ({
      month: c.month,
      total: c.total / 100,
    }));

    // Format task velocity
    const formattedVelocity = taskVelocity.map((t) => ({
      week: t.week,
      completed: t.count,
    }));

    // Format client growth (cumulative)
    let cumulative = 0;
    const formattedClientGrowth = clientGrowth.map((c) => {
      cumulative += c.count;
      return { month: c.month, newClients: c.count, total: cumulative };
    });

    // Format tasks by priority
    const formattedPriority = tasksByPriority.map((t) => ({
      priority: t.priority,
      count: t.count,
    }));

    return NextResponse.json({
      revenueTrend: formattedRevenueTrend,
      leadFunnel: formattedFunnel,
      taskVelocity: formattedVelocity,
      invoiceBreakdown: formattedInvoices,
      costByTool: formattedCosts,
      monthlyCosts: formattedMonthlyCosts,
      clientGrowth: formattedClientGrowth,
      tasksByPriority: formattedPriority,
      conversionsLast30d: recentConversions[0]?.count ?? 0,
    }, {
      headers: { "Cache-Control": "private, max-age=300, stale-while-revalidate=600" },
    });
  } catch (error) {
    captureError(error);
    return NextResponse.json(
      { error: "Failed to load analytics" },
      { status: 500 }
    );
  }
}
