/**
 * Test Stripe connection -- lists customers, subscriptions, calculates MRR.
 *
 * Usage: npx tsx scripts/test-stripe.ts
 */

import { config } from "dotenv";
config({ path: ".env.local" });

import Stripe from "stripe";

async function main() {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    console.error("STRIPE_SECRET_KEY is not set");
    process.exit(1);
  }

  const stripe = new Stripe(key, { apiVersion: "2025-01-27.acacia" as Stripe.LatestApiVersion });

  console.log("Testing Stripe connection...\n");

  // Customers
  const customers = await stripe.customers.list({ limit: 100 });
  console.log(`Customers: ${customers.data.length}`);

  // Subscriptions
  const subs = await stripe.subscriptions.list({ limit: 100, status: "all" });
  const activeSubs = subs.data.filter((s) => s.status === "active");
  console.log(`Subscriptions (total): ${subs.data.length}`);
  console.log(`Subscriptions (active): ${activeSubs.length}`);

  // MRR calculation
  let mrr = 0;
  for (const sub of activeSubs) {
    for (const item of sub.items.data) {
      const amount = item.price?.unit_amount ?? 0;
      const interval = item.price?.recurring?.interval;
      if (interval === "year") {
        mrr += Math.round(amount / 12);
      } else {
        mrr += amount;
      }
    }
  }
  console.log(`Calculated MRR: $${(mrr / 100).toFixed(2)}`);

  // Recent invoices
  const invoices = await stripe.invoices.list({ limit: 10 });
  console.log(`\nRecent invoices: ${invoices.data.length}`);
  for (const inv of invoices.data.slice(0, 5)) {
    console.log(`  ${inv.number ?? inv.id} -- $${((inv.amount_due ?? 0) / 100).toFixed(2)} -- ${inv.status}`);
  }

  // Charges
  const charges = await stripe.charges.list({ limit: 10 });
  console.log(`\nRecent charges: ${charges.data.length}`);

  console.log("\nStripe connection: OK");
}

main().catch((err) => {
  console.error("Stripe test failed:", err.message);
  process.exit(1);
});
