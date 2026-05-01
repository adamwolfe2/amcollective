/**
 * Migration: Reply draft linkage (drizzle/0010_reply_draft_linkage.sql)
 *
 * Adds reply context columns to email_drafts so the cold-email auto-responder
 * can link generated drafts back to the EmailBison reply they answer.
 *
 * Columns added:
 *  - reply_external_id   integer       — EmailBison reply ID
 *  - reply_intent        varchar(40)   — classifier intent (interested, objection, etc.)
 *  - reply_confidence    integer       — 0-100 classifier confidence
 *  - reply_safe_to_auto_send boolean   — whether responder marked it safe to auto-send
 *
 * Indexes:
 *  - email_drafts_reply_external_id_idx
 *  - email_drafts_reply_intent_idx
 *
 * Run: npx tsx --env-file=.env.local scripts/run-migration-0010-reply-drafts.ts
 *
 * Idempotent: uses IF NOT EXISTS for columns and indexes. Safe to re-run.
 */

import { config } from "dotenv";
config({ path: ".env.local" });

import postgres from "postgres";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/** Strip ALL `-- ...` line-comments from SQL before splitting on `;`. A
 *  comment like "-- foo; bar" contains a semicolon that would otherwise
 *  split the next statement in two. */
function stripLineComments(sql: string): string {
  return sql
    .split("\n")
    .map((line) => {
      const idx = line.indexOf("--");
      return idx >= 0 ? line.slice(0, idx) : line;
    })
    .join("\n");
}

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error("[migrate-0010-reply-drafts] DATABASE_URL not set. Aborting.");
    process.exit(1);
  }

  const sqlPath = join(process.cwd(), "drizzle", "0010_reply_draft_linkage.sql");
  const raw = readFileSync(sqlPath, "utf-8");
  const sql = stripLineComments(raw);

  console.log("[migrate-0010-reply-drafts] Applying migration...");
  const client = postgres(databaseUrl, { max: 1 });

  try {
    const statements = sql
      .split(";")
      .map((s) => s.trim())
      .filter((s) => s.length > 0);

    for (const stmt of statements) {
      console.log(`[migrate-0010-reply-drafts] > ${stmt.slice(0, 80).replace(/\s+/g, " ")}...`);
      await client.unsafe(stmt);
    }

    console.log("[migrate-0010-reply-drafts] Migration complete.");
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error("[migrate-0010-reply-drafts] Migration failed:", err);
  process.exit(1);
});
