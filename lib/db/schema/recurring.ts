/**
 * Recurring Invoices Schema — billing templates that auto-generate invoices.
 */

import {
  pgTable,
  pgEnum,
  uuid,
  text,
  integer,
  timestamp,
  date,
  jsonb,
  index,
  boolean,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { clients } from "./crm";
import { companyTagEnum } from "./costs";
import type { LineItem } from "@/lib/invoices/email";

// ─── Enums ──────────────────────────────────────────────────────────────────

export const billingIntervalEnum = pgEnum("billing_interval", [
  "weekly",
  "biweekly",
  "monthly",
  "quarterly",
  "annual",
]);

export const recurringBillingStatusEnum = pgEnum("recurring_billing_status", [
  "active",
  "paused",
  "cancelled",
]);

// ─── Tables ─────────────────────────────────────────────────────────────────

export const recurringInvoices = pgTable(
  "recurring_invoices",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    clientId: uuid("client_id")
      .notNull()
      .references(() => clients.id, { onDelete: "cascade" }),
    companyTag: companyTagEnum("company_tag").notNull().default("am_collective"),

    // Template data — cloned to each generated invoice
    lineItems: jsonb("line_items").notNull().$type<LineItem[]>(),
    subtotal: integer("subtotal").notNull(), // cents
    taxRate: integer("tax_rate").default(0), // basis points (1000 = 10%)
    taxAmount: integer("tax_amount").default(0), // cents
    total: integer("total").notNull(), // cents
    paymentTerms: text("payment_terms").default("Net 30"),
    notes: text("notes"),

    // Billing schedule
    interval: billingIntervalEnum("interval").notNull(),
    startDate: date("start_date").notNull(),
    endDate: date("end_date"), // null = indefinite
    nextBillingDate: date("next_billing_date").notNull(),

    status: recurringBillingStatusEnum("status").notNull().default("active"),

    // Stripe subscription link (if managed via Stripe billing)
    stripeSubscriptionId: text("stripe_subscription_id"),

    // Tracking
    invoicesGenerated: integer("invoices_generated").default(0),
    lastGeneratedAt: timestamp("last_generated_at", { mode: "date" }),

    // Auto-send: if true, generated invoices are sent immediately
    autoSend: boolean("auto_send").default(true).notNull(),

    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { mode: "date" })
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    index("recurring_invoices_client_id_idx").on(table.clientId),
    index("recurring_invoices_status_idx").on(table.status),
    index("recurring_invoices_next_billing_date_idx").on(
      table.nextBillingDate
    ),
    index("recurring_invoices_company_tag_idx").on(table.companyTag),
  ]
);

// ─── Relations ──────────────────────────────────────────────────────────────

export const recurringInvoicesRelations = relations(
  recurringInvoices,
  ({ one }) => ({
    client: one(clients, {
      fields: [recurringInvoices.clientId],
      references: [clients.id],
    }),
  })
);
