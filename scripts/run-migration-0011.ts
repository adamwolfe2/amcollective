/**
 * Migration 0011: Add LeaseStack as a portfolio product.
 *
 * Adds:
 *  - "leasestack" to the company_tag postgres enum
 *  - portfolio_projects row for LeaseStack
 *
 * Run: npx tsx --env-file=.env.local scripts/run-migration-0011.ts
 *
 * Non-destructive — safe to run on a live database.
 */

import { config } from "dotenv";
config({ path: ".env.local" });

import { neon } from "@neondatabase/serverless";

async function main() {
  const sql = neon(process.env.DATABASE_URL!);

  console.log("Applying migration 0011 — LeaseStack portfolio product...");

  // ── 1. Extend the company_tag enum ────────────────────────────────────────
  // PostgreSQL requires ALTER TYPE ... ADD VALUE for enum extension.
  // IF NOT EXISTS guard prevents failure on re-run.
  await sql`
    ALTER TYPE company_tag ADD VALUE IF NOT EXISTS 'leasestack'
  `;
  console.log("  + enum value: company_tag.leasestack");

  // ── 2. Insert portfolio_projects row ─────────────────────────────────────
  await sql`
    INSERT INTO portfolio_projects (
      id,
      name,
      slug,
      status,
      product_stage,
      description,
      target_market,
      monthly_goal_cents,
      launch_date,
      velocity_label,
      created_at,
      updated_at
    )
    VALUES (
      gen_random_uuid(),
      'LeaseStack',
      'leasestack',
      'active',
      'building',
      'Full-stack managed marketing platform for real estate operators — custom website, AI chatbot, visitor ID pixel, and managed Meta/Google/TikTok ads with lease-level attribution',
      'Real estate operators and property management companies',
      1000000,
      NULL,
      NULL,
      NOW(),
      NOW()
    )
    ON CONFLICT (slug) DO NOTHING
  `;
  console.log("  + row: portfolio_projects.leasestack");

  console.log("Migration 0011 complete.");
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
