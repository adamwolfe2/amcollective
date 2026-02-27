/**
 * Inngest Job — Weekly MRR Report
 *
 * Runs Sunday at 10 PM UTC (2 PM PT).
 * Sends a week-over-week financial summary to Slack.
 */

import { inngest } from "../client";
import { captureError } from "@/lib/errors";
import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { desc, eq, and, gte, sql, count } from "drizzle-orm";
import { notifySlack } from "@/lib/webhooks/slack";
import { createAuditLog } from "@/lib/db/repositories/audit";
import { notifyAdmins } from "@/lib/db/repositories/notifications";

export const weeklyReport = inngest.createFunction(
  {
    id: "weekly-report",
    name: "Weekly MRR Report",
    retries: 2,
    onFailure: async ({ error }) => {
      captureError(error, {
        tags: { source: "inngest", job: "weekly-report" },
        level: "error",
      });
    },
  },
  { cron: "0 22 * * 0" }, // Sunday 10 PM UTC = 2 PM PT
  async ({ step }) => {
    const report = await step.run("build-report", async () => {
      const now = new Date();
      const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

      // Get snapshots for WoW comparison
      const [currentSnapshots, weekAgoSnapshots] = await Promise.all([
        db
          .select()
          .from(schema.dailyMetricsSnapshots)
          .orderBy(desc(schema.dailyMetricsSnapshots.date))
          .limit(1),
        db
          .select()
          .from(schema.dailyMetricsSnapshots)
          .where(
            sql`${schema.dailyMetricsSnapshots.date} <= ${weekAgo.toISOString().split("T")[0]}`
          )
          .orderBy(desc(schema.dailyMetricsSnapshots.date))
          .limit(1),
      ]);

      const current = currentSnapshots[0];
      const previous = weekAgoSnapshots[0];

      const mrr = current?.mrr ?? 0;
      const mrrDelta = previous ? mrr - (previous.mrr ?? 0) : 0;
      const totalCash = current?.totalCash ?? 0;
      const cashDelta = previous ? totalCash - (previous.totalCash ?? 0) : 0;
      const activeClients = current?.activeClients ?? 0;
      const clientDelta = previous
        ? activeClients - (previous.activeClients ?? 0)
        : 0;

      // Invoices paid this week
      const [paidThisWeek] = await db
        .select({
          count: count(),
          total: sql<number>`COALESCE(SUM(${schema.invoices.amount}), 0)`,
        })
        .from(schema.invoices)
        .where(
          and(eq(schema.invoices.status, "paid"), gte(schema.invoices.paidAt, weekAgo))
        );

      // Churned subscriptions this week
      const [churnedThisWeek] = await db
        .select({ count: count() })
        .from(schema.subscriptions)
        .where(
          and(
            eq(schema.subscriptions.status, "cancelled"),
            gte(schema.subscriptions.cancelledAt, weekAgo)
          )
        );

      return {
        mrr,
        mrrDelta,
        totalCash,
        cashDelta,
        activeClients,
        clientDelta,
        invoicesPaidCount: paidThisWeek?.count ?? 0,
        invoicesPaidTotal: Number(paidThisWeek?.total ?? 0),
        churnedCount: churnedThisWeek?.count ?? 0,
      };
    });

    await step.run("send-to-slack", async () => {
      const formatDelta = (delta: number, isCents = false) => {
        const val = isCents ? delta / 100 : delta;
        const sign = delta >= 0 ? "+" : "";
        return `${sign}${isCents ? "$" + Math.abs(val).toFixed(0) : val}`;
      };

      const dateStr = new Date().toLocaleDateString("en-US", {
        month: "long",
        day: "numeric",
      });

      const message = `*Weekly AM Collective Report -- ${dateStr}*

*Revenue*
  MRR: $${(report.mrr / 100).toFixed(0)}/mo  (${formatDelta(report.mrrDelta, true)} WoW)
  Cash: $${(report.totalCash / 100).toFixed(0)}  (${formatDelta(report.cashDelta, true)} WoW)

*Collections This Week*
  ${report.invoicesPaidCount} invoice(s) paid -- $${(report.invoicesPaidTotal / 100).toFixed(0)} collected

*Clients*
  ${report.activeClients} active  (${formatDelta(report.clientDelta)} WoW)
  ${report.churnedCount} churned this week

Have a great week.`;

      await notifySlack(message);
    });

    await step.run("notify-admins-report-ready", async () => {
      await notifyAdmins({
        type: "report_ready",
        title: "Weekly report is ready",
        message: `MRR: $${(report.mrr / 100).toFixed(0)}/mo, ${report.activeClients} active clients, ${report.invoicesPaidCount} invoices collected.`,
        link: "/finance",
      });
    });

    await step.run("audit-log", async () => {
      await createAuditLog({
        actorId: "system",
        actorType: "system",
        action: "weekly_report_sent",
        entityType: "system",
        entityId: "weekly-report",
        metadata: {
          mrr: report.mrr,
          mrrDelta: report.mrrDelta,
          activeClients: report.activeClients,
          invoicesPaidCount: report.invoicesPaidCount,
        },
      });
    });

    return { success: true, ...report };
  }
);
