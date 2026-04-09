/**
 * Migration 0008: Add inngest_run_history table for job observability dashboard.
 *
 * Creates a table that the Inngest middleware populates on every function
 * invocation (start, success, failure). Powers the /admin/jobs dashboard.
 *
 * Run: npx tsx --env-file=.env.local scripts/run-migration-0008.ts
 *
 * DO NOT run in production without a maintenance window review. This is a
 * non-destructive addition (CREATE TABLE IF NOT EXISTS) so it is safe to run
 * on a live database, but review first.
 */

import { config } from "dotenv";
config({ path: ".env.local" });

import { neon } from "@neondatabase/serverless";

async function main() {
  const sql = neon(process.env.DATABASE_URL!);

  console.log("Applying migration 0008 — inngest_run_history...");

  // Create enum first (idempotent guard via DO block)
  await sql`
    DO $$
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'inngest_run_status') THEN
        CREATE TYPE inngest_run_status AS ENUM ('queued', 'running', 'completed', 'failed');
      END IF;
    END
    $$
  `;
  console.log("  + enum: inngest_run_status");

  await sql`
    CREATE TABLE IF NOT EXISTS inngest_run_history (
      id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      function_id VARCHAR(255) NOT NULL,
      function_name VARCHAR(255) NOT NULL,
      run_id      VARCHAR(255) NOT NULL UNIQUE,
      status      inngest_run_status NOT NULL DEFAULT 'queued',
      trigger     VARCHAR(500),
      started_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      completed_at TIMESTAMPTZ,
      duration_ms INTEGER,
      error       TEXT,
      attempt_number INTEGER NOT NULL DEFAULT 1
    )
  `;
  console.log("  + table: inngest_run_history");

  await sql`
    CREATE INDEX IF NOT EXISTS inngest_run_history_function_id_idx
      ON inngest_run_history (function_id)
  `;
  await sql`
    CREATE INDEX IF NOT EXISTS inngest_run_history_status_idx
      ON inngest_run_history (status)
  `;
  await sql`
    CREATE INDEX IF NOT EXISTS inngest_run_history_started_at_idx
      ON inngest_run_history (started_at DESC)
  `;
  await sql`
    CREATE INDEX IF NOT EXISTS inngest_run_history_run_id_idx
      ON inngest_run_history (run_id)
  `;
  console.log("  + indexes: function_id, status, started_at, run_id");

  console.log("Migration 0008 complete.");
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
