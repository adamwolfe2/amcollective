/**
 * Inngest Job — Snapshot Daily Metrics
 *
 * Runs daily at 4 AM UTC. Captures MRR, cash, client counts, invoice stats
 * into dailyMetricsSnapshots for historical delta calculations.
 */

import { inngest } from "../client";
import { captureError } from "@/lib/errors";
import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { eq, sql, count } from "drizzle-orm";
import { createAuditLog } from "@/lib/db/repositories/audit";

export const snapshotDailyMetrics = inngest.createFunction(
  {
    id: "snapshot-daily-metrics",
    name: "Snapshot Daily Metrics",
    retries: 3,
    onFailure: async ({ error }) => {
      captureError(error, {
        tags: { source: "inngest", job: "snapshot-daily-metrics" },
        level: "error",
      });
    },
  },
  { cron: "0 4 * * *" }, // 4 AM UTC daily
  async ({ step }) => {
    // Step 1: Compute all metrics in one step (4 parallel DB queries — fewer Inngest step executions)
    const { mrrData, cashData, countData, overdueData } = await step.run("compute-all-metrics", async () => {
      const [mrrResult, subsCount, accounts, activeClientsResult, overdueRows] = await Promise.all([
        db.select({ total: sql<string>`COALESCE(SUM(${schema.subscriptions.amount}), 0)` })
          .from(schema.subscriptions)
          .where(eq(schema.subscriptions.status, "active")),
        db.select({ value: count() })
          .from(schema.subscriptions)
          .where(eq(schema.subscriptions.status, "active")),
        db.select({ balance: schema.mercuryAccounts.balance }).from(schema.mercuryAccounts),
        db.select({ value: sql<number>`COUNT(DISTINCT ${schema.kanbanCards.clientId})` })
          .from(schema.kanbanCards)
          .where(sql`${schema.kanbanCards.completedAt} IS NULL`),
        db.select({ amount: schema.invoices.amount, status: schema.portfolioProjects.status })
          .from(schema.invoices)
          .where(eq(schema.invoices.status, "overdue")),
      ]);

      const [projectRows] = await Promise.all([
        db.select({ status: schema.portfolioProjects.status }).from(schema.portfolioProjects),
      ]);

      const mrr = Number(mrrResult[0]?.total ?? 0);
      return {
        mrrData: { mrr, arr: mrr * 12, activeSubscriptions: subsCount[0]?.value ?? 0 },
        cashData: accounts.reduce((s, a) => s + Number(a.balance), 0),
        countData: {
          activeClients: Number(activeClientsResult[0]?.value ?? 0),
          activeProjects: projectRows.filter((p) => p.status === "active").length,
        },
        overdueData: {
          overdueInvoices: overdueRows.length,
          overdueAmount: overdueRows.reduce((s, inv) => s + inv.amount, 0),
        },
      };
    });

    // Step 5: Upsert the snapshot (unique on date)
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);

    const snapshot = await step.run("upsert-snapshot", async () => {
      const [result] = await db
        .insert(schema.dailyMetricsSnapshots)
        .values({
          date: today,
          mrr: mrrData.mrr,
          arr: mrrData.arr,
          totalCash: cashData,
          activeClients: countData.activeClients,
          activeProjects: countData.activeProjects,
          activeSubscriptions: mrrData.activeSubscriptions,
          overdueInvoices: overdueData.overdueInvoices,
          overdueAmount: overdueData.overdueAmount,
          metadata: {
            capturedAt: new Date().toISOString(),
          },
        })
        .onConflictDoUpdate({
          target: schema.dailyMetricsSnapshots.date,
          set: {
            mrr: mrrData.mrr,
            arr: mrrData.arr,
            totalCash: cashData,
            activeClients: countData.activeClients,
            activeProjects: countData.activeProjects,
            activeSubscriptions: mrrData.activeSubscriptions,
            overdueInvoices: overdueData.overdueInvoices,
            overdueAmount: overdueData.overdueAmount,
            metadata: {
              capturedAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            },
          },
        })
        .returning();

      return result;
    });

    // Step 6: Audit log
    await step.run("audit-log", async () => {
      await createAuditLog({
        actorId: "system",
        actorType: "system",
        action: "snapshot_daily_metrics",
        entityType: "daily_metrics_snapshots",
        entityId: snapshot.id,
        metadata: {
          mrr: mrrData.mrr,
          totalCash: cashData,
          activeClients: countData.activeClients,
        },
      });
    });

    return {
      success: true,
      date: today.toISOString(),
      mrr: mrrData.mrr,
      totalCash: cashData,
      activeClients: countData.activeClients,
    };
  }
);
