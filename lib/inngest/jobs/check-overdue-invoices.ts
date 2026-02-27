/**
 * Inngest Job — Check Overdue Invoices
 *
 * Runs daily at 9 AM PT (5 PM UTC).
 * Marks overdue invoices, escalates reminders, and flags at-risk clients.
 */

import { inngest } from "../client";
import { captureError } from "@/lib/errors";
import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { eq, and, sql, lt } from "drizzle-orm";
import { createAlert } from "@/lib/db/repositories/alerts";
import { createAuditLog } from "@/lib/db/repositories/audit";

export const checkOverdueInvoices = inngest.createFunction(
  {
    id: "check-overdue-invoices",
    name: "Check Overdue Invoices",
    retries: 2,
    onFailure: async ({ error }) => {
      captureError(error, {
        tags: { source: "inngest", job: "check-overdue-invoices" },
        level: "error",
      });
    },
  },
  { cron: "0 17 * * *" }, // 5 PM UTC = 9 AM PT
  async ({ step }) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Step 1: Find and mark overdue invoices
    const overdueInvoices = await step.run("find-overdue-invoices", async () => {
      // Find invoices that are open/sent and past due
      const results = await db
        .select({
          invoice: schema.invoices,
          clientName: schema.clients.name,
          clientId: schema.clients.id,
        })
        .from(schema.invoices)
        .leftJoin(schema.clients, eq(schema.invoices.clientId, schema.clients.id))
        .where(
          and(
            sql`${schema.invoices.status} IN ('open', 'sent')`,
            lt(schema.invoices.dueDate, today)
          )
        );

      // Mark them all as overdue
      if (results.length > 0) {
        await db
          .update(schema.invoices)
          .set({ status: "overdue" })
          .where(
            and(
              sql`${schema.invoices.status} IN ('open', 'sent')`,
              lt(schema.invoices.dueDate, today)
            )
          );
      }

      return results.map((r) => ({
        id: r.invoice.id,
        number: r.invoice.number,
        amount: r.invoice.amount,
        dueDate: r.invoice.dueDate,
        reminderCount: r.invoice.reminderCount,
        clientId: r.clientId,
        clientName: r.clientName,
      }));
    });

    // Also fetch already-overdue invoices for escalation
    const allOverdue = await step.run("fetch-all-overdue", async () => {
      return db
        .select({
          invoice: schema.invoices,
          clientName: schema.clients.name,
          clientId: schema.clients.id,
        })
        .from(schema.invoices)
        .leftJoin(schema.clients, eq(schema.invoices.clientId, schema.clients.id))
        .where(eq(schema.invoices.status, "overdue"));
    });

    // Step 2: Escalate reminders based on days overdue
    const escalations = await step.run("escalate-reminders", async () => {
      const results = { firstReminder: 0, secondReminder: 0, critical: 0 };

      for (const row of allOverdue) {
        const inv = row.invoice;
        if (!inv.dueDate) continue;

        const daysOverdue = Math.floor(
          (today.getTime() - new Date(inv.dueDate).getTime()) / (1000 * 60 * 60 * 24)
        );

        // First reminder: 3+ days overdue, reminderCount = 0
        if (inv.reminderCount === 0 && daysOverdue >= 3) {
          await db
            .update(schema.invoices)
            .set({ reminderCount: 1 })
            .where(eq(schema.invoices.id, inv.id));

          await createAuditLog({
            actorId: "system",
            actorType: "system",
            action: "first_overdue_reminder",
            entityType: "invoice",
            entityId: inv.id,
            metadata: {
              daysOverdue,
              amount: inv.amount,
              clientName: row.clientName,
            },
          });
          results.firstReminder++;
        }

        // Second reminder: 10+ days overdue, reminderCount = 1
        if (inv.reminderCount === 1 && daysOverdue >= 10) {
          await db
            .update(schema.invoices)
            .set({ reminderCount: 2 })
            .where(eq(schema.invoices.id, inv.id));

          await createAuditLog({
            actorId: "system",
            actorType: "system",
            action: "second_overdue_reminder",
            entityType: "invoice",
            entityId: inv.id,
            metadata: {
              daysOverdue,
              amount: inv.amount,
              clientName: row.clientName,
            },
          });
          results.secondReminder++;
        }

        // Critical: 21+ days overdue, reminderCount = 2
        if (inv.reminderCount === 2 && daysOverdue >= 21) {
          await db
            .update(schema.invoices)
            .set({ reminderCount: 3 })
            .where(eq(schema.invoices.id, inv.id));

          await createAlert({
            type: "cost_anomaly",
            severity: "critical",
            title: `Invoice 21+ days overdue: ${inv.number ?? inv.id}`,
            message: `${row.clientName ?? "Unknown client"} — $${(inv.amount / 100).toLocaleString("en-US", { minimumFractionDigits: 2 })} is ${daysOverdue} days overdue.`,
            metadata: {
              invoiceId: inv.id,
              daysOverdue,
              amount: inv.amount,
              clientId: row.clientId,
            },
          });

          await createAuditLog({
            actorId: "system",
            actorType: "system",
            action: "critical_overdue_alert",
            entityType: "invoice",
            entityId: inv.id,
            metadata: {
              daysOverdue,
              amount: inv.amount,
              clientName: row.clientName,
            },
          });
          results.critical++;
        }
      }

      return results;
    });

    // Step 3: Flag clients with 7+ day overdue invoices as at_risk
    const atRiskUpdates = await step.run("flag-at-risk-clients", async () => {
      const sevenDaysAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);

      // Find clients with invoices overdue 7+ days
      const atRiskClients = await db
        .selectDistinct({ clientId: schema.invoices.clientId })
        .from(schema.invoices)
        .where(
          and(
            eq(schema.invoices.status, "overdue"),
            lt(schema.invoices.dueDate, sevenDaysAgo)
          )
        );

      let updated = 0;
      for (const row of atRiskClients) {
        if (!row.clientId) continue;
        await db
          .update(schema.clients)
          .set({ paymentStatus: "at_risk" })
          .where(eq(schema.clients.id, row.clientId));
        updated++;
      }

      return updated;
    });

    return {
      success: true,
      newlyOverdue: overdueInvoices.length,
      totalOverdue: allOverdue.length,
      escalations,
      clientsFlaggedAtRisk: atRiskUpdates,
    };
  }
);
