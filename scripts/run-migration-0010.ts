/**
 * Migration 0010: Full-text search vectors + recent searches table.
 *
 * Adds:
 *  - search_vector tsvector column to: leads, contracts, tasks, documents, companies
 *  - GIN index on each search_vector column
 *  - Trigger functions that auto-update tsvector on INSERT/UPDATE
 *  - recent_searches table for per-user search history
 *  - Backfills existing rows
 *
 * Weights: name/title = 'A', description/content = 'B', other fields = 'C'
 *
 * Run: npx tsx --env-file=.env.local scripts/run-migration-0010.ts
 *
 * This is non-destructive (IF NOT EXISTS guards everywhere). Safe to run on a
 * live database — no locks held beyond individual statement scope.
 */

import { config } from "dotenv";
config({ path: ".env.local" });

import { neon } from "@neondatabase/serverless";

async function main() {
  const sql = neon(process.env.DATABASE_URL!);

  console.log("Applying migration 0010 — full-text search vectors + recent searches...");

  // ── 1. leads ─────────────────────────────────────────────────────────────

  await sql`
    ALTER TABLE leads
      ADD COLUMN IF NOT EXISTS search_vector tsvector
  `;
  console.log("  + column: leads.search_vector");

  await sql`
    CREATE INDEX IF NOT EXISTS leads_search_vector_idx
      ON leads USING GIN (search_vector)
  `;
  console.log("  + index: leads_search_vector_idx");

  await sql`
    CREATE OR REPLACE FUNCTION leads_search_vector_update() RETURNS trigger AS $$
    BEGIN
      NEW.search_vector :=
        setweight(to_tsvector('english', COALESCE(NEW.contact_name, '')), 'A') ||
        setweight(to_tsvector('english', COALESCE(NEW.company_name, '')), 'A') ||
        setweight(to_tsvector('english', COALESCE(NEW.notes, '')), 'B') ||
        setweight(to_tsvector('english', COALESCE(NEW.email, '')), 'C') ||
        setweight(to_tsvector('english', COALESCE(NEW.industry, '')), 'C') ||
        setweight(to_tsvector('english', COALESCE(NEW.stage::text, '')), 'C');
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql
  `;

  await sql`
    DROP TRIGGER IF EXISTS leads_search_vector_trigger ON leads
  `;
  await sql`
    CREATE TRIGGER leads_search_vector_trigger
      BEFORE INSERT OR UPDATE ON leads
      FOR EACH ROW EXECUTE FUNCTION leads_search_vector_update()
  `;
  console.log("  + trigger: leads_search_vector_trigger");

  // Backfill
  await sql`
    UPDATE leads SET search_vector =
      setweight(to_tsvector('english', COALESCE(contact_name, '')), 'A') ||
      setweight(to_tsvector('english', COALESCE(company_name, '')), 'A') ||
      setweight(to_tsvector('english', COALESCE(notes, '')), 'B') ||
      setweight(to_tsvector('english', COALESCE(email, '')), 'C') ||
      setweight(to_tsvector('english', COALESCE(industry, '')), 'C') ||
      setweight(to_tsvector('english', COALESCE(stage::text, '')), 'C')
    WHERE search_vector IS NULL
  `;
  console.log("  + backfill: leads");

  // ── 2. contracts ──────────────────────────────────────────────────────────

  await sql`
    ALTER TABLE contracts
      ADD COLUMN IF NOT EXISTS search_vector tsvector
  `;
  console.log("  + column: contracts.search_vector");

  await sql`
    CREATE INDEX IF NOT EXISTS contracts_search_vector_idx
      ON contracts USING GIN (search_vector)
  `;
  console.log("  + index: contracts_search_vector_idx");

  await sql`
    CREATE OR REPLACE FUNCTION contracts_search_vector_update() RETURNS trigger AS $$
    BEGIN
      NEW.search_vector :=
        setweight(to_tsvector('english', COALESCE(NEW.title, '')), 'A') ||
        setweight(to_tsvector('english', COALESCE(NEW.contract_number, '')), 'A') ||
        setweight(to_tsvector('english', COALESCE(NEW.terms, '')), 'B') ||
        setweight(to_tsvector('english', COALESCE(NEW.client_signatory_name, '')), 'C') ||
        setweight(to_tsvector('english', COALESCE(NEW.status::text, '')), 'C');
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql
  `;

  await sql`
    DROP TRIGGER IF EXISTS contracts_search_vector_trigger ON contracts
  `;
  await sql`
    CREATE TRIGGER contracts_search_vector_trigger
      BEFORE INSERT OR UPDATE ON contracts
      FOR EACH ROW EXECUTE FUNCTION contracts_search_vector_update()
  `;
  console.log("  + trigger: contracts_search_vector_trigger");

  await sql`
    UPDATE contracts SET search_vector =
      setweight(to_tsvector('english', COALESCE(title, '')), 'A') ||
      setweight(to_tsvector('english', COALESCE(contract_number, '')), 'A') ||
      setweight(to_tsvector('english', COALESCE(terms, '')), 'B') ||
      setweight(to_tsvector('english', COALESCE(client_signatory_name, '')), 'C') ||
      setweight(to_tsvector('english', COALESCE(status::text, '')), 'C')
    WHERE search_vector IS NULL
  `;
  console.log("  + backfill: contracts");

  // ── 3. documents ──────────────────────────────────────────────────────────

  await sql`
    ALTER TABLE documents
      ADD COLUMN IF NOT EXISTS search_vector tsvector
  `;
  console.log("  + column: documents.search_vector");

  await sql`
    CREATE INDEX IF NOT EXISTS documents_search_vector_idx
      ON documents USING GIN (search_vector)
  `;
  console.log("  + index: documents_search_vector_idx");

  await sql`
    CREATE OR REPLACE FUNCTION documents_search_vector_update() RETURNS trigger AS $$
    BEGIN
      NEW.search_vector :=
        setweight(to_tsvector('english', COALESCE(NEW.title, '')), 'A') ||
        setweight(to_tsvector('english', COALESCE(NEW.content, '')), 'B') ||
        setweight(to_tsvector('english', COALESCE(NEW.file_name, '')), 'C') ||
        setweight(to_tsvector('english', COALESCE(NEW.doc_type::text, '')), 'C');
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql
  `;

  await sql`
    DROP TRIGGER IF EXISTS documents_search_vector_trigger ON documents
  `;
  await sql`
    CREATE TRIGGER documents_search_vector_trigger
      BEFORE INSERT OR UPDATE ON documents
      FOR EACH ROW EXECUTE FUNCTION documents_search_vector_update()
  `;
  console.log("  + trigger: documents_search_vector_trigger");

  await sql`
    UPDATE documents SET search_vector =
      setweight(to_tsvector('english', COALESCE(title, '')), 'A') ||
      setweight(to_tsvector('english', COALESCE(content, '')), 'B') ||
      setweight(to_tsvector('english', COALESCE(file_name, '')), 'C') ||
      setweight(to_tsvector('english', COALESCE(doc_type::text, '')), 'C')
    WHERE search_vector IS NULL
  `;
  console.log("  + backfill: documents");

  // ── 4. companies ──────────────────────────────────────────────────────────

  await sql`
    ALTER TABLE companies
      ADD COLUMN IF NOT EXISTS search_vector tsvector
  `;
  console.log("  + column: companies.search_vector");

  await sql`
    CREATE INDEX IF NOT EXISTS companies_search_vector_idx
      ON companies USING GIN (search_vector)
  `;
  console.log("  + index: companies_search_vector_idx");

  await sql`
    CREATE OR REPLACE FUNCTION companies_search_vector_update() RETURNS trigger AS $$
    BEGIN
      NEW.search_vector :=
        setweight(to_tsvector('english', COALESCE(NEW.name, '')), 'A') ||
        setweight(to_tsvector('english', COALESCE(NEW.description, '')), 'B') ||
        setweight(to_tsvector('english', COALESCE(NEW.domain, '')), 'C') ||
        setweight(to_tsvector('english', COALESCE(NEW.slug, '')), 'C');
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql
  `;

  await sql`
    DROP TRIGGER IF EXISTS companies_search_vector_trigger ON companies
  `;
  await sql`
    CREATE TRIGGER companies_search_vector_trigger
      BEFORE INSERT OR UPDATE ON companies
      FOR EACH ROW EXECUTE FUNCTION companies_search_vector_update()
  `;
  console.log("  + trigger: companies_search_vector_trigger");

  await sql`
    UPDATE companies SET search_vector =
      setweight(to_tsvector('english', COALESCE(name, '')), 'A') ||
      setweight(to_tsvector('english', COALESCE(description, '')), 'B') ||
      setweight(to_tsvector('english', COALESCE(domain, '')), 'C') ||
      setweight(to_tsvector('english', COALESCE(slug, '')), 'C')
    WHERE search_vector IS NULL
  `;
  console.log("  + backfill: companies");

  // ── 5. recent_searches ────────────────────────────────────────────────────

  await sql`
    CREATE TABLE IF NOT EXISTS recent_searches (
      id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id        VARCHAR(255) NOT NULL,
      query          TEXT NOT NULL,
      result_count   INTEGER NOT NULL DEFAULT 0,
      clicked_type   VARCHAR(50),
      clicked_id     UUID,
      searched_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;
  console.log("  + table: recent_searches");

  await sql`
    CREATE INDEX IF NOT EXISTS recent_searches_user_searched_idx
      ON recent_searches (user_id, searched_at DESC)
  `;
  console.log("  + index: recent_searches_user_searched_idx");

  console.log("Migration 0010 complete.");
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
