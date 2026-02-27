/**
 * AM Collective — Daily Metrics Snapshots Schema
 *
 * Stores daily snapshots of key business metrics for historical trend analysis
 * and delta calculations on the dashboard.
 */

import {
  pgTable,
  uuid,
  date,
  integer,
  jsonb,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

export const dailyMetricsSnapshots = pgTable(
  "daily_metrics_snapshots",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    date: date("date", { mode: "date" }).notNull(),
    mrr: integer("mrr").notNull().default(0), // cents
    arr: integer("arr").notNull().default(0), // cents
    totalCash: integer("total_cash").notNull().default(0), // cents
    activeClients: integer("active_clients").notNull().default(0),
    activeProjects: integer("active_projects").notNull().default(0),
    activeSubscriptions: integer("active_subscriptions").notNull().default(0),
    overdueInvoices: integer("overdue_invoices").notNull().default(0),
    overdueAmount: integer("overdue_amount").notNull().default(0), // cents
    metadata: jsonb("metadata"),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("daily_metrics_date_idx").on(table.date),
  ]
);
