/**
 * Sprint Task Architecture Migration — DDL Script
 *
 * Adds new columns and tables for the canonical task identity layer.
 * MUST be run before deploying any schema or code changes.
 *
 * Usage: npx tsx scripts/run-sprint-migration.ts
 *
 * IMPORTANT: ALTER TYPE must run standalone (not inside a transaction)
 * to avoid "unsafe use of new value of enum type" errors.
 */

import { config } from "dotenv";
config({ path: ".env.local" });

import { neon } from "@neondatabase/serverless";

async function main() {
  const sql = neon(process.env.DATABASE_URL!);

  console.log("Sprint Architecture Migration\n");

  // ─── Step 1: ALTER TYPE (must be standalone, no transaction) ──────────────
  console.log("Step 1: ALTER TYPE task_source ADD VALUE 'sprint' (standalone)...");
  await sql`ALTER TYPE task_source ADD VALUE IF NOT EXISTS 'sprint'`;
  console.log("  done.\n");

  // ─── Step 2: ALTER TABLE — add columns ────────────────────────────────────
  console.log("Step 2: Adding columns to existing tables...");

  await sql`
    ALTER TABLE tasks
    ADD COLUMN IF NOT EXISTS subtasks JSONB NOT NULL DEFAULT '[]'::jsonb
  `;
  console.log("  tasks.subtasks — ok");

  await sql`
    ALTER TABLE weekly_sprints
    ADD COLUMN IF NOT EXISTS closed_at TIMESTAMP
  `;
  console.log("  weekly_sprints.closed_at — ok");

  await sql`
    ALTER TABLE portfolio_projects
    ADD COLUMN IF NOT EXISTS open_task_count INTEGER NOT NULL DEFAULT 0
  `;
  await sql`
    ALTER TABLE portfolio_projects
    ADD COLUMN IF NOT EXISTS last_30d_completion_rate INTEGER NOT NULL DEFAULT 0
  `;
  await sql`
    ALTER TABLE portfolio_projects
    ADD COLUMN IF NOT EXISTS velocity_label VARCHAR(50)
  `;
  await sql`
    ALTER TABLE portfolio_projects
    ADD COLUMN IF NOT EXISTS metrics_last_updated_at TIMESTAMP
  `;
  console.log("  portfolio_projects.{open_task_count, last_30d_completion_rate, velocity_label, metrics_last_updated_at} — ok\n");

  // ─── Step 3: CREATE TABLE task_sprint_assignments ─────────────────────────
  console.log("Step 3: CREATE TABLE task_sprint_assignments...");
  await sql`
    CREATE TABLE IF NOT EXISTS task_sprint_assignments (
      task_id    UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
      sprint_id  UUID NOT NULL REFERENCES weekly_sprints(id) ON DELETE CASCADE,
      section_id UUID REFERENCES sprint_sections(id) ON DELETE SET NULL,
      added_at   TIMESTAMP NOT NULL DEFAULT NOW(),
      removed_at TIMESTAMP,
      sort_order INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (task_id, sprint_id)
    )
  `;
  await sql`
    CREATE INDEX IF NOT EXISTS tsa_sprint_id_idx ON task_sprint_assignments(sprint_id)
  `;
  await sql`
    CREATE INDEX IF NOT EXISTS tsa_task_id_idx ON task_sprint_assignments(task_id)
  `;
  await sql`
    CREATE INDEX IF NOT EXISTS tsa_section_id_idx ON task_sprint_assignments(section_id)
  `;
  console.log("  done.\n");

  // ─── Step 4: CREATE TABLE sprint_snapshots ────────────────────────────────
  console.log("Step 4: CREATE TABLE sprint_snapshots...");
  await sql`
    CREATE TABLE IF NOT EXISTS sprint_snapshots (
      id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      sprint_id        UUID NOT NULL REFERENCES weekly_sprints(id) ON DELETE CASCADE,
      project_id       UUID REFERENCES portfolio_projects(id) ON DELETE SET NULL,
      captured_at      TIMESTAMP NOT NULL DEFAULT NOW(),
      total_tasks      INTEGER NOT NULL DEFAULT 0,
      completed_tasks  INTEGER NOT NULL DEFAULT 0,
      completion_rate  INTEGER NOT NULL DEFAULT 0,
      open_tasks_json  JSONB NOT NULL DEFAULT '[]'::jsonb,
      velocity_label   VARCHAR(50),
      locked           BOOLEAN NOT NULL DEFAULT false,
      created_at       TIMESTAMP NOT NULL DEFAULT NOW()
    )
  `;
  await sql`
    CREATE INDEX IF NOT EXISTS ss_sprint_id_idx ON sprint_snapshots(sprint_id)
  `;
  await sql`
    CREATE INDEX IF NOT EXISTS ss_project_id_idx ON sprint_snapshots(project_id)
  `;
  console.log("  done.\n");

  console.log("Migration complete.");
}

main().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
