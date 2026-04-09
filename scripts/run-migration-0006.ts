/**
 * Migration 0006:
 *   - Add index on sprint_sections.assignee_id (enables fast per-assignee sprint filtering)
 *   - Idempotent: also re-asserts sprint_sections_project_id_idx (added in 0005) for safety.
 *
 * Matches lib/db/schema/sprints.ts commit 14ac524.
 *
 * Run: npx tsx --env-file=.env.local scripts/run-migration-0006.ts
 */

import { config } from "dotenv";
config({ path: ".env.local" });

import { neon } from "@neondatabase/serverless";

async function main() {
  const sql = neon(process.env.DATABASE_URL!);

  console.log("Applying migration 0006...");

  await sql`
    CREATE INDEX IF NOT EXISTS sprint_sections_project_id_idx ON sprint_sections (project_id)
  `;
  console.log("  + index: sprint_sections_project_id_idx (idempotent)");

  await sql`
    CREATE INDEX IF NOT EXISTS sprint_sections_assignee_id_idx ON sprint_sections (assignee_id)
  `;
  console.log("  + index: sprint_sections_assignee_id_idx");

  console.log("Migration 0006 complete.");
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
