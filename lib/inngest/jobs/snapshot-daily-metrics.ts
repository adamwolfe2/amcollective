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
    // Step 1: Compute MRR from active subscriptions
    const mrrData = await step.run("compute-mrr", async () => {
      const [result] = await db
        .select({
          total: sql<string>`COALESCE(SUM(${schema.subscriptions.amount}), 0)`,
        })
        .from(schema.subscriptions)
        .where(eq(schema.subscriptions.status, "active"));

      const [subsCount] = await db
        .select({ value: count() })
        .from(schema.subscriptions)
        .where(eq(schema.subscriptions.status, "active"));

      const mrr = Number(result?.total ?? 0);
      return {
        mrr,
        arr: mrr * 12,
        activeSubscriptions: subsCount?.value ?? 0,
      };
    });

    // Step 2: Compute cash from Mercury accounts
    const cashData = await step.run("compute-cash", async () => {
      const accounts = await db.select().from(schema.mercuryAccounts);
      return accounts.reduce((s, a) => s + Number(a.balance), 0);
    });

    // Step 3: Compute client + project counts
    const countData = await step.run("compute-counts", async () => {
      const [activeClients] = await db
        .select({
          value: sql<number>`COUNT(DISTINCT ${schema.kanbanCards.clientId})`,
        })
        .from(schema.kanbanCards)
        .where(sql`${schema.kanbanCards.completedAt} IS NULL`);

      const projects = await db
        .select({ status: schema.portfolioProjects.status })
        .from(schema.portfolioProjects);

      const activeProjects = projects.filter(
        (p) => p.status === "active"
      ).length;

      return {
        activeClients: Number(activeClients?.value ?? 0),
        activeProjects,
      };
    });

    // Step 4: Compute overdue invoice stats
    const overdueData = await step.run("compute-overdue", async () => {
      const overdue = await db
        .select({ amount: schema.invoices.amount })
        .from(schema.invoices)
        .where(eq(schema.invoices.status, "overdue"));

      return {
        overdueInvoices: overdue.length,
        overdueAmount: overdue.reduce((s, inv) => s + inv.amount, 0),
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
