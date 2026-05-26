/**
 * Migration 0013: Engagement pay-date tracking.
 *
 * Adds:
 *   - payment_cadence enum (one_time | weekly | biweekly | monthly | quarterly | annual | custom)
 *   - engagements.payment_cadence column
 *   - engagements.next_pay_date date column
 *   - engagements.last_pay_date date column
 *   - Index on next_pay_date for the calendar/forecast forward scan
 *   - Index on payment_cadence
 *
 * Backs the /finance/calendar + /finance/ventures + /finance/engagements
 * pages so we can project income forward from non-recurring engagements.
 *
 * Idempotent: uses IF NOT EXISTS guards. Safe to re-run.
 *
 * NOTE: The SQL is inlined here (not loaded from drizzle/) because the
 * /drizzle directory is gitignored in this repo. Once Drizzle migration
 * tracking is set up (see CONTINUATION-PLAN.md Priority 2), this can move
 * back to a .sql file.
 *
 * Run: pnpm exec tsx --env-file=.env.local scripts/run-migration-0013-engagement-pay-dates.ts
 */

import { config } from "dotenv";
config({ path: ".env.local" });

import postgres from "postgres";

const STATEMENTS = [
  `DO $$ BEGIN
     CREATE TYPE payment_cadence AS ENUM ('one_time', 'weekly', 'biweekly', 'monthly', 'quarterly', 'annual', 'custom');
   EXCEPTION
     WHEN duplicate_object THEN null;
   END $$`,

  `ALTER TABLE engagements
     ADD COLUMN IF NOT EXISTS payment_cadence payment_cadence`,

  `ALTER TABLE engagements
     ADD COLUMN IF NOT EXISTS next_pay_date date`,

  `ALTER TABLE engagements
     ADD COLUMN IF NOT EXISTS last_pay_date date`,

  `CREATE INDEX IF NOT EXISTS engagements_next_pay_date_idx
     ON engagements (next_pay_date)
     WHERE next_pay_date IS NOT NULL`,

  `CREATE INDEX IF NOT EXISTS engagements_payment_cadence_idx
     ON engagements (payment_cadence)
     WHERE payment_cadence IS NOT NULL`,
];

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error("[migrate-0013] DATABASE_URL not set. Aborting.");
    process.exit(1);
  }

  console.log("[migrate-0013] Applying migration...");
  const client = postgres(databaseUrl, { max: 1 });

  try {
    for (const stmt of STATEMENTS) {
      const summary = stmt.replace(/\s+/g, " ").slice(0, 90);
      console.log(`[migrate-0013] > ${summary}...`);
      await client.unsafe(stmt);
    }
    console.log("[migrate-0013] Migration complete.");
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error("[migrate-0013] Migration failed:", err);
  process.exit(1);
});
