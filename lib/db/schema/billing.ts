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
} from "drizzle-orm/pg-core";
import { pgEnum } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { engagements, clients } from "./crm";

// ─── Enums ──────────────────────────────────────────────────────────────────

export const invoiceStatusEnum = pgEnum("invoice_status", [
  "draft",
  "sent",
  "paid",
  "overdue",
  "cancelled",
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
    number: varchar("number", { length: 100 }),
    status: invoiceStatusEnum("status").default("draft").notNull(),
    amount: integer("amount").notNull(),
    currency: varchar("currency", { length: 10 }).default("usd").notNull(),
    dueDate: date("due_date", { mode: "date" }),
    paidAt: timestamp("paid_at", { mode: "date" }),
    pdfUrl: varchar("pdf_url", { length: 500 }),
    lineItems: jsonb("line_items"),
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

export const invoicesRelations = relations(invoices, ({ one }) => ({
  engagement: one(engagements, {
    fields: [invoices.engagementId],
    references: [engagements.id],
  }),
  client: one(clients, {
    fields: [invoices.clientId],
    references: [clients.id],
  }),
}));
