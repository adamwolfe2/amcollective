/**
 * Migration 0009: Add email deliverability tables.
 *
 * Creates two tables:
 *   - email_suppressions: tracks bounces, complaints, and unsubscribes
 *   - email_events: records every Resend webhook event for analytics
 *
 * Run: npx tsx --env-file=.env.local scripts/run-migration-0009.ts
 *
 * DO NOT run in production without a maintenance window review. This is a
 * non-destructive addition (CREATE TABLE IF NOT EXISTS) so it is safe to run
 * on a live database, but review first.
 */

import { config } from "dotenv";
config({ path: ".env.local" });

import { neon } from "@neondatabase/serverless";

async function main() {
  const sql = neon(process.env.DATABASE_URL!);

  console.log("Applying migration 0009 — email deliverability tables...");

  // Create enums (idempotent guard via DO block)
  await sql`
    DO $$
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'email_suppression_reason') THEN
        CREATE TYPE email_suppression_reason AS ENUM ('bounce', 'complaint', 'unsubscribe');
      END IF;
    END
    $$
  `;
  console.log("  + enum: email_suppression_reason");

  await sql`
    DO $$
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'email_suppression_source') THEN
        CREATE TYPE email_suppression_source AS ENUM ('resend_webhook', 'manual');
      END IF;
    END
    $$
  `;
  console.log("  + enum: email_suppression_source");

  await sql`
    DO $$
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'email_event_type') THEN
        CREATE TYPE email_event_type AS ENUM ('sent', 'delivered', 'opened', 'bounced', 'complained', 'clicked');
      END IF;
    END
    $$
  `;
  console.log("  + enum: email_event_type");

  await sql`
    CREATE TABLE IF NOT EXISTS email_suppressions (
      id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      email       VARCHAR(320) NOT NULL,
      reason      email_suppression_reason NOT NULL,
      source      email_suppression_source NOT NULL,
      created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      expires_at  TIMESTAMPTZ
    )
  `;
  console.log("  + table: email_suppressions");

  await sql`
    CREATE UNIQUE INDEX IF NOT EXISTS email_suppressions_email_idx
      ON email_suppressions (email)
  `;
  await sql`
    CREATE INDEX IF NOT EXISTS email_suppressions_reason_idx
      ON email_suppressions (reason)
  `;
  await sql`
    CREATE INDEX IF NOT EXISTS email_suppressions_created_at_idx
      ON email_suppressions (created_at)
  `;
  console.log("  + indexes: email_suppressions");

  await sql`
    CREATE TABLE IF NOT EXISTS email_events (
      id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      message_id      VARCHAR(255) NOT NULL,
      recipient_email VARCHAR(320) NOT NULL,
      template_name   VARCHAR(255),
      event           email_event_type NOT NULL,
      timestamp       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      metadata        JSONB
    )
  `;
  console.log("  + table: email_events");

  await sql`
    CREATE UNIQUE INDEX IF NOT EXISTS email_events_message_id_event_idx
      ON email_events (message_id, event)
  `;
  await sql`
    CREATE INDEX IF NOT EXISTS email_events_recipient_email_idx
      ON email_events (recipient_email)
  `;
  await sql`
    CREATE INDEX IF NOT EXISTS email_events_event_idx
      ON email_events (event)
  `;
  await sql`
    CREATE INDEX IF NOT EXISTS email_events_timestamp_idx
      ON email_events (timestamp DESC)
  `;
  await sql`
    CREATE INDEX IF NOT EXISTS email_events_template_name_idx
      ON email_events (template_name)
  `;
  console.log("  + indexes: email_events");

  console.log("Migration 0009 complete.");
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
