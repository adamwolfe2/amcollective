/**
 * Setup: AM Collective Control Plane (one-shot bootstrap)
 *
 * Runs everything end-to-end so you don't have to copy-paste 5 commands:
 *   1. Migration 0010 — reply draft linkage on email_drafts
 *   2. Migration 0011 — budget sheet tables
 *   3. Seed strategic roadmap (40 tasks)
 *   4. Register your 2 budget sheets (requires OWNER_CLERK_ID env or arg)
 *
 * Idempotent. Safe to re-run.
 *
 * Run:
 *   OWNER_CLERK_ID=user_xxx npx tsx --env-file=.env.local scripts/setup-control-plane.ts
 *
 * Or pass clerk id positionally:
 *   npx tsx --env-file=.env.local scripts/setup-control-plane.ts user_xxx
 *
 * If you don't pass an OWNER_CLERK_ID, steps 1-3 still run and step 4 is skipped.
 */

import { config } from "dotenv";
config({ path: ".env.local" });

import postgres from "postgres";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const ROOT = process.cwd();

/** Strip all `-- ...` line-comments from SQL before splitting on `;`.
 *  This is critical: a comment like "-- foo; bar" contains a semicolon
 *  that would otherwise split the next statement in two. */
function stripLineComments(sql: string): string {
  return sql
    .split("\n")
    .map((line) => {
      // Naive but sufficient for our migrations — we don't use `--` inside
      // any string literal in our DDL files.
      const idx = line.indexOf("--");
      return idx >= 0 ? line.slice(0, idx) : line;
    })
    .join("\n");
}

async function runSqlFile(client: ReturnType<typeof postgres>, fileName: string, label: string) {
  const path = join(ROOT, "drizzle", fileName);
  const raw = readFileSync(path, "utf-8");
  const sql = stripLineComments(raw);
  const statements = sql
    .split(";")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  console.log(`\n[setup] === ${label} (${statements.length} statements) ===`);
  for (const stmt of statements) {
    const preview = stmt.slice(0, 80).replace(/\s+/g, " ");
    console.log(`[setup]  > ${preview}...`);
    await client.unsafe(stmt);
  }
  console.log(`[setup] ✓ ${label} done.`);
}

function runTsxScript(script: string, args: string[] = []) {
  console.log(`\n[setup] === Running ${script} ${args.join(" ")} ===`);
  const result = spawnSync(
    "npx",
    ["tsx", "--env-file=.env.local", `scripts/${script}`, ...args],
    { stdio: "inherit", cwd: ROOT }
  );
  if (result.status !== 0) {
    throw new Error(`${script} exited with code ${result.status}`);
  }
}

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error("[setup] DATABASE_URL not set. Aborting.");
    process.exit(1);
  }

  const ownerClerkId = process.argv[2] ?? process.env.OWNER_CLERK_ID;

  console.log("[setup] AM Collective Control Plane bootstrap");
  console.log(`[setup] DATABASE_URL set: ✓`);
  console.log(`[setup] OWNER_CLERK_ID: ${ownerClerkId ? ownerClerkId : "(none — step 4 will be skipped)"}`);

  // ── Steps 1 + 2: migrations
  const client = postgres(databaseUrl, { max: 1 });
  try {
    await runSqlFile(client, "0010_reply_draft_linkage.sql", "Migration 0010 — reply draft linkage");
    await runSqlFile(client, "0011_budget_sheets.sql", "Migration 0011 — budget sheets");
  } finally {
    await client.end();
  }

  // ── Step 3: seed roadmap (its own DB connection via @/lib/db)
  runTsxScript("seed-strategic-roadmap.ts");

  // ── Step 4: register budget sheets (requires owner)
  if (ownerClerkId) {
    runTsxScript("register-budget-sheets.ts", [ownerClerkId]);
  } else {
    console.log("\n[setup] Skipping step 4 (register budget sheets) — no OWNER_CLERK_ID provided.");
    console.log("[setup] To run later:");
    console.log("[setup]   npx tsx --env-file=.env.local scripts/register-budget-sheets.ts <your_clerk_user_id>");
  }

  console.log("\n[setup] ✓ All done. Next:");
  console.log("[setup]   1. Open /command in the admin portal — strategic roadmap should be populated.");
  console.log("[setup]   2. Connect Google Calendar + Sheets via Composio at /settings/integrations.");
  console.log("[setup]   3. Update budget_sheet_sources rows with composio_user_id + composio_account_id once connected.");
  process.exit(0);
}

main().catch((err) => {
  console.error("[setup] Failed:", err);
  process.exit(1);
});
