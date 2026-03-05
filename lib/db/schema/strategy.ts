import {
  pgTable,
  pgEnum,
  uuid,
  varchar,
  text,
  timestamp,
  integer,
  index,
  uniqueIndex,
  jsonb,
  numeric,
} from "drizzle-orm/pg-core";

// ─── Enums ───────────────────────────────────────────────────────────────────

export const recommendationTypeEnum = pgEnum("recommendation_type", [
  "revenue_opportunity",  // Ways to grow revenue
  "cost_reduction",       // Cut costs / improve margins
  "risk",                 // Something to address before it becomes a problem
  "growth",               // Acquisition, retention, expansion levers
  "operations",           // Efficiency, process, hiring
]);

export const recommendationStatusEnum = pgEnum("recommendation_status", [
  "active",     // Surfaced, not yet acted on
  "in_progress", // Being worked on
  "done",       // Completed
  "dismissed",  // Not relevant / won't do
]);

export const effortEnum = pgEnum("effort_level", ["low", "medium", "high"]);

// ─── Tables ──────────────────────────────────────────────────────────────────

/**
 * AI-generated strategic recommendations.
 * Each row = one actionable recommendation with context, suggested action, and impact estimate.
 *
 * Generated weekly by the strategy-analysis Inngest job.
 * On-demand via POST /api/strategy/run-analysis.
 */
export const strategyRecommendations = pgTable(
  "strategy_recommendations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    weekOf: varchar("week_of", { length: 10 }).notNull(), // YYYY-MM-DD (Monday of analysis week)

    // Classification
    type: recommendationTypeEnum("type").notNull(),
    product: varchar("product", { length: 50 }), // "trackr" | "wholesail" | ... | null (platform-wide)
    priority: integer("priority").notNull().default(0), // 0=info, 1=action, 2=urgent

    // Content
    title: varchar("title", { length: 500 }).notNull(),
    situation: text("situation").notNull(),       // "What is happening right now"
    recommendation: text("recommendation").notNull(), // "What you should do"
    expectedImpact: text("expected_impact"),      // "What it will achieve"

    // Impact quantification
    estimatedValueCents: integer("estimated_value_cents"), // Monthly $ impact (positive=gain, negative=cost)
    effort: effortEnum("effort"),                 // Implementation effort

    // Status tracking
    status: recommendationStatusEnum("status").notNull().default("active"),
    actedOnAt: timestamp("acted_on_at", { mode: "date" }),
    actedOnNote: text("acted_on_note"),

    // Supporting data
    dataSnapshot: jsonb("data_snapshot"), // Raw numbers that backed this recommendation

    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { mode: "date" })
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    index("strategy_recs_week_of_idx").on(table.weekOf),
    index("strategy_recs_status_idx").on(table.status),
    index("strategy_recs_priority_idx").on(table.priority),
    index("strategy_recs_product_idx").on(table.product),
    index("strategy_recs_created_at_idx").on(table.createdAt),
  ]
);

/**
 * Weekly computed strategy metrics snapshot.
 * One row per week — drives the executive strip, profitability matrix, and forecast.
 * Generated alongside recommendations by the weekly analysis job.
 */
export const strategyMetrics = pgTable(
  "strategy_metrics",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    weekOf: varchar("week_of", { length: 10 }).notNull(), // YYYY-MM-DD (Monday)

    // Platform-level financials
    totalMrrCents: integer("total_mrr_cents").notNull().default(0),
    mrrGrowthPct: numeric("mrr_growth_pct", { precision: 6, scale: 2 }), // vs 30d ago
    totalCashCents: integer("total_cash_cents").notNull().default(0),
    monthlyBurnCents: integer("monthly_burn_cents").notNull().default(0), // infra + SaaS costs
    runwayMonths: numeric("runway_months", { precision: 5, scale: 1 }),

    // Strategic health (composite 0-100 score)
    healthScore: integer("health_score"), // 0=critical, 100=excellent

    // Per-product margins — JSON map: { trackr: { mrrCents, costCents, marginPct }, ... }
    productMargins: jsonb("product_margins"),

    // Revenue concentration — % from highest single product
    concentrationPct: integer("concentration_pct"),

    // Risk level
    riskLevel: varchar("risk_level", { length: 20 }), // "low" | "medium" | "high" | "critical"

    // 3-month revenue forecast — [{ month, projectedMrrCents }]
    revenueForecast: jsonb("revenue_forecast"),

    // Executive summary (1-2 sentences)
    executiveSummary: text("executive_summary"),

    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("strategy_metrics_week_of_idx").on(table.weekOf),
  ]
);
