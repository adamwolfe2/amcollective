/**
 * Sync Schema — Tracks sync run history for all integrated services.
 *
 * Records when each service was synced, how long it took, and the result.
 */

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

export const syncStatusEnum = pgEnum("sync_status", [
  "running",
  "success",
  "error",
]);

// ─── Tables ─────────────────────────────────────────────────────────────────

export const syncRuns = pgTable(
  "sync_runs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    service: varchar("service", { length: 50 }).notNull(),
    status: syncStatusEnum("status").notNull().default("running"),
    triggeredBy: varchar("triggered_by", { length: 255 }).notNull(), // clerk user ID or "system"
    recordsProcessed: integer("records_processed"),
    errorMessage: text("error_message"),
    metadata: jsonb("metadata"),
    startedAt: timestamp("started_at", { mode: "date" }).defaultNow().notNull(),
    completedAt: timestamp("completed_at", { mode: "date" }),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
  },
  (table) => [
    index("sync_runs_service_idx").on(table.service),
    index("sync_runs_status_idx").on(table.status),
    index("sync_runs_started_at_idx").on(table.startedAt),
    index("sync_runs_service_started_idx").on(table.service, table.startedAt),
  ]
);
