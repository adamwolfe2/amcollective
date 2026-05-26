/**
 * Migration 0014: Extend company_tag enum with myvsl + leasestack.
 *
 * The schema/costs.ts declares these values but they were never added to the
 * DB enum. Idempotent.
 *
 * Run: pnpm exec tsx --env-file=.env.local scripts/run-migration-0014-extend-company-tag.ts
 */

import { config } from "dotenv";
config({ path: ".env.local" });

import postgres from "postgres";

const STATEMENTS = [
  `ALTER TYPE company_tag ADD VALUE IF NOT EXISTS 'myvsl'`,
  `ALTER TYPE company_tag ADD VALUE IF NOT EXISTS 'leasestack'`,
];

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error("[migrate-0014] DATABASE_URL not set. Aborting.");
    process.exit(1);
  }

  console.log("[migrate-0014] Applying migration...");
  const client = postgres(databaseUrl, { max: 1 });

  try {
    for (const stmt of STATEMENTS) {
      console.log(`[migrate-0014] > ${stmt}`);
      await client.unsafe(stmt);
    }
    console.log("[migrate-0014] Migration complete.");
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error("[migrate-0014] Migration failed:", err);
  process.exit(1);
});
