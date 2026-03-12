/**
 * Inngest Job — Generate Recurring Invoices
 *
 * Runs daily at 1 PM UTC (5 AM PT).
 * Finds active recurring templates where nextBillingDate <= today,
 * clones them into new invoices, optionally auto-sends, and advances the schedule.
 */

import { inngest } from "../client";
import { captureError } from "@/lib/errors";
import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { eq, and, lte, or, isNull, gte, sql } from "drizzle-orm";
import { generateInvoiceNumber } from "@/lib/invoices/number";
import { createAuditLog } from "@/lib/db/repositories/audit";
import { notifySlack } from "@/lib/webhooks/slack";
import { notifyAdmins } from "@/lib/db/repositories/notifications";
import { sendInvoice } from "@/lib/db/repositories/invoices";

// ─── Helpers ────────────────────────────────────────────────────────────────

type BillingInterval = "weekly" | "biweekly" | "monthly" | "quarterly" | "annual";

/**
 * Advance a billing date by the given interval.
 * Returns an ISO date string (YYYY-MM-DD).
 */
function advanceBillingDate(current: string, interval: BillingInterval): string {
  const d = new Date(current + "T00:00:00Z");
  switch (interval) {
    case "weekly":
      d.setUTCDate(d.getUTCDate() + 7);
      break;
    case "biweekly":
      d.setUTCDate(d.getUTCDate() + 14);
      break;
    case "monthly":
      d.setUTCMonth(d.getUTCMonth() + 1);
      break;
    case "quarterly":
      d.setUTCMonth(d.getUTCMonth() + 3);
      break;
    case "annual":
      d.setUTCFullYear(d.getUTCFullYear() + 1);
      break;
  }
  return d.toISOString().split("T")[0];
}

/**
 * Calculate a due date from an issue date and payment terms string.
 */
function calculateDueDate(issueDate: string, paymentTerms: string): string {
  const match = paymentTerms.match(/Net\s*(\d+)/i);
  const days = match ? parseInt(match[1], 10) : 30;
  const d = new Date(issueDate + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().split("T")[0];
}

// ─── Job ────────────────────────────────────────────────────────────────────

export const generateRecurringInvoices = inngest.createFunction(
  {
    id: "generate-recurring-invoices",
    name: "Generate Recurring Invoices",
    retries: 2,
    onFailure: async ({ error }) => {
      captureError(error, {
        tags: { source: "inngest", job: "generate-recurring-invoices" },
        level: "error",
      });
    },
  },
  { cron: "0 13 * * *" }, // 1 PM UTC = 5 AM PT daily
  async ({ step }) => {
    const today = new Date().toISOString().split("T")[0];

    // Step 1: Find recurring templates due for generation
    const due = await step.run("find-due-templates", async () => {
      return db
        .select({
          template: schema.recurringInvoices,
          clientName: schema.clients.name,
          clientEmail: schema.clients.email,
        })
        .from(schema.recurringInvoices)
        .leftJoin(
          schema.clients,
          eq(schema.recurringInvoices.clientId, schema.clients.id)
        )
        .where(
          and(
            eq(schema.recurringInvoices.status, "active"),
            lte(schema.recurringInvoices.nextBillingDate, today),
            or(
              isNull(schema.recurringInvoices.endDate),
              gte(schema.recurringInvoices.endDate, today)
            )
          )
        );
    });

    if (due.length === 0) {
      return { generated: 0, errors: 0 };
    }

    let generated = 0;
    let errors = 0;

    // Step 2: Generate an invoice for each due template
    for (const row of due) {
      const { template, clientName } = row;

      await step.run(`generate-${template.id}`, async () => {
        try {
          // 1. Clone template into a new invoice
          const invoiceNumber = await generateInvoiceNumber();
          const issueDate = today;
          const dueDate = calculateDueDate(
            issueDate,
            template.paymentTerms ?? "Net 30"
          );

          const invoiceNotes = [
            template.notes,
            template.paymentTerms ? `Terms: ${template.paymentTerms}` : null,
          ]
            .filter(Boolean)
            .join("\n");

          // Atomic: create invoice + advance billing date in one transaction
          const nextDate = advanceBillingDate(
            template.nextBillingDate,
            template.interval as BillingInterval
          );

          const [invoice] = await db.transaction(async (tx) => {
            const [inv] = await tx
              .insert(schema.invoices)
              .values({
                clientId: template.clientId,
                number: invoiceNumber,
                status: "draft",
                amount: template.total,
                lineItems: template.lineItems,
                subtotal: template.subtotal ?? 0,
                taxRate: template.taxRate ?? 0,
                taxAmount: template.taxAmount ?? 0,
                dueDate: new Date(dueDate + "T00:00:00Z"),
                notes: invoiceNotes || null,
                recurringInvoiceId: template.id,
              })
              .returning();

            await tx
              .update(schema.recurringInvoices)
              .set({
                nextBillingDate: nextDate,
                invoicesGenerated: sql`${schema.recurringInvoices.invoicesGenerated} + 1`,
                lastGeneratedAt: new Date(),
              })
              .where(eq(schema.recurringInvoices.id, template.id));

            return [inv];
          });

          // Auto-send if enabled (outside transaction — ok to retry independently)
          if (template.autoSend) {
            await sendInvoice(invoice.id, "system");
          }

          // 4. Audit log
          await createAuditLog({
            actorId: "system",
            actorType: "system",
            action: "generate_recurring_invoice",
            entityType: "invoice",
            entityId: invoice.id,
            metadata: {
              invoiceNumber,
              templateId: template.id,
              amount: template.total,
              clientName,
            },
          });

          // 5. Notifications
          await notifySlack(
            `Recurring invoice ${invoiceNumber} ${template.autoSend ? "sent" : "generated"} for ${clientName ?? "Unknown"} — $${(template.total / 100).toFixed(0)}`
          );

          await notifyAdmins({
            type: "general",
            title: `Recurring invoice ${invoiceNumber} generated`,
            message: `${clientName ?? "Unknown"} — $${(template.total / 100).toFixed(2)}`,
            link: `/invoices`,
          });

          generated++;
        } catch (err) {
          errors++;
          captureError(err, {
            tags: { source: "inngest", job: "generate-recurring-invoices" },
            extra: { templateId: template.id },
          });
        }
      });
    }

    if (generated > 0) {
      await notifySlack(
        `Recurring billing: ${generated} invoice(s) generated, ${errors} error(s)`
      );
    }

    return { generated, errors, total: due.length };
  }
);
