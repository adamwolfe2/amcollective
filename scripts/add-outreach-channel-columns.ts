/**
 * Idempotent column add for multi-channel outreach ingest.
 *
 * Adds channel / lead_identifier / lead_profile_url to outreach_events plus a
 * channel index. Applied directly (not via the bundled drizzle migration) to
 * avoid touching unrelated schema drift. Safe to run multiple times.
 *
 *   npx tsx --env-file=.env.local scripts/add-outreach-channel-columns.ts
 */

import "dotenv/config";
import postgres from "postgres";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error("[add-columns] DATABASE_URL not set. Aborting.");
  process.exit(1);
}

const sql = postgres(databaseUrl, { max: 1 });

const statements = [
  `ALTER TABLE "outreach_events" ADD COLUMN IF NOT EXISTS "channel" varchar(20) DEFAULT 'email' NOT NULL`,
  `ALTER TABLE "outreach_events" ADD COLUMN IF NOT EXISTS "lead_identifier" varchar(500)`,
  `ALTER TABLE "outreach_events" ADD COLUMN IF NOT EXISTS "lead_profile_url" varchar(1000)`,
  `CREATE INDEX IF NOT EXISTS "outreach_events_channel_idx" ON "outreach_events" ("channel")`,
];

async function run() {
  for (const stmt of statements) {
    await sql.unsafe(stmt);
    console.log("[add-columns] ok:", stmt.slice(0, 70));
  }
  await sql.end();
  console.log("[add-columns] done.");
}

run().catch(async (err) => {
  console.error("[add-columns] failed:", err);
  await sql.end();
  process.exit(1);
});
