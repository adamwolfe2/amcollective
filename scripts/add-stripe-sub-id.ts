/**
 * Migration: Add stripe_subscription_id to subscription_costs
 *
 * Usage:
 *   npx tsx scripts/add-stripe-sub-id.ts
 */

import { config } from "dotenv";
config({ path: ".env.local" });

import { neon } from "@neondatabase/serverless";

async function main() {
  const sql = neon(process.env.DATABASE_URL!);

  console.log("Adding stripe_subscription_id to subscription_costs...\n");

  await sql`
    ALTER TABLE subscription_costs
    ADD COLUMN IF NOT EXISTS stripe_subscription_id VARCHAR(255)
  `;

  await sql`
    CREATE UNIQUE INDEX IF NOT EXISTS subscription_costs_stripe_sub_id_idx
    ON subscription_costs (stripe_subscription_id)
    WHERE stripe_subscription_id IS NOT NULL
  `;

  console.log("Done.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
