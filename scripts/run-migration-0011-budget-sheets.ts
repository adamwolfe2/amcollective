/**
 * Migration runner: drizzle/0011_budget_sheets.sql
 *
 * Creates the 3 budget sheet tables (sources, rows, category snapshots) for the
 * private Google Sheets sync feature. Idempotent — uses IF NOT EXISTS guards.
 *
 * Run: npx tsx --env-file=.env.local scripts/run-migration-0011-budget-sheets.ts
 */

import { config } from "dotenv";
config({ path: ".env.local" });

import postgres from "postgres";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/** Strip ALL `-- ...` line-comments before splitting on `;`. */
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
    console.error("[migrate-0011-budget-sheets] DATABASE_URL not set. Aborting.");
    process.exit(1);
  }

  const sqlPath = join(process.cwd(), "drizzle", "0011_budget_sheets.sql");
  const raw = readFileSync(sqlPath, "utf-8");
  const sql = stripLineComments(raw);

  console.log("[migrate-0011-budget-sheets] Applying migration...");
  const client = postgres(databaseUrl, { max: 1 });

  try {
    const statements = sql
      .split(";")
      .map((s) => s.trim())
      .filter((s) => s.length > 0);

    for (const stmt of statements) {
      console.log(
        `[migrate-0011-budget-sheets] > ${stmt.slice(0, 80).replace(/\s+/g, " ")}...`
      );
      await client.unsafe(stmt);
    }

    console.log("[migrate-0011-budget-sheets] Migration complete.");
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error("[migrate-0011-budget-sheets] Migration failed:", err);
  process.exit(1);
});
