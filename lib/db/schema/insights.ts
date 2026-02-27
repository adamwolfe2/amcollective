import {
  pgTable,
  uuid,
  varchar,
  text,
  timestamp,
  integer,
  index,
  jsonb,
} from "drizzle-orm/pg-core";
import { pgEnum } from "drizzle-orm/pg-core";

// ─── Enums ──────────────────────────────────────────────────────────────────

export const insightCategoryEnum = pgEnum("insight_category", [
  "revenue",
  "operations",
  "clients",
  "growth",
  "risk",
]);

// ─── Tables ─────────────────────────────────────────────────────────────────

/**
 * Weekly AI-generated business intelligence insights.
 * Each row = one insight from the weekly analysis run.
 */
export const weeklyInsights = pgTable(
  "weekly_insights",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    weekOf: varchar("week_of", { length: 10 }).notNull(), // YYYY-MM-DD (Monday of the week)
    category: insightCategoryEnum("category").notNull(),
    title: varchar("title", { length: 500 }).notNull(),
    summary: text("summary").notNull(),
    details: text("details"),
    priority: integer("priority").default(0).notNull(), // 0=info, 1=action, 2=urgent
    dataSnapshot: jsonb("data_snapshot"), // raw numbers that backed this insight
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
  },
  (table) => [
    index("weekly_insights_week_of_idx").on(table.weekOf),
    index("weekly_insights_category_idx").on(table.category),
    index("weekly_insights_created_at_idx").on(table.createdAt),
  ]
);

/**
 * Full weekly intelligence report — stores the complete analysis for each week.
 */
export const weeklyReports = pgTable(
  "weekly_intelligence_reports",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    weekOf: varchar("week_of", { length: 10 }).notNull().unique(), // YYYY-MM-DD
    executiveSummary: text("executive_summary").notNull(),
    fullReport: text("full_report").notNull(),
    dataSnapshot: jsonb("data_snapshot"), // all metrics used
    insightCount: integer("insight_count").default(0).notNull(),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
  },
  (table) => [
    index("weekly_reports_week_of_idx").on(table.weekOf),
  ]
);
