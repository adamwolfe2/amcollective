/**
 * Migration 0005:
 *   - Archive CampusGTM (GTM channel, not a portfolio product)
 *   - Add missing index on sprint_sections.project_id (enables fast per-product velocity lookups)
 *
 * Run: npx tsx --env-file=.env.local scripts/run-migration-0005.ts
 */

import { config } from "dotenv";
config({ path: ".env.local" });

import { neon } from "@neondatabase/serverless";

async function main() {
  const sql = neon(process.env.DATABASE_URL!);

  console.log("Applying migration 0005...");

  // Archive CampusGTM — it's a go-to-market channel strategy, not a portfolio product.
  // Archiving removes it from /products page and strategy engine product list.
  await sql`
    UPDATE portfolio_projects SET status = 'archived' WHERE slug = 'campusgtm'
  `;
  console.log("  + archived campusgtm (status → archived)");

  // Add index on sprint_sections.project_id so per-product velocity queries are fast
  await sql`
    CREATE INDEX IF NOT EXISTS sprint_sections_project_id_idx ON sprint_sections (project_id)
  `;
  console.log("  + index: sprint_sections_project_id_idx");

  console.log("Migration 0005 complete.");
  process.exit(0);
}

main().catch((err) => { console.error(err); process.exit(1); });
