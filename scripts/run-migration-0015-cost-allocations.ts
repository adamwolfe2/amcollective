/**
 * Migration 0015: subscription_cost_allocations table.
 *
 * Lets a single subscription_cost (e.g. CheapInboxes, Beanstock consulting)
 * be split across multiple ventures. percent_bps = basis points (10000 = 100%).
 * The sum of allocations for a cost MUST equal 10000 (enforced in app layer).
 *
 * When a cost has zero allocation rows, the legacy single-tag column on
 * subscription_costs is used (current behavior). When ≥1 allocation row
 * exists, the column is ignored and the cost is fully split.
 *
 * Idempotent.
 *
 * Run: pnpm exec tsx --env-file=.env.local scripts/run-migration-0015-cost-allocations.ts
 */

import { config } from "dotenv";
config({ path: ".env.local" });

import postgres from "postgres";

const STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS subscription_cost_allocations (
     id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
     cost_id uuid NOT NULL REFERENCES subscription_costs(id) ON DELETE CASCADE,
     company_tag company_tag NOT NULL,
     percent_bps integer NOT NULL CHECK (percent_bps > 0 AND percent_bps <= 10000),
     notes text,
     created_at timestamp NOT NULL DEFAULT now(),
     updated_at timestamp NOT NULL DEFAULT now()
   )`,

  `CREATE INDEX IF NOT EXISTS sca_cost_id_idx ON subscription_cost_allocations (cost_id)`,
  `CREATE INDEX IF NOT EXISTS sca_company_tag_idx ON subscription_cost_allocations (company_tag)`,

  // Prevent the same tag appearing twice for the same cost.
  `CREATE UNIQUE INDEX IF NOT EXISTS sca_cost_tag_unique_idx
     ON subscription_cost_allocations (cost_id, company_tag)`,
];

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error("[migrate-0015] DATABASE_URL not set. Aborting.");
    process.exit(1);
  }

  console.log("[migrate-0015] Applying migration...");
  const client = postgres(databaseUrl, { max: 1 });

  try {
    for (const stmt of STATEMENTS) {
      console.log(`[migrate-0015] > ${stmt.replace(/\s+/g, " ").slice(0, 90)}...`);
      await client.unsafe(stmt);
    }
    console.log("[migrate-0015] Migration complete.");
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error("[migrate-0015] Migration failed:", err);
  process.exit(1);
});
