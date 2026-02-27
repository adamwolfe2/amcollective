/**
 * Final dashboard health check -- queries DB for key metrics.
 *
 * Usage: npx tsx scripts/verify-dashboard.ts
 */

import { config } from "dotenv";
config({ path: ".env.local" });

import { db } from "../lib/db";
import * as schema from "../lib/db/schema";
import { count, eq, sql, desc } from "drizzle-orm";

async function main() {
  console.log("AM Collective Dashboard Verification\n");
  console.log("=".repeat(50));

  // 1. Clients
  const [clientCount] = await db.select({ value: count() }).from(schema.clients);
  console.log(`\nClients: ${clientCount.value}`);

  // 2. Subscriptions
  const [subCount] = await db.select({ value: count() }).from(schema.subscriptions);
  const [activeSubCount] = await db
    .select({ value: count() })
    .from(schema.subscriptions)
    .where(eq(schema.subscriptions.status, "active"));
  console.log(`Subscriptions (total): ${subCount.value}`);
  console.log(`Subscriptions (active): ${activeSubCount.value}`);

  // 3. MRR from subscriptions
  const [mrrResult] = await db
    .select({ total: sql<string>`COALESCE(SUM(${schema.subscriptions.amount}), 0)` })
    .from(schema.subscriptions)
    .where(eq(schema.subscriptions.status, "active"));
  const mrr = Number(mrrResult?.total ?? 0);
  console.log(`MRR: $${(mrr / 100).toFixed(2)}`);

  // 4. Invoices
  const [invCount] = await db.select({ value: count() }).from(schema.invoices);
  console.log(`Invoices: ${invCount.value}`);

  // 5. Payments
  const [payCount] = await db.select({ value: count() }).from(schema.payments);
  console.log(`Payments: ${payCount.value}`);

  // 6. Daily Metric Snapshots
  const [snapCount] = await db.select({ value: count() }).from(schema.dailyMetricsSnapshots);
  const latestSnap = await db
    .select()
    .from(schema.dailyMetricsSnapshots)
    .orderBy(desc(schema.dailyMetricsSnapshots.date))
    .limit(1);
  console.log(`\nDaily Snapshots: ${snapCount.value}`);
  if (latestSnap.length > 0) {
    const s = latestSnap[0];
    console.log(`  Latest (${s.date}): MRR=$${(s.mrr / 100).toFixed(2)}, Clients=${s.activeClients}, Subs=${s.activeSubscriptions}`);
  }

  // 7. Subscription Costs
  const [costCount] = await db.select({ value: count() }).from(schema.subscriptionCosts);
  console.log(`\nSubscription Costs: ${costCount.value}`);

  // 8. Companies
  const [companyCount] = await db.select({ value: count() }).from(schema.companies);
  console.log(`Companies: ${companyCount.value}`);

  // 9. Portfolio Projects
  const [projCount] = await db.select({ value: count() }).from(schema.portfolioProjects);
  console.log(`Portfolio Projects: ${projCount.value}`);

  // Summary
  console.log("\n" + "=".repeat(50));
  const allGood =
    clientCount.value > 0 &&
    snapCount.value > 0;
  console.log(allGood ? "\nDashboard: READY (data populated)" : "\nDashboard: NEEDS DATA (run sync + seed scripts)");

  process.exit(0);
}

main().catch((err) => {
  console.error("Verification failed:", err);
  process.exit(1);
});
