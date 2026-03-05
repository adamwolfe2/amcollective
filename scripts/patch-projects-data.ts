/**
 * Patch portfolio_projects: insert Cursive row + activate Hook
 * Run: npx tsx --env-file=.env.local scripts/patch-projects-data.ts
 */

import { config } from "dotenv";
config({ path: ".env.local" });

import { neon } from "@neondatabase/serverless";

async function main() {
  const sql = neon(process.env.DATABASE_URL!);

  // Insert Cursive if not present
  const existing = await sql`SELECT id FROM portfolio_projects WHERE slug = 'cursive'`;
  if (existing.length === 0) {
    await sql`
      INSERT INTO portfolio_projects (name, slug, status, description)
      VALUES ('Cursive', 'cursive', 'active', 'Multi-tenant SaaS lead marketplace platform')
    `;
    console.log("[OK] Inserted Cursive project");
  } else {
    console.log("[SKIP] Cursive already exists");
  }

  // Set Hook to active (currently paused)
  await sql`UPDATE portfolio_projects SET status = 'active' WHERE slug = 'hook'`;
  console.log("[OK] Hook status set to active");

  // Remove CampusGTM if it's not a real portfolio product
  // (leave it for now — it may be legitimate)
  console.log("[INFO] CampusGTM left as-is (review manually if needed)");

  process.exit(0);
}

main().catch((err) => { console.error(err); process.exit(1); });
