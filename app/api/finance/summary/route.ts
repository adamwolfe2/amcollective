/**
 * Finance Summary API — Combined Mercury + Stripe financial overview.
 *
 * GET: Returns total cash, MRR, ARR, runway, and account details.
 * Cached for 5 minutes. Auth: owner or admin only.
 */

import { NextResponse } from "next/server";
import { cache } from "@/lib/cache";
import * as mercuryConnector from "@/lib/connectors/mercury";
import * as stripeConnector from "@/lib/connectors/stripe";
import { checkAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { eq, and, gte, desc, sql, count } from "drizzle-orm";
import { captureError } from "@/lib/errors";

export const runtime = "nodejs";

interface FinanceSummary {
  mercury: {
    totalCash: number;
    accounts: Array<{
      id: string;
      name: string;
      type: string;
      balance: number;
      availableBalance: number;
      last4: string;
      lastSynced: string | null;
    }>;
    lastSynced: string | null;
  };
  stripe: {
    mrr: number;
    arr: number;
    activeSubscriptions: number;
    failedPayments: number;
    churnedThisMonth: number;
  };
  runway: number | null;
  monthlySpend: number;
  calculatedAt: string;
}

async function getChurnedThisMonth(): Promise<number> {
  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);

  const [result] = await db
    .select({ value: count() })
    .from(schema.subscriptions)
    .where(
      and(
        eq(schema.subscriptions.status, "cancelled"),
        gte(schema.subscriptions.cancelledAt, monthStart)
      )
    );
  return result?.value ?? 0;
}

async function buildSummary(): Promise<FinanceSummary> {
  // Fetch Mercury data — try live, fall back to DB
  let mercuryAccounts: FinanceSummary["mercury"]["accounts"] = [];
  let totalCash = 0;
  let lastSynced: string | null = null;

  const liveResult = await mercuryConnector.getAccounts();
  if (liveResult.success && liveResult.data) {
    totalCash = liveResult.data.reduce((s, a) => s + a.currentBalance, 0);
    mercuryAccounts = liveResult.data.map((a) => ({
      id: a.id,
      name: a.name,
      type: a.type,
      balance: a.currentBalance,
      availableBalance: a.availableBalance,
      last4: a.accountNumber,
      lastSynced: new Date().toISOString(),
    }));
    lastSynced = new Date().toISOString();
  } else {
    // Fall back to DB
    const dbAccounts = await db
      .select()
      .from(schema.mercuryAccounts)
      .orderBy(desc(schema.mercuryAccounts.createdAt));

    totalCash = dbAccounts.reduce((s, a) => s + Number(a.balance), 0);
    mercuryAccounts = dbAccounts.map((a) => ({
      id: a.id,
      name: a.name,
      type: a.type,
      balance: Number(a.balance),
      availableBalance: Number(a.availableBalance),
      last4: a.accountNumber,
      lastSynced: a.lastSyncedAt?.toISOString() ?? null,
    }));
    lastSynced = dbAccounts[0]?.lastSyncedAt?.toISOString() ?? null;
  }

  // Fetch Stripe data
  const [mrrResult, invoiceResult] = await Promise.all([
    stripeConnector.getMRR(),
    stripeConnector.getInvoiceStats(),
  ]);

  const mrr = mrrResult.success ? mrrResult.data?.mrr ?? 0 : 0;
  const activeSubs = mrrResult.success
    ? mrrResult.data?.activeSubscriptions ?? 0
    : 0;
  const failedPayments = invoiceResult.success
    ? invoiceResult.data?.overdue.count ?? 0
    : 0;

  // Calculate monthly spend from last 60 days of debits
  const sixtyDaysAgo = new Date();
  sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60);

  const [spendResult] = await db
    .select({
      totalSpend: sql<string>`COALESCE(SUM(ABS(${schema.mercuryTransactions.amount})), 0)`,
    })
    .from(schema.mercuryTransactions)
    .where(
      and(
        eq(schema.mercuryTransactions.direction, "debit"),
        gte(schema.mercuryTransactions.postedAt, sixtyDaysAgo)
      )
    );

  const totalSpend60d = Number(spendResult?.totalSpend ?? 0);
  const monthlySpend = totalSpend60d / 2;
  const runway = monthlySpend > 0 ? Number((totalCash / monthlySpend).toFixed(1)) : null;

  return {
    mercury: {
      totalCash,
      accounts: mercuryAccounts,
      lastSynced,
    },
    stripe: {
      mrr: mrr / 100, // convert cents to dollars
      arr: (mrr * 12) / 100,
      activeSubscriptions: activeSubs,
      failedPayments,
      churnedThisMonth: await getChurnedThisMonth(),
    },
    runway,
    monthlySpend,
    calculatedAt: new Date().toISOString(),
  };
}

export async function GET() {
  const userId = await checkAdmin();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    // Check cache first (5 minute TTL)
    const cached = await cache.get<FinanceSummary>("finance:summary");
    if (cached) {
      return NextResponse.json(cached, { headers: { "Cache-Control": "no-store" } });
    }

    const summary = await buildSummary();
    await cache.set("finance:summary", summary, 300); // 5 min
    return NextResponse.json(summary, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    captureError(err, { tags: { route: "GET /api/finance/summary" } });
    return NextResponse.json(
      {
        error: "Failed to build finance summary",
      },
      { status: 500 }
    );
  }
}
