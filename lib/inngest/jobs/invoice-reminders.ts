/**
 * Inngest Job — Invoice Payment Reminders
 *
 * Runs daily at 5 PM UTC (9 AM PT).
 * Sends email reminders for invoices due soon and overdue invoices.
 */

import { inngest } from "../client";
import { captureError } from "@/lib/errors";
import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { eq, and, gte, lte, or, isNull } from "drizzle-orm";
import { buildInvoiceEmail } from "@/lib/invoices/email";
import { getResend, FROM_EMAIL } from "@/lib/email/shared";
import { format } from "date-fns";
import { createAuditLog } from "@/lib/db/repositories/audit";
import { notifySlack } from "@/lib/webhooks/slack";
import { notifyAdmins } from "@/lib/db/repositories/notifications";

export const invoiceReminders = inngest.createFunction(
  {
    id: "invoice-reminders",
    name: "Invoice Payment Reminders",
    retries: 2,
    onFailure: async ({ error }) => {
      captureError(error, {
        tags: { source: "inngest", job: "invoice-reminders" },
        level: "error",
      });
    },
  },
  { cron: "0 17 * * *" }, // 5 PM UTC = 9 AM PT daily
  async ({ step }) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const sevenDaysAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
    const threeDaysOut = new Date(today.getTime() + 3 * 24 * 60 * 60 * 1000);

    // Step 1: Find invoices due in 3 days (friendly reminder)
    const dueSoon = await step.run("find-due-soon", async () => {
      return db
        .select({
          invoice: schema.invoices,
          clientName: schema.clients.name,
          clientEmail: schema.clients.email,
        })
        .from(schema.invoices)
        .leftJoin(schema.clients, eq(schema.invoices.clientId, schema.clients.id))
        .where(
          and(
            eq(schema.invoices.status, "sent"),
            gte(schema.invoices.dueDate, today),
            lte(schema.invoices.dueDate, threeDaysOut)
          )
        );
    });

    // Step 2: Find overdue invoices needing a reminder (not reminded in 7 days)
    const overdueToRemind = await step.run("find-overdue-needing-reminder", async () => {
      return db
        .select({
          invoice: schema.invoices,
          clientName: schema.clients.name,
          clientEmail: schema.clients.email,
        })
        .from(schema.invoices)
        .leftJoin(schema.clients, eq(schema.invoices.clientId, schema.clients.id))
        .where(
          and(
            eq(schema.invoices.status, "overdue"),
            or(
              isNull(schema.invoices.lastReminderAt),
              lte(schema.invoices.lastReminderAt, sevenDaysAgo)
            )
          )
        );
    });

    // Step 3: Send reminders via Resend
    let remindersSent = 0;
    const resend = getResend();

    if (!resend) {
      return { remindersSent: 0, error: "RESEND_API_KEY not configured" };
    }

    const from = FROM_EMAIL;

    // Send due-soon reminders
    for (const row of dueSoon) {
      if (!row.clientEmail) continue;

      await step.run(`remind-due-soon-${row.invoice.id}`, async () => {
        const inv = row.invoice;
        const lineItems =
          (inv.lineItems as
            | { description: string; quantity: number; unitPrice: number }[]
            | null) ?? [];
        const subtotal = lineItems.reduce(
          (s, li) => s + li.quantity * li.unitPrice,
          0
        );

        const html = buildInvoiceEmail({
          invoiceNumber: inv.number ?? `INV-${inv.id.slice(0, 8)}`,
          issueDate: format(inv.createdAt, "MMMM d, yyyy"),
          dueDate: inv.dueDate
            ? format(inv.dueDate, "MMMM d, yyyy")
            : "Upon receipt",
          clientName: row.clientName ?? "Client",
          lineItems,
          subtotal,
          taxRate: inv.taxRate ?? 0,
          taxAmount: inv.taxAmount ?? 0,
          total: inv.amount,
          notes: `Friendly reminder: this invoice is due ${
            inv.dueDate ? format(inv.dueDate, "MMMM d, yyyy") : "soon"
          }. Thank you for your prompt payment.`,
          paymentLinkUrl: inv.stripePaymentLinkUrl,
        });

        await resend.emails.send({
          from,
          to: row.clientEmail!,
          subject: `Reminder: Invoice ${inv.number ?? inv.id.slice(0, 8)} due ${
            inv.dueDate ? format(inv.dueDate, "MMM d") : "soon"
          }`,
          html,
        });

        await db
          .update(schema.invoices)
          .set({ lastReminderAt: new Date() })
          .where(eq(schema.invoices.id, inv.id));

        await createAuditLog({
          actorId: "system",
          actorType: "system",
          action: "send_due_reminder",
          entityType: "invoice",
          entityId: inv.id,
          metadata: {
            amount: inv.amount,
            clientName: row.clientName,
            type: "due_soon",
          },
        });

        remindersSent++;
      });
    }

    // Send overdue reminders
    for (const row of overdueToRemind) {
      if (!row.clientEmail) continue;

      await step.run(`remind-overdue-${row.invoice.id}`, async () => {
        const inv = row.invoice;
        const daysOverdue = inv.dueDate
          ? Math.floor(
              (today.getTime() - new Date(inv.dueDate).getTime()) /
                (1000 * 60 * 60 * 24)
            )
          : 0;

        const lineItems =
          (inv.lineItems as
            | { description: string; quantity: number; unitPrice: number }[]
            | null) ?? [];
        const subtotal = lineItems.reduce(
          (s, li) => s + li.quantity * li.unitPrice,
          0
        );

        const html = buildInvoiceEmail({
          invoiceNumber: inv.number ?? `INV-${inv.id.slice(0, 8)}`,
          issueDate: format(inv.createdAt, "MMMM d, yyyy"),
          dueDate: inv.dueDate
            ? format(inv.dueDate, "MMMM d, yyyy")
            : "Upon receipt",
          clientName: row.clientName ?? "Client",
          lineItems,
          subtotal,
          taxRate: inv.taxRate ?? 0,
          taxAmount: inv.taxAmount ?? 0,
          total: inv.amount,
          notes: `This invoice is ${daysOverdue} days past due. Please arrange payment at your earliest convenience. If you have already paid, please disregard this notice.`,
          paymentLinkUrl: inv.stripePaymentLinkUrl,
        });

        await resend.emails.send({
          from,
          to: row.clientEmail!,
          subject: `Overdue: Invoice ${
            inv.number ?? inv.id.slice(0, 8)
          } — $${(inv.amount / 100).toFixed(2)} past due`,
          html,
        });

        await db
          .update(schema.invoices)
          .set({ lastReminderAt: new Date() })
          .where(eq(schema.invoices.id, inv.id));

        await createAuditLog({
          actorId: "system",
          actorType: "system",
          action: "send_overdue_reminder",
          entityType: "invoice",
          entityId: inv.id,
          metadata: {
            amount: inv.amount,
            clientName: row.clientName,
            daysOverdue,
            type: "overdue",
          },
        });

        remindersSent++;
      });
    }

    if (remindersSent > 0) {
      await notifySlack(
        `Invoice reminders sent: ${remindersSent} (${dueSoon.length} due soon, ${overdueToRemind.length} overdue)`
      );

      await notifyAdmins({
        type: "invoice_overdue",
        title: `${remindersSent} invoice reminder(s) sent`,
        message: `${dueSoon.length} due soon, ${overdueToRemind.length} overdue.`,
        link: "/invoices",
      });
    }

    return {
      success: true,
      remindersSent,
      dueSoon: dueSoon.length,
      overdue: overdueToRemind.length,
    };
  }
);
