/**
 * Inngest Job: Daily Digest Email (7 AM UTC)
 *
 * Sends a morning email to Adam summarizing:
 *   - Platform MRR (vs yesterday)
 *   - Today's priorities (from /api/dashboard/priorities logic)
 *   - Recent activity (last 24h)
 *
 * Uses Resend + the daily-digest HTML template.
 */

import { inngest } from "../client";
import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { eq, and, sql, desc, gte, count, isNull, lte } from "drizzle-orm";
import * as stripeConnector from "@/lib/connectors/stripe";
import { buildDailyDigestHtml, buildDailyDigestSubject } from "@/lib/email/templates/daily-digest";
import { captureError } from "@/lib/errors";
import { getResend, FROM_EMAIL } from "@/lib/email/shared";

const DIGEST_RECIPIENT = process.env.DIGEST_EMAIL ?? "adamwolfe102@gmail.com";

export const dailyDigest = inngest.createFunction(
  {
    id: "daily-digest",
    name: "Daily Digest Email",
    retries: 2,
    onFailure: async ({ error }) => {
      captureError(error, {
        tags: { source: "inngest", job: "daily-digest" },
        level: "warning",
      });
    },
  },
  { cron: "0 7 * * *" }, // Daily 7:00 AM UTC
  async ({ step }) => {
    const resend = getResend();
    if (!resend) {
      return { skipped: true, reason: "RESEND_API_KEY not configured" };
    }

    const data = await step.run("gather-digest-data", async () => {
      const now = new Date();
      const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      const tomorrow = new Date(now.getTime() + 48 * 60 * 60 * 1000);

      const [
        mrrResult,
        activeClientsResult,
        activeProjectsResult,
        overdueInvoices,
        highPriorityRecs,
        unresolvedAlerts,
        dueSoonTasks,
        recentActivity,
        yesterdaySnapshot,
        _todaySnapshot,
      ] = await Promise.all([
        // Live MRR from Stripe
        stripeConnector.getMRR(),

        // Active clients (with kanban cards not completed)
        db
          .select({ value: sql<number>`COUNT(DISTINCT ${schema.kanbanCards.clientId})` })
          .from(schema.kanbanCards)
          .where(sql`${schema.kanbanCards.completedAt} IS NULL`),

        // Active projects
        db
          .select({ value: count() })
          .from(schema.portfolioProjects)
          .where(eq(schema.portfolioProjects.status, "active")),

        // Overdue invoices
        db
          .select({
            id: schema.invoices.id,
            clientName: schema.clients.name,
            amount: schema.invoices.amount,
            dueDate: schema.invoices.dueDate,
          })
          .from(schema.invoices)
          .leftJoin(schema.clients, eq(schema.invoices.clientId, schema.clients.id))
          .where(eq(schema.invoices.status, "overdue"))
          .orderBy(schema.invoices.dueDate)
          .limit(3),

        // Active strategy recommendations
        db
          .select({
            id: schema.strategyRecommendations.id,
            title: schema.strategyRecommendations.title,
            type: schema.strategyRecommendations.type,
            priority: schema.strategyRecommendations.priority,
            product: schema.strategyRecommendations.product,
          })
          .from(schema.strategyRecommendations)
          .where(
            and(
              eq(schema.strategyRecommendations.status, "active"),
              gte(schema.strategyRecommendations.priority, 1)
            )
          )
          .orderBy(desc(schema.strategyRecommendations.priority))
          .limit(2),

        // Unresolved critical/warning alerts
        db
          .select({
            id: schema.alerts.id,
            type: schema.alerts.type,
            severity: schema.alerts.severity,
            message: schema.alerts.message,
          })
          .from(schema.alerts)
          .where(
            and(
              isNull(schema.alerts.resolvedAt),
              sql`${schema.alerts.severity} IN ('critical', 'warning')`
            )
          )
          .limit(2),

        // Tasks due today or tomorrow
        db
          .select({
            id: schema.tasks.id,
            title: schema.tasks.title,
            dueDate: schema.tasks.dueDate,
          })
          .from(schema.tasks)
          .where(
            and(
              sql`${schema.tasks.status} NOT IN ('done', 'cancelled')`,
              gte(schema.tasks.dueDate, now),
              lte(schema.tasks.dueDate, tomorrow)
            )
          )
          .limit(2),

        // Recent audit activity
        db
          .select()
          .from(schema.auditLogs)
          .where(gte(schema.auditLogs.createdAt, yesterday))
          .orderBy(desc(schema.auditLogs.createdAt))
          .limit(5),

        // Yesterday's snapshot for MRR delta
        db
          .select({ mrr: schema.dailyMetricsSnapshots.mrr })
          .from(schema.dailyMetricsSnapshots)
          .where(gte(schema.dailyMetricsSnapshots.date, yesterday))
          .orderBy(schema.dailyMetricsSnapshots.date)
          .limit(1),

        // Today's snapshot (if exists)
        db
          .select({ mrr: schema.dailyMetricsSnapshots.mrr })
          .from(schema.dailyMetricsSnapshots)
          .where(gte(schema.dailyMetricsSnapshots.date, now))
          .orderBy(schema.dailyMetricsSnapshots.date)
          .limit(1),
      ]);

      // Portfolio tracker rows (2026-07 CRM refresh) — AR, rot, P0s, blockers
      const trackerRows = await db
        .select({
          id: schema.leads.id,
          contactName: schema.leads.contactName,
          companyName: schema.leads.companyName,
          stage: schema.leads.stage,
          priority: schema.leads.priority,
          payStatus: schema.leads.payStatus,
          totalValue: schema.leads.totalValue,
          collected: schema.leads.collected,
          nextStep: schema.leads.nextStep,
          lastStepDate: schema.leads.lastStepDate,
          lastContactedAt: schema.leads.lastContactedAt,
          ipOrLegalFlag: schema.leads.ipOrLegalFlag,
          tags: schema.leads.tags,
        })
        .from(schema.leads)
        .where(eq(schema.leads.isArchived, false))
        .catch(() => [] as never[]);

      const currentMrr = mrrResult.success ? (mrrResult.data?.mrr ?? 0) / 100 : 0;
      const prevMrr = yesterdaySnapshot[0]?.mrr;
      const mrrChange = prevMrr ? currentMrr - prevMrr / 100 : null;

      // Build priority items
      const priorities: Array<{
        type: string;
        label: string;
        subtext: string;
        urgency: string;
      }> = [];

      for (const inv of overdueInvoices) {
        const daysOverdue = inv.dueDate
          ? Math.floor((now.getTime() - new Date(inv.dueDate).getTime()) / 86400000)
          : 0;
        const amount = (inv.amount / 100).toLocaleString("en-US", {
          style: "currency",
          currency: "USD",
          maximumFractionDigits: 0,
        });
        priorities.push({
          type: "invoice",
          label: `Invoice overdue ${daysOverdue}d`,
          subtext: `${inv.clientName ?? "Unknown"} — ${amount}`,
          urgency: daysOverdue > 10 ? "critical" : "high",
        });
      }

      for (const rec of highPriorityRecs) {
        priorities.push({
          type: "recommendation",
          label: rec.title,
          subtext: [rec.product ?? "platform", rec.type.replace("_", " ")].join(" · "),
          urgency: rec.priority >= 2 ? "critical" : "high",
        });
      }

      for (const alert of unresolvedAlerts) {
        priorities.push({
          type: "alert",
          label: alert.message ?? alert.type,
          subtext: alert.type,
          urgency: alert.severity === "critical" ? "critical" : "high",
        });
      }

      for (const task of dueSoonTasks) {
        const dueLabel = task.dueDate
          ? new Date(task.dueDate).toLocaleDateString("en-US", { month: "short", day: "numeric" })
          : "soon";
        priorities.push({
          type: "task",
          label: task.title,
          subtext: `Due ${dueLabel}`,
          urgency: "normal",
        });
      }

      // ── Portfolio tracker priorities (CASH IN · rot · P0 · blockers) ──
      const realRows = trackerRows.filter(
        (r) => !(Array.isArray(r.tags) && (r.tags.includes("backlog") || r.tags.includes("internal")))
      );
      const remainingOf = (r: (typeof realRows)[number]) =>
        Math.max((r.totalValue ?? 0) - (r.collected ?? 0), 0);

      const arQueue = realRows
        .filter((r) => remainingOf(r) > 0)
        .sort((a, b) => remainingOf(b) - remainingOf(a));
      const arTotal = arQueue.reduce((s, r) => s + remainingOf(r), 0);
      for (const r of arQueue.slice(0, 3)) {
        priorities.push({
          type: "collections",
          label: `Collect $${(remainingOf(r) / 100).toLocaleString()} — ${r.companyName ?? r.contactName}`,
          subtext: `pay status: ${r.payStatus ?? "pending"} · total AR $${(arTotal / 100).toLocaleString()}`,
          urgency: r.payStatus === "overdue" ? "critical" : "high",
        });
      }

      const STALE_DAYS: Record<string, number> = {
        active: 7, prospect: 10, proposal: 5, nurture: 21,
      };
      const rotting = realRows.filter((r) => {
        const threshold = STALE_DAYS[r.stage];
        if (!threshold) return false;
        const last = r.lastStepDate
          ? new Date(r.lastStepDate)
          : r.lastContactedAt
            ? new Date(r.lastContactedAt)
            : null;
        if (!last) return true;
        return (now.getTime() - last.getTime()) / 86_400_000 > threshold;
      });
      if (rotting.length > 0) {
        priorities.push({
          type: "followup",
          label: `${rotting.length} follow-up(s) rotting past threshold`,
          subtext: rotting.slice(0, 3).map((r) => r.companyName ?? r.contactName).join(", "),
          urgency: "high",
        });
      }

      const topP0 = realRows.find(
        (r) => r.priority === "P0" && r.nextStep && remainingOf(r) === 0
      );
      if (topP0) {
        priorities.push({
          type: "p0",
          label: `P0: ${topP0.companyName ?? topP0.contactName}`,
          subtext: (topP0.nextStep ?? "").slice(0, 120),
          urgency: "high",
        });
      }

      if (realRows.some((r) => r.ipOrLegalFlag) || trackerRows.some((r) => r.ipOrLegalFlag)) {
        priorities.push({
          type: "blocker",
          label: "LeaseStack IP/ownership unresolved",
          subtext: "Top internal blocker — sits under Trig, SG RE, LBA, Guardian",
          urgency: "critical",
        });
      }

      return {
        mrr: currentMrr,
        mrrChange,
        activeClients: Number(activeClientsResult[0]?.value ?? 0),
        activeProjects: Number(activeProjectsResult[0]?.value ?? 0),
        priorities: priorities.slice(0, 9),
        recentActivity: recentActivity.map((a) => ({
          action: a.action,
          entityType: a.entityType,
          timestamp: a.createdAt.toISOString(),
        })),
        dashboardUrl:
          process.env.NEXT_PUBLIC_APP_URL ??
          `https://${process.env.VERCEL_URL ?? "amcollective.vercel.app"}`,
      };
    });

    await step.run("send-email", async () => {
      const html = buildDailyDigestHtml(data);
      const subject = buildDailyDigestSubject(data);

      await resend.emails.send({
        from: FROM_EMAIL,
        to: DIGEST_RECIPIENT,
        subject,
        html,
      });
    });

    return {
      sent: true,
      recipient: DIGEST_RECIPIENT,
      priorityCount: data.priorities.length,
    };
  }
);
