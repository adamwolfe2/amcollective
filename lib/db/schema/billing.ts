import {
  pgTable,
  uuid,
  varchar,
  text,
  boolean,
  timestamp,
  integer,
  index,
  jsonb,
  date,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { pgEnum } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { engagements, clients } from "./crm";

// ─── Enums ──────────────────────────────────────────────────────────────────

export const invoiceStatusEnum = pgEnum("invoice_status", [
  "draft",
  "sent",
  "open",
  "paid",
  "overdue",
  "void",
  "uncollectible",
  "cancelled",
]);

export const subscriptionStatusEnum = pgEnum("subscription_status", [
  "active",
  "past_due",
  "cancelled",
  "trialing",
  "paused",
  "incomplete",
  "unpaid",
]);

export const paymentStatusEnum = pgEnum("payment_status", [
  "succeeded",
  "failed",
  "refunded",
  "pending",
  "partially_refunded",
]);

// ─── Tables ─────────────────────────────────────────────────────────────────

export const invoices = pgTable(
  "invoices",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    engagementId: uuid("engagement_id").references(() => engagements.id, {
      onDelete: "set null",
    }),
    clientId: uuid("client_id")
      .notNull()
      .references(() => clients.id, { onDelete: "cascade" }),
    stripeInvoiceId: varchar("stripe_invoice_id", { length: 255 }),
    stripeHostedUrl: varchar("stripe_hosted_url", { length: 1000 }),
    stripePaymentLinkUrl: varchar("stripe_payment_link_url", { length: 1000 }),
    number: varchar("number", { length: 100 }),
    status: invoiceStatusEnum("status").default("draft").notNull(),
    amount: integer("amount").notNull(), // cents
    currency: varchar("currency", { length: 10 }).default("usd").notNull(),
    dueDate: date("due_date", { mode: "date" }),
    subtotal: integer("subtotal").default(0), // cents
    taxRate: integer("tax_rate").default(0), // basis points (1000 = 10%)
    taxAmount: integer("tax_amount").default(0), // cents
    sentAt: timestamp("sent_at", { mode: "date" }),
    paidAt: timestamp("paid_at", { mode: "date" }),
    pdfUrl: varchar("pdf_url", { length: 500 }),
    lineItems: jsonb("line_items"), // [{description, quantity, unitPrice}]
    reminderCount: integer("reminder_count").default(0).notNull(),
    lastReminderAt: timestamp("last_reminder_at", { mode: "date" }),
    notes: text("notes"),
    recurringInvoiceId: uuid("recurring_invoice_id"), // links back to recurring template
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { mode: "date" })
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    index("invoices_engagement_id_idx").on(table.engagementId),
    index("invoices_client_id_idx").on(table.clientId),
    index("invoices_status_idx").on(table.status),
    index("invoices_created_at_idx").on(table.createdAt),
    index("invoices_due_date_idx").on(table.dueDate),
    index("invoices_paid_at_idx").on(table.paidAt),
    uniqueIndex("invoices_stripe_invoice_id_idx").on(table.stripeInvoiceId),
  ]
);

export const subscriptions = pgTable(
  "subscriptions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    clientId: uuid("client_id")
      .notNull()
      .references(() => clients.id, { onDelete: "cascade" }),
    stripeSubscriptionId: varchar("stripe_subscription_id", {
      length: 255,
    }).notNull(),
    planName: varchar("plan_name", { length: 255 }),
    amount: integer("amount").notNull(), // monthly amount in cents
    interval: varchar("interval", { length: 20 }).default("month").notNull(), // "month" | "year"
    status: subscriptionStatusEnum("status").default("active").notNull(),
    currentPeriodStart: timestamp("current_period_start", { mode: "date" }),
    currentPeriodEnd: timestamp("current_period_end", { mode: "date" }),
    cancelledAt: timestamp("cancelled_at", { mode: "date" }),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { mode: "date" })
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    index("subscriptions_client_id_idx").on(table.clientId),
    uniqueIndex("subscriptions_stripe_sub_id_idx").on(
      table.stripeSubscriptionId
    ),
    index("subscriptions_status_idx").on(table.status),
    index("subscriptions_cancelled_at_idx").on(table.cancelledAt),
    index("subscriptions_current_period_end_idx").on(table.currentPeriodEnd),
  ]
);

export const payments = pgTable(
  "payments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    clientId: uuid("client_id").references(() => clients.id, {
      onDelete: "set null",
    }),
    invoiceId: uuid("invoice_id").references(() => invoices.id, {
      onDelete: "set null",
    }),
    stripeChargeId: varchar("stripe_charge_id", { length: 255 }),
    stripePaymentIntentId: varchar("stripe_payment_intent_id", {
      length: 255,
    }),
    amount: integer("amount").notNull(), // cents
    currency: varchar("currency", { length: 10 }).default("usd").notNull(),
    status: paymentStatusEnum("status").default("pending").notNull(),
    paymentDate: timestamp("payment_date", { mode: "date" })
      .defaultNow()
      .notNull(),
    refundAmount: integer("refund_amount"),
    failureReason: text("failure_reason"),
    receiptUrl: varchar("receipt_url", { length: 1000 }),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
  },
  (table) => [
    index("payments_client_id_idx").on(table.clientId),
    index("payments_invoice_id_idx").on(table.invoiceId),
    uniqueIndex("payments_stripe_charge_id_idx").on(table.stripeChargeId),
    index("payments_status_idx").on(table.status),
    index("payments_payment_date_idx").on(table.paymentDate),
  ]
);

export const services = pgTable(
  "services",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: varchar("name", { length: 255 }).notNull(),
    description: text("description"),
    category: varchar("category", { length: 100 }),
    basePrice: integer("base_price"),
    pricePeriod: varchar("price_period", { length: 50 }),
    isActive: boolean("is_active").default(true).notNull(),
    sortOrder: integer("sort_order").default(0).notNull(),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { mode: "date" })
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
  },
  (table) => [index("services_created_at_idx").on(table.createdAt)]
);

// ─── Relations ──────────────────────────────────────────────────────────────

export const invoicesRelations = relations(invoices, ({ one, many }) => ({
  engagement: one(engagements, {
    fields: [invoices.engagementId],
    references: [engagements.id],
  }),
  client: one(clients, {
    fields: [invoices.clientId],
    references: [clients.id],
  }),
  payments: many(payments),
}));

export const subscriptionsRelations = relations(subscriptions, ({ one }) => ({
  client: one(clients, {
    fields: [subscriptions.clientId],
    references: [clients.id],
  }),
}));

export const paymentsRelations = relations(payments, ({ one }) => ({
  client: one(clients, {
    fields: [payments.clientId],
    references: [clients.id],
  }),
  invoice: one(invoices, {
    fields: [payments.invoiceId],
    references: [invoices.id],
  }),
}));
