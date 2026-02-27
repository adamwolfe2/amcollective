/**
 * Run the full Stripe sync directly (bypasses auth middleware).
 *
 * Usage: npx tsx scripts/run-stripe-sync.ts
 */

import { config } from "dotenv";
config({ path: ".env.local" });

import { syncEverything } from "../lib/stripe/sync";

async function main() {
  console.log("Running full Stripe sync...\n");

  const result = await syncEverything();

  console.log("Sync results:");
  console.log(`  Customers synced: ${result.customers}`);
  console.log(`  Subscriptions synced: ${result.subscriptions}`);
  console.log(`  Invoices synced: ${result.invoices}`);
  console.log(`  Charges synced: ${result.charges}`);

  if (result.errors.length > 0) {
    console.log(`\nErrors (${result.errors.length}):`);
    for (const err of result.errors) {
      console.log(`  - ${err}`);
    }
  } else {
    console.log("\nNo errors.");
  }

  process.exit(result.errors.length > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error("Stripe sync script failed:", err);
  process.exit(1);
});
