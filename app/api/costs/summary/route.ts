/**
 * Cost Summary API — Aggregated cost metrics.
 *
 * GET /api/costs/summary — Monthly burn by company, upcoming renewals, totals
 * Auth: owner or admin only.
 */

import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { eq, and, lte, sql } from "drizzle-orm";
import { checkAdmin } from "@/lib/auth";
import { captureError } from "@/lib/errors";

export async function GET() {
  const userId = await checkAdmin();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const thirtyDaysFromNow = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

    const [activeCosts, burnByCompany, upcomingRenewals] = await Promise.all([
      // All active costs
      db
        .select()
        .from(schema.subscriptionCosts)
        .where(eq(schema.subscriptionCosts.isActive, true)),

      // Monthly burn grouped by company tag
      db
        .select({
          companyTag: schema.subscriptionCosts.companyTag,
          totalMonthly: sql<string>`SUM(CASE
            WHEN ${schema.subscriptionCosts.billingCycle} = 'annual' THEN ${schema.subscriptionCosts.amount} / 12
            ELSE ${schema.subscriptionCosts.amount}
          END)`,
          count: sql<number>`COUNT(*)`,
        })
        .from(schema.subscriptionCosts)
        .where(eq(schema.subscriptionCosts.isActive, true))
        .groupBy(schema.subscriptionCosts.companyTag),

      // Upcoming renewals in next 30 days
      db
        .select()
        .from(schema.subscriptionCosts)
        .where(
          and(
            eq(schema.subscriptionCosts.isActive, true),
            lte(schema.subscriptionCosts.nextRenewal, thirtyDaysFromNow)
          )
        ),
    ]);

    // Total monthly burn (normalize annual to monthly)
    const totalMonthlyBurn = activeCosts.reduce((sum, cost) => {
      const monthly = cost.billingCycle === "annual" ? cost.amount / 12 : cost.amount;
      return sum + monthly;
    }, 0);

    return NextResponse.json({
      totalMonthlyBurn: Math.round(totalMonthlyBurn) / 100,
      totalActiveCosts: activeCosts.length,
      burnByCompany: burnByCompany.map((b) => ({
        companyTag: b.companyTag,
        monthlyBurn: Math.round(Number(b.totalMonthly ?? 0)) / 100,
        count: b.count,
      })),
      upcomingRenewals: upcomingRenewals.map((r) => ({
        id: r.id,
        name: r.name,
        vendor: r.vendor,
        amount: r.amount / 100,
        billingCycle: r.billingCycle,
        nextRenewal: r.nextRenewal?.toISOString() ?? null,
        companyTag: r.companyTag,
      })),
    }, {
      headers: { "Cache-Control": "private, max-age=60, stale-while-revalidate=120" },
    });
  } catch (err) {
    captureError(err, { tags: { route: "GET /api/costs/summary" } });
    return NextResponse.json(
      { error: "Failed to compute cost summary" },
      { status: 500 }
    );
  }
}
