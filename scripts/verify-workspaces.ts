/**
 * Dev diagnostic — pings every EMAILBISON_WORKSPACES entry and prints campaign counts.
 *
 * Run with:  pnpm exec tsx scripts/verify-workspaces.ts
 *
 * This file uses `export {}` to mark itself as a module so its top-level
 * decls don't collide with other scripts under tsc --noEmit.
 */
export {};

import { config } from "dotenv";
config({ path: ".env.local" });

import { getWorkspaceKeys } from "@/lib/connectors/emailbison";

async function main() {
  const keys = getWorkspaceKeys();
  console.log(`Found ${keys.length} workspaces:`);
  for (const k of keys) {
    console.log(
      `  ${k.workspace.padEnd(20)} ← "${k.displayName?.padEnd(22)}"  ${k.baseUrl}`
    );
  }
  // Quick ping — fetch campaigns count from each workspace
  console.log("\nPinging each workspace…");
  for (const k of keys) {
    try {
      const res = await fetch(`${k.baseUrl}/api/campaigns?per_page=1`, {
        headers: {
          Authorization: `Bearer ${k.apiKey}`,
          Accept: "application/json",
        },
        signal: AbortSignal.timeout(8_000),
      });
      const body = (await res.json()) as { data?: unknown[]; meta?: { total?: number } };
      const total = body.meta?.total ?? body.data?.length ?? "?";
      console.log(
        `  ${k.workspace.padEnd(20)} ${res.ok ? "OK" : "FAIL"} ${res.status}  campaigns≈${total}`
      );
    } catch (e) {
      console.log(`  ${k.workspace.padEnd(20)} ERROR: ${(e as Error).message}`);
    }
  }
}
main();
