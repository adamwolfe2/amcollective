/**
 * Test Mercury API connection -- lists accounts.
 *
 * Usage: npx tsx --env-file=.env.local scripts/test-mercury.ts
 */

import { config } from "dotenv";
config({ path: ".env.local" });

async function main() {
  const key = process.env.MERCURY_API_KEY;
  if (!key) {
    console.error("MERCURY_API_KEY is not set");
    process.exit(1);
  }

  console.log("Testing Mercury API connection...\n");

  const res = await fetch("https://api.mercury.com/api/v1/accounts", {
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
  });

  if (!res.ok) {
    const text = await res.text();
    console.error(`Mercury API error: ${res.status} ${res.statusText}`);
    console.error(text);
    process.exit(1);
  }

  const data = await res.json();
  const accounts = data.accounts ?? data;

  console.log(`Accounts found: ${Array.isArray(accounts) ? accounts.length : "unknown format"}`);
  if (Array.isArray(accounts)) {
    for (const acct of accounts) {
      console.log(`  ${acct.name ?? acct.id} -- $${acct.currentBalance ?? acct.balance ?? "?"}`);
    }
  }

  console.log("\nMercury connection: OK");
}

main().catch((err) => {
  console.error("Mercury test failed:", err.message);
  process.exit(1);
});
