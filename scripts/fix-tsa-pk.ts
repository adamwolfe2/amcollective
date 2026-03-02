/**
 * task_sprint_assignments PK Migration
 *
 * Upgrades from composite PRIMARY KEY (task_id, sprint_id) to:
 *   - id UUID PK (supports re-add without losing history)
 *   - UNIQUE partial index on (task_id, sprint_id) WHERE removed_at IS NULL
 *     (still enforces no duplicate active assignments)
 *
 * Usage: npx tsx scripts/fix-tsa-pk.ts
 */

import { config } from "dotenv";
config({ path: ".env.local" });

import { neon } from "@neondatabase/serverless";

async function main() {
  const sql = neon(process.env.DATABASE_URL!);

  console.log("task_sprint_assignments PK Migration\n");

  // Check if id column already exists (idempotent guard)
  const [colCheck] = await sql`
    SELECT column_name
    FROM information_schema.columns
    WHERE table_name = 'task_sprint_assignments'
      AND column_name = 'id'
  `;
  if (colCheck) {
    console.log("id column already exists — skipping.");
    process.exit(0);
  }

  console.log("Step 1: Drop composite PK...");
  await sql`ALTER TABLE task_sprint_assignments DROP CONSTRAINT task_sprint_assignments_pkey`;
  console.log("  done.");

  console.log("Step 2: Add id UUID column with auto-generate for existing rows...");
  await sql`
    ALTER TABLE task_sprint_assignments
    ADD COLUMN id UUID NOT NULL DEFAULT gen_random_uuid()
  `;
  console.log("  done.");

  console.log("Step 3: Set id as new primary key...");
  await sql`ALTER TABLE task_sprint_assignments ADD PRIMARY KEY (id)`;
  console.log("  done.");

  console.log("Step 4: Create partial unique index (active assignments only)...");
  await sql`
    CREATE UNIQUE INDEX uniq_active_tsa
    ON task_sprint_assignments(task_id, sprint_id)
    WHERE removed_at IS NULL
  `;
  console.log("  done.\n");

  console.log("PK migration complete.");
  console.log("task_sprint_assignments now has uuid PK + partial unique constraint.");
}

main().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
