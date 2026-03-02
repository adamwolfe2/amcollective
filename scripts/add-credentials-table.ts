/**
 * Migration: Create credentials table (encrypted vault)
 *
 * Usage:
 *   npx tsx scripts/add-credentials-table.ts
 */

import { config } from "dotenv";
config({ path: ".env.local" });

import { neon } from "@neondatabase/serverless";

async function main() {
  const sql = neon(process.env.DATABASE_URL!);

  console.log("Creating credentials table...\n");

  await sql`
    CREATE TABLE IF NOT EXISTS credentials (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      label VARCHAR(255) NOT NULL,
      service VARCHAR(100) NOT NULL,
      username TEXT,
      password_encrypted TEXT,
      url TEXT,
      notes TEXT,
      client_id UUID REFERENCES clients(id) ON DELETE SET NULL,
      project_id UUID REFERENCES portfolio_projects(id) ON DELETE SET NULL,
      created_by VARCHAR(255),
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMP NOT NULL DEFAULT NOW()
    )
  `;

  await sql`
    CREATE INDEX IF NOT EXISTS credentials_service_idx ON credentials (service)
  `;
  await sql`
    CREATE INDEX IF NOT EXISTS credentials_client_id_idx ON credentials (client_id)
  `;
  await sql`
    CREATE INDEX IF NOT EXISTS credentials_project_id_idx ON credentials (project_id)
  `;
  await sql`
    CREATE INDEX IF NOT EXISTS credentials_created_at_idx ON credentials (created_at)
  `;

  console.log("Done. credentials table created.");
  console.log(
    "\nReminder: set CREDENTIALS_SECRET in .env.local and Vercel env vars."
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
