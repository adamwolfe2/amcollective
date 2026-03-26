/**
 * Dashboard Snapshot API — Manual snapshot trigger + snapshot history.
 *
 * POST: Trigger an immediate daily metrics snapshot (owner only).
 * GET: Return recent snapshots for trend display.
 */

import { NextRequest } from "next/server";
import { apiSuccess, apiError } from "@/lib/api/response";
import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { eq, sql, count, desc } from "drizzle-orm";
import { checkAdmin } from "@/lib/auth";
import { createAuditLog } from "@/lib/db/repositories/audit";
import { captureError } from "@/lib/errors";
import { aj } from "@/lib/middleware/arcjet";

export async function POST(req: NextRequest) {
  if (aj) {
    const decision = await aj.protect(req, { requested: 1 });
    if (decision.isDenied()) {
      return apiError("Rate limited", 429);
    }
  }

  const userId = await checkAdmin();
  if (!userId) {
    return apiError("Unauthorized", 401);
  }

  try {
    // Compute current metrics in parallel (same logic as Inngest job)
    const [[mrrResult], [subsCount], mercuryAccounts, [activeClients], projects, overdue] =
      await Promise.all([
        db
          .select({
            total: sql<string>`COALESCE(SUM(${schema.subscriptions.amount}), 0)`,
          })
          .from(schema.subscriptions)
          .where(eq(schema.subscriptions.status, "active")),
        db
          .select({ value: count() })
          .from(schema.subscriptions)
          .where(eq(schema.subscriptions.status, "active")),
        db.select().from(schema.mercuryAccounts),
        db
          .select({
            value: sql<number>`COUNT(DISTINCT ${schema.kanbanCards.clientId})`,
          })
          .from(schema.kanbanCards)
          .where(sql`${schema.kanbanCards.completedAt} IS NULL`),
        db
          .select({ status: schema.portfolioProjects.status })
          .from(schema.portfolioProjects),
        db
          .select({ amount: schema.invoices.amount })
          .from(schema.invoices)
          .where(eq(schema.invoices.status, "overdue")),
      ]);

    const accounts = mercuryAccounts ?? [];
    const totalCash = accounts.reduce(
      (s, a) => s + Number(a.balance),
      0
    );

    const mrr = Number(mrrResult?.total ?? 0);
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);

    const [snapshot] = await db
      .insert(schema.dailyMetricsSnapshots)
      .values({
        date: today,
        mrr,
        arr: mrr * 12,
        totalCash,
        activeClients: Number(activeClients?.value ?? 0),
        activeProjects: projects.filter((p) => p.status === "active").length,
        activeSubscriptions: subsCount?.value ?? 0,
        overdueInvoices: overdue.length,
        overdueAmount: overdue.reduce((s, inv) => s + inv.amount, 0),
        metadata: {
          manual: true,
          triggeredBy: userId,
          capturedAt: new Date().toISOString(),
        },
      })
      .onConflictDoUpdate({
        target: schema.dailyMetricsSnapshots.date,
        set: {
          mrr,
          arr: mrr * 12,
          totalCash,
          activeClients: Number(activeClients?.value ?? 0),
          activeProjects: projects.filter((p) => p.status === "active").length,
          activeSubscriptions: subsCount?.value ?? 0,
          overdueInvoices: overdue.length,
          overdueAmount: overdue.reduce((s, inv) => s + inv.amount, 0),
          metadata: {
            manual: true,
            triggeredBy: userId,
            capturedAt: new Date().toISOString(),
          },
        },
      })
      .returning();

    await createAuditLog({
      actorId: userId,
      actorType: "user",
      action: "manual_snapshot",
      entityType: "daily_metrics_snapshots",
      entityId: snapshot.id,
    });

    return apiSuccess({
      snapshot: {
        ...snapshot,
        mrr: snapshot.mrr / 100,
        arr: snapshot.arr / 100,
        totalCash: snapshot.totalCash / 100,
        overdueAmount: snapshot.overdueAmount / 100,
      },
    });
  } catch (err) {
    captureError(err, { tags: { route: "POST /api/dashboard/snapshot" } });
    return apiError("Failed to create snapshot", 500);
  }
}

export async function GET(req: NextRequest) {
  if (aj) {
    const decision = await aj.protect(req, { requested: 1 });
    if (decision.isDenied()) {
      return apiError("Rate limited", 429);
    }
  }

  const userId = await checkAdmin();
  if (!userId) {
    return apiError("Unauthorized", 401);
  }

  const snapshots = await db
    .select()
    .from(schema.dailyMetricsSnapshots)
    .orderBy(desc(schema.dailyMetricsSnapshots.date))
    .limit(30);

  return apiSuccess({
    snapshots: snapshots.map((s) => ({
      ...s,
      mrr: s.mrr / 100,
      arr: s.arr / 100,
      totalCash: s.totalCash / 100,
      overdueAmount: s.overdueAmount / 100,
    })),
  });
}
