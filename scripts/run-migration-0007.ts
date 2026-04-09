/**
 * Migration 0007: AI Usage Observability Tables
 *
 * Creates:
 *   - ai_usage: raw per-request records (retained 90 days)
 *   - ai_usage_daily: pre-aggregated daily rollup (retained indefinitely)
 *
 * All statements use IF NOT EXISTS — safe to run multiple times.
 *
 * Run: npx tsx --env-file=.env.local scripts/run-migration-0007.ts
 */

import { config } from "dotenv";
config({ path: ".env.local" });

import { neon } from "@neondatabase/serverless";

async function main() {
  const sql = neon(process.env.DATABASE_URL!);

  console.log("Applying migration 0007 — AI usage observability...");

  // ── ai_usage table ──────────────────────────────────────────────────────────
  await sql`
    CREATE TABLE IF NOT EXISTS ai_usage (
      id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      timestamp       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      agent_name      VARCHAR(100) NOT NULL,
      model           VARCHAR(100) NOT NULL,
      user_id         VARCHAR(255),
      organization_id VARCHAR(255),
      input_tokens    INTEGER NOT NULL DEFAULT 0,
      output_tokens   INTEGER NOT NULL DEFAULT 0,
      cache_read_tokens      INTEGER NOT NULL DEFAULT 0,
      cache_creation_tokens  INTEGER NOT NULL DEFAULT 0,
      total_cost_usd  NUMERIC(10, 6) NOT NULL,
      latency_ms      INTEGER,
      success         BOOLEAN NOT NULL DEFAULT TRUE,
      error_code      VARCHAR(100),
      request_id      UUID NOT NULL,
      parent_request_id UUID,
      tool_calls_count INTEGER NOT NULL DEFAULT 0,
      finish_reason   VARCHAR(50),
      prompt_preview  TEXT,
      response_preview TEXT,
      metadata        JSONB
    )
  `;
  console.log("  + table: ai_usage");

  // ── ai_usage indexes ────────────────────────────────────────────────────────
  await sql`
    CREATE INDEX IF NOT EXISTS ai_usage_timestamp_idx
      ON ai_usage (timestamp DESC)
  `;
  console.log("  + index: ai_usage_timestamp_idx");

  await sql`
    CREATE INDEX IF NOT EXISTS ai_usage_agent_timestamp_idx
      ON ai_usage (agent_name, timestamp DESC)
  `;
  console.log("  + index: ai_usage_agent_timestamp_idx");

  await sql`
    CREATE INDEX IF NOT EXISTS ai_usage_user_timestamp_idx
      ON ai_usage (user_id, timestamp DESC)
  `;
  console.log("  + index: ai_usage_user_timestamp_idx");

  await sql`
    CREATE INDEX IF NOT EXISTS ai_usage_org_timestamp_idx
      ON ai_usage (organization_id, timestamp DESC)
  `;
  console.log("  + index: ai_usage_org_timestamp_idx");

  await sql`
    CREATE INDEX IF NOT EXISTS ai_usage_model_timestamp_idx
      ON ai_usage (model, timestamp DESC)
  `;
  console.log("  + index: ai_usage_model_timestamp_idx");

  await sql`
    CREATE INDEX IF NOT EXISTS ai_usage_request_id_idx
      ON ai_usage (request_id)
  `;
  console.log("  + index: ai_usage_request_id_idx");

  // ── ai_usage_daily table ────────────────────────────────────────────────────
  await sql`
    CREATE TABLE IF NOT EXISTS ai_usage_daily (
      id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      date                    DATE NOT NULL,
      agent_name              VARCHAR(100) NOT NULL,
      model                   VARCHAR(100) NOT NULL,
      user_id                 VARCHAR(255),
      invocations             INTEGER NOT NULL DEFAULT 0,
      total_input_tokens      INTEGER NOT NULL DEFAULT 0,
      total_output_tokens     INTEGER NOT NULL DEFAULT 0,
      total_cache_read_tokens INTEGER NOT NULL DEFAULT 0,
      total_cache_creation_tokens INTEGER NOT NULL DEFAULT 0,
      total_cost_usd          NUMERIC(12, 6) NOT NULL DEFAULT 0,
      error_count             INTEGER NOT NULL DEFAULT 0,
      avg_latency_ms          INTEGER,
      updated_at              TIMESTAMP NOT NULL DEFAULT NOW()
    )
  `;
  console.log("  + table: ai_usage_daily");

  // ── ai_usage_daily unique index ─────────────────────────────────────────────
  // NULL user_id needs special handling — Postgres UNIQUE treats two NULLs as
  // non-equal, so we use a partial index approach:
  // One unique constraint handles rows where user_id IS NOT NULL,
  // and the rollup job uses gen_random_uuid() for new inserts which avoids
  // duplicates through the ON CONFLICT clause targeting the expression index.
  await sql`
    CREATE UNIQUE INDEX IF NOT EXISTS ai_usage_daily_unique_idx
      ON ai_usage_daily (date, agent_name, model, COALESCE(user_id, ''))
  `;
  console.log("  + unique index: ai_usage_daily_unique_idx");

  console.log("\nMigration 0007 complete.");
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
