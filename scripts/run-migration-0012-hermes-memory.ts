/**
 * Migration runner: drizzle/0012_hermes_memory.sql
 *
 * Creates hermes_memory + hermes_reflections tables for persistent
 * MCP-backed memory (replacing Hermes' built-in fluid memory).
 *
 * Idempotent: uses IF NOT EXISTS guards. Safe to re-run.
 *
 * Run: npx tsx --env-file=.env.local scripts/run-migration-0012-hermes-memory.ts
 */

import { config } from "dotenv";
config({ path: ".env.local" });

import postgres from "postgres";
import { readFileSync } from "node:fs";
import { join } from "node:path";

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
    console.error("[migrate-0012] DATABASE_URL not set. Aborting.");
    process.exit(1);
  }

  const sqlPath = join(process.cwd(), "drizzle", "0012_hermes_memory.sql");
  const raw = readFileSync(sqlPath, "utf-8");
  const sql = stripLineComments(raw);

  console.log("[migrate-0012] Applying migration...");
  const client = postgres(databaseUrl, { max: 1 });

  try {
    const statements = sql
      .split(";")
      .map((s) => s.trim())
      .filter((s) => s.length > 0);

    for (const stmt of statements) {
      console.log(`[migrate-0012] > ${stmt.slice(0, 80).replace(/\s+/g, " ")}...`);
      await client.unsafe(stmt);
    }

    console.log("[migrate-0012] Migration complete.");
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error("[migrate-0012] Migration failed:", err);
  process.exit(1);
});
