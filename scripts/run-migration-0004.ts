/**
 * Apply product metadata migration to Neon DB
 * Run: npx tsx --env-file=.env.local scripts/run-migration-0004.ts
 */

import { config } from "dotenv";
config({ path: ".env.local" });

import { neon } from "@neondatabase/serverless";

async function main() {
  const sql = neon(process.env.DATABASE_URL!);
  console.log("Applying product metadata migration...");
  await sql`ALTER TABLE portfolio_projects ADD COLUMN IF NOT EXISTS launch_date timestamp`;
  console.log("  + launch_date");
  await sql`ALTER TABLE portfolio_projects ADD COLUMN IF NOT EXISTS product_stage varchar(30)`;
  console.log("  + product_stage");
  await sql`ALTER TABLE portfolio_projects ADD COLUMN IF NOT EXISTS description text`;
  console.log("  + description");
  await sql`ALTER TABLE portfolio_projects ADD COLUMN IF NOT EXISTS target_market varchar(200)`;
  console.log("  + target_market");
  await sql`ALTER TABLE portfolio_projects ADD COLUMN IF NOT EXISTS monthly_goal_cents integer`;
  console.log("  + monthly_goal_cents");
  console.log("Migration complete.");
  process.exit(0);
}

main().catch((err) => { console.error(err); process.exit(1); });
