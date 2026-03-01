/**
 * AM Collective — Project Metric Snapshots Schema
 *
 * Stores the latest synced metrics per portfolio project.
 * Updated every 15 minutes by the sync-portfolio Inngest job.
 * Dashboard reads from this table — never queries external DBs directly.
 */

import {
  pgTable,
  uuid,
  varchar,
  integer,
  jsonb,
  timestamp,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";

export const projectMetricSnapshots = pgTable(
  "project_metric_snapshots",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // Which project this snapshot is for (matches portfolioProjects.slug)
    projectSlug: varchar("project_slug", { length: 100 }).notNull(),
    // Revenue
    mrrCents: integer("mrr_cents").notNull().default(0),
    // Users / clients
    activeUsers: integer("active_users").notNull().default(0),
    newUsersWeek: integer("new_users_week").notNull().default(0),
    activeSubscriptions: integer("active_subscriptions").notNull().default(0),
    // Primary KPI (project-specific label + value)
    primaryMetricLabel: varchar("primary_metric_label", { length: 100 }),
    primaryMetricValue: integer("primary_metric_value").notNull().default(0),
    // Secondary KPI
    secondaryMetricLabel: varchar("secondary_metric_label", { length: 100 }),
    secondaryMetricValue: integer("secondary_metric_value").notNull().default(0),
    // Health
    healthScore: integer("health_score").default(100),       // 0–100
    syncStatus: varchar("sync_status", { length: 20 }).notNull().default("ok"), // ok | error
    errorMessage: varchar("error_message", { length: 500 }),
    // Full raw data blob for drill-down
    rawMetrics: jsonb("raw_metrics"),
    syncedAt: timestamp("synced_at", { mode: "date" }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("project_metric_snapshots_slug_unique").on(table.projectSlug),
    index("project_metric_snapshots_synced_at_idx").on(table.syncedAt),
  ]
);
