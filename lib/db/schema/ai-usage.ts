/**
 * AI Usage Tracking Schema
 *
 * Two tables:
 *   - aiUsage: raw per-request records (retained 90 days, then purged by rollup job)
 *   - aiUsageDaily: pre-aggregated daily rollups (retained indefinitely)
 *
 * Written to complement the existing ai.ts schema without modifying it.
 */

import {
  pgTable,
  uuid,
  varchar,
  text,
  boolean,
  timestamp,
  integer,
  date,
  index,
  uniqueIndex,
  jsonb,
  numeric,
} from "drizzle-orm/pg-core";

// ─── Raw Usage Table ──────────────────────────────────────────────────────────

export const aiUsage = pgTable(
  "ai_usage",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    timestamp: timestamp("timestamp", { withTimezone: true }).notNull().defaultNow(),

    // Agent and model context
    agentName: varchar("agent_name", { length: 100 }).notNull(),
    model: varchar("model", { length: 100 }).notNull(),

    // User context (nullable for system/cron jobs)
    userId: varchar("user_id", { length: 255 }),
    organizationId: varchar("organization_id", { length: 255 }),

    // Token counts from Anthropic response.usage
    inputTokens: integer("input_tokens").notNull().default(0),
    outputTokens: integer("output_tokens").notNull().default(0),
    cacheReadTokens: integer("cache_read_tokens").notNull().default(0),
    cacheCreationTokens: integer("cache_creation_tokens").notNull().default(0),

    // Computed cost in USD (6 decimal precision)
    totalCostUsd: numeric("total_cost_usd", { precision: 10, scale: 6 }).notNull(),

    // Performance and status
    latencyMs: integer("latency_ms"),
    success: boolean("success").notNull().default(true),
    errorCode: varchar("error_code", { length: 100 }),

    // Request correlation
    requestId: uuid("request_id").notNull(),
    parentRequestId: uuid("parent_request_id"), // no FK — just a correlation id

    // Tool use metrics
    toolCallsCount: integer("tool_calls_count").notNull().default(0),
    finishReason: varchar("finish_reason", { length: 50 }),

    // Optional payload previews (gated by AI_CAPTURE_PAYLOADS env var)
    promptPreview: text("prompt_preview"),   // first 500 chars
    responsePreview: text("response_preview"), // first 500 chars

    // Arbitrary metadata
    metadata: jsonb("metadata"),
  },
  (table) => [
    // Primary chronological query pattern
    index("ai_usage_timestamp_idx").on(table.timestamp),
    // Agent-level queries (most common dashboard filter)
    index("ai_usage_agent_timestamp_idx").on(table.agentName, table.timestamp),
    // Per-user spend tracking
    index("ai_usage_user_timestamp_idx").on(table.userId, table.timestamp),
    // Per-org spend tracking
    index("ai_usage_org_timestamp_idx").on(
      table.organizationId,
      table.timestamp
    ),
    // Model comparison queries
    index("ai_usage_model_timestamp_idx").on(table.model, table.timestamp),
    // Request chain lookups
    index("ai_usage_request_id_idx").on(table.requestId),
  ]
);

// ─── Daily Rollup Table ───────────────────────────────────────────────────────

export const aiUsageDaily = pgTable(
  "ai_usage_daily",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    date: date("date").notNull(),

    // Grouping dimensions
    agentName: varchar("agent_name", { length: 100 }).notNull(),
    model: varchar("model", { length: 100 }).notNull(),
    userId: varchar("user_id", { length: 255 }),

    // Aggregated metrics
    invocations: integer("invocations").notNull().default(0),
    totalInputTokens: integer("total_input_tokens").notNull().default(0),
    totalOutputTokens: integer("total_output_tokens").notNull().default(0),
    totalCacheReadTokens: integer("total_cache_read_tokens").notNull().default(0),
    totalCacheCreationTokens: integer("total_cache_creation_tokens")
      .notNull()
      .default(0),
    totalCostUsd: numeric("total_cost_usd", { precision: 12, scale: 6 })
      .notNull()
      .default("0"),
    errorCount: integer("error_count").notNull().default(0),
    avgLatencyMs: integer("avg_latency_ms"),
    updatedAt: timestamp("updated_at", { mode: "date" })
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    // Unique constraint: one row per date/agent/model/user combination
    uniqueIndex("ai_usage_daily_unique_idx").on(
      table.date,
      table.agentName,
      table.model,
      table.userId
    ),
  ]
);

// ─── Types ────────────────────────────────────────────────────────────────────

export type AiUsageRow = typeof aiUsage.$inferSelect;
export type AiUsageInsert = typeof aiUsage.$inferInsert;
export type AiUsageDailyRow = typeof aiUsageDaily.$inferSelect;
export type AiUsageDailyInsert = typeof aiUsageDaily.$inferInsert;
