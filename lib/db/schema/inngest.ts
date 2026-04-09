/**
 * AM Collective — Inngest Run History Schema
 *
 * Tracks lifecycle of every Inngest function invocation.
 * Populated by lib/inngest/middleware.ts via the Inngest middleware API.
 *
 * Approach: Option B (local tracking layer) — Inngest's REST API requires
 * a paid-tier API key with dedicated read access. The middleware approach works
 * on all plans and gives us full control over retention and query patterns.
 */

import {
  pgTable,
  uuid,
  varchar,
  text,
  timestamp,
  integer,
  index,
} from "drizzle-orm/pg-core";
import { pgEnum } from "drizzle-orm/pg-core";

// ─── Enums ──────────────────────────────────────────────────────────────────

export const inngestRunStatusEnum = pgEnum("inngest_run_status", [
  "queued",
  "running",
  "completed",
  "failed",
]);

// ─── Tables ──────────────────────────────────────────────────────────────────

export const inngestRunHistory = pgTable(
  "inngest_run_history",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** Inngest function ID (e.g. "morning-briefing") */
    functionId: varchar("function_id", { length: 255 }).notNull(),
    /** Human-readable function name (e.g. "Morning Briefing") */
    functionName: varchar("function_name", { length: 255 }).notNull(),
    /** Inngest run ID — unique per invocation */
    runId: varchar("run_id", { length: 255 }).notNull().unique(),
    /** Current status of this run */
    status: inngestRunStatusEnum("status").notNull().default("queued"),
    /** Cron expression or event name that triggered this run */
    trigger: varchar("trigger", { length: 500 }),
    /** When the run started executing */
    startedAt: timestamp("started_at", { mode: "date" }).defaultNow().notNull(),
    /** When the run finished (success or failure) */
    completedAt: timestamp("completed_at", { mode: "date" }),
    /** Wall-clock duration in milliseconds */
    durationMs: integer("duration_ms"),
    /** Error message if status = 'failed' */
    error: text("error"),
    /** Number of attempts (1 = no retry) */
    attemptNumber: integer("attempt_number").notNull().default(1),
  },
  (table) => [
    index("inngest_run_history_function_id_idx").on(table.functionId),
    index("inngest_run_history_status_idx").on(table.status),
    index("inngest_run_history_started_at_idx").on(table.startedAt),
    index("inngest_run_history_run_id_idx").on(table.runId),
  ]
);

export type InngestRunHistory = typeof inngestRunHistory.$inferSelect;
export type NewInngestRunHistory = typeof inngestRunHistory.$inferInsert;
