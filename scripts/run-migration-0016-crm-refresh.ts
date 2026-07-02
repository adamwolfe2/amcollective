/**
 * Migration 0016: CRM refresh — tracker-grid columns on leads + new buckets.
 *
 * Spec: .claude/specs/2026-07-02-crm-refresh.md (Littlebird PRD 2026-07-02).
 * - company_tag: add campusgtm + reseller
 * - lead_stage: add prospect / active / proposal (tracker stages)
 * - new enum data_confidence (verified/provisional/stale)
 * - leads: priority, next_step, last_step_date, owner_secondary, correct_email,
 *   pay_status, total_value, mrr, collected, ip_or_legal_flag, data_confidence
 *
 * Idempotent. Run:
 *   pnpm exec tsx --env-file=.env.local scripts/run-migration-0016-crm-refresh.ts
 */

import { config } from "dotenv";
config({ path: ".env.local" });

import postgres from "postgres";

const STATEMENTS = [
  `ALTER TYPE company_tag ADD VALUE IF NOT EXISTS 'campusgtm'`,
  `ALTER TYPE company_tag ADD VALUE IF NOT EXISTS 'reseller'`,
  `ALTER TYPE lead_stage ADD VALUE IF NOT EXISTS 'prospect'`,
  `ALTER TYPE lead_stage ADD VALUE IF NOT EXISTS 'active'`,
  `ALTER TYPE lead_stage ADD VALUE IF NOT EXISTS 'proposal'`,
  `DO $$ BEGIN
     CREATE TYPE data_confidence AS ENUM ('verified', 'provisional', 'stale');
   EXCEPTION WHEN duplicate_object THEN NULL;
   END $$`,
  `ALTER TABLE leads ADD COLUMN IF NOT EXISTS priority text`,
  `ALTER TABLE leads ADD COLUMN IF NOT EXISTS next_step text`,
  `ALTER TABLE leads ADD COLUMN IF NOT EXISTS last_step_date date`,
  `ALTER TABLE leads ADD COLUMN IF NOT EXISTS owner_secondary text`,
  `ALTER TABLE leads ADD COLUMN IF NOT EXISTS correct_email text`,
  `ALTER TABLE leads ADD COLUMN IF NOT EXISTS pay_status text`,
  `ALTER TABLE leads ADD COLUMN IF NOT EXISTS total_value integer`,
  `ALTER TABLE leads ADD COLUMN IF NOT EXISTS mrr integer`,
  `ALTER TABLE leads ADD COLUMN IF NOT EXISTS collected integer`,
  `ALTER TABLE leads ADD COLUMN IF NOT EXISTS ip_or_legal_flag boolean NOT NULL DEFAULT false`,
  `ALTER TABLE leads ADD COLUMN IF NOT EXISTS data_confidence data_confidence NOT NULL DEFAULT 'provisional'`,
  `CREATE INDEX IF NOT EXISTS leads_priority_idx ON leads (priority)`,
  `CREATE INDEX IF NOT EXISTS leads_last_step_date_idx ON leads (last_step_date)`,
  `CREATE INDEX IF NOT EXISTS leads_pay_status_idx ON leads (pay_status)`,
];

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error("[migrate-0016] DATABASE_URL not set. Aborting.");
    process.exit(1);
  }

  console.log("[migrate-0016] Applying migration...");
  const client = postgres(databaseUrl, { max: 1 });

  try {
    for (const stmt of STATEMENTS) {
      console.log(`[migrate-0016] > ${stmt.split("\n")[0]}`);
      await client.unsafe(stmt);
    }
    console.log("[migrate-0016] Migration complete.");
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error("[migrate-0016] Migration failed:", err);
  process.exit(1);
});
