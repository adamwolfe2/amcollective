/**
 * Test Stripe multi-account access via the organization API key.
 *
 * Iterates all 6 connected accounts, lists customers + subscriptions,
 * and prints MRR per company.
 *
 * Usage: npx tsx scripts/test-stripe-multi.ts
 */

import { config } from "dotenv";
config({ path: ".env.local" });

import Stripe from "stripe";

const STRIPE_ACCOUNTS = [
  { accountId: "acct_1SaRcNAE3L44wTdt", name: "CampusGTM" },
  { accountId: "acct_1QkC1gEmhKaqBpAE", name: "Cursive" },
  { accountId: "acct_1SrmimEy1dBa5hjw", name: "Hook" },
  { accountId: "acct_1SXAa57FVJjwnaNb", name: "TaskSpace" },
  { accountId: "acct_1T47wVEbVKsEnOXQ", name: "TBGC" },
  { accountId: "acct_1T2c4fExwpuzI9Oq", name: "Trackr" },
] as const;

async function main() {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    console.error("STRIPE_SECRET_KEY is not set");
    process.exit(1);
  }

  const stripe = new Stripe(key, {
    apiVersion: "2025-01-27.acacia" as Stripe.LatestApiVersion,
  });

  console.log("Testing Stripe multi-account access...\n");
  console.log("=".repeat(60));

  let totalMrr = 0;
  let totalCustomers = 0;
  let totalSubs = 0;

  for (const account of STRIPE_ACCOUNTS) {
    const opts = { stripeAccount: account.accountId };
    console.log(`\n--- ${account.name} (${account.accountId}) ---`);

    try {
      // Customers
      const customers = await stripe.customers.list({ limit: 100 }, opts);
      console.log(`  Customers: ${customers.data.length}`);
      totalCustomers += customers.data.length;

      // Subscriptions
      const subs = await stripe.subscriptions.list(
        { status: "all", expand: ["data.items"], limit: 100 },
        opts
      );
      const activeSubs = subs.data.filter((s) => s.status === "active");
      console.log(`  Subscriptions (total): ${subs.data.length}`);
      console.log(`  Subscriptions (active): ${activeSubs.length}`);
      totalSubs += activeSubs.length;

      // MRR
      let accountMrr = 0;
      for (const sub of activeSubs) {
        for (const item of sub.items.data) {
          const amount = item.price?.unit_amount ?? 0;
          const qty = item.quantity ?? 1;
          const interval = item.price?.recurring?.interval;
          if (interval === "year") {
            accountMrr += Math.round((amount * qty) / 12);
          } else if (interval === "month") {
            accountMrr += amount * qty;
          } else if (interval === "week") {
            accountMrr += Math.round((amount * qty * 52) / 12);
          }
        }
      }
      console.log(`  MRR: $${(accountMrr / 100).toFixed(2)}`);
      totalMrr += accountMrr;

      // Recent charges
      const charges = await stripe.charges.list({ limit: 5 }, opts);
      console.log(`  Recent charges: ${charges.data.length}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`  ERROR: ${msg}`);
    }
  }

  console.log("\n" + "=".repeat(60));
  console.log(`\nAGGREGATE TOTALS:`);
  console.log(`  Total Customers: ${totalCustomers}`);
  console.log(`  Total Active Subscriptions: ${totalSubs}`);
  console.log(`  Total MRR: $${(totalMrr / 100).toFixed(2)}`);
  console.log("\nMulti-account test: COMPLETE");
}

main().catch((err) => {
  console.error("Multi-account test failed:", err.message);
  process.exit(1);
});
