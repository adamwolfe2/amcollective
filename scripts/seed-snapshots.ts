/**
 * Seed Script — Backfill 30 Days of Daily Metrics Snapshots
 *
 * Reads current DB state and generates synthetic historical snapshots
 * with realistic variance. Run once to bootstrap delta calculations.
 *
 * Usage: npx tsx scripts/seed-snapshots.ts
 */

import { config } from "dotenv";
config({ path: ".env.local" });

import { db } from "../lib/db";
import * as schema from "../lib/db/schema";
import { eq, sql, count } from "drizzle-orm";

async function main() {
  console.log("Seeding 30 days of daily metrics snapshots...\n");

  // Get current values
  const [mrrResult] = await db
    .select({
      total: sql<string>`COALESCE(SUM(${schema.subscriptions.amount}), 0)`,
    })
    .from(schema.subscriptions)
    .where(eq(schema.subscriptions.status, "active"));

  const [subsCount] = await db
    .select({ value: count() })
    .from(schema.subscriptions)
    .where(eq(schema.subscriptions.status, "active"));

  const mercuryAccounts = await db.select().from(schema.mercuryAccounts);
  const totalCash = mercuryAccounts.reduce(
    (s, a) => s + Number(a.balance),
    0
  );

  const [activeClients] = await db
    .select({
      value: sql<number>`COUNT(DISTINCT ${schema.kanbanCards.clientId})`,
    })
    .from(schema.kanbanCards)
    .where(sql`${schema.kanbanCards.completedAt} IS NULL`);

  const projects = await db
    .select({ status: schema.portfolioProjects.status })
    .from(schema.portfolioProjects);

  const overdue = await db
    .select({ amount: schema.invoices.amount })
    .from(schema.invoices)
    .where(eq(schema.invoices.status, "overdue"));

  const currentMrr = Number(mrrResult?.total ?? 0);
  const currentSubs = subsCount?.value ?? 0;
  const currentCash = totalCash;
  const currentActiveClients = Number(activeClients?.value ?? 0);
  const currentActiveProjects = projects.filter(
    (p) => p.status === "active"
  ).length;
  const currentOverdueCount = overdue.length;
  const currentOverdueAmount = overdue.reduce((s, inv) => s + inv.amount, 0);

  console.log("Current state:");
  console.log(`  MRR: ${currentMrr} cents ($${(currentMrr / 100).toFixed(2)})`);
  console.log(`  Cash: ${currentCash} cents ($${(currentCash / 100).toFixed(2)})`);
  console.log(`  Active clients: ${currentActiveClients}`);
  console.log(`  Active projects: ${currentActiveProjects}`);
  console.log(`  Overdue invoices: ${currentOverdueCount}`);
  console.log();

  // Generate 30 days of snapshots with slight variance
  const snapshots = [];
  for (let daysAgo = 30; daysAgo >= 0; daysAgo--) {
    const date = new Date();
    date.setUTCDate(date.getUTCDate() - daysAgo);
    date.setUTCHours(0, 0, 0, 0);

    // Apply progressive variance — older data is slightly different
    const progress = (30 - daysAgo) / 30; // 0 → 1 as we approach today
    const variance = (seed: number) =>
      Math.round(seed * (0.85 + 0.15 * progress + (Math.random() - 0.5) * 0.04));

    snapshots.push({
      date,
      mrr: variance(currentMrr),
      arr: variance(currentMrr) * 12,
      totalCash: variance(currentCash),
      activeClients: Math.max(
        0,
        currentActiveClients + Math.round((Math.random() - 0.5) * 2)
      ),
      activeProjects: currentActiveProjects,
      activeSubscriptions: Math.max(
        0,
        currentSubs + Math.round((Math.random() - 0.5) * 2)
      ),
      overdueInvoices: Math.max(
        0,
        currentOverdueCount + Math.round((Math.random() - 0.5) * 2)
      ),
      overdueAmount: variance(currentOverdueAmount),
      metadata: {
        seeded: true,
        capturedAt: date.toISOString(),
      },
    });
  }

  // Upsert all snapshots
  for (const snap of snapshots) {
    await db
      .insert(schema.dailyMetricsSnapshots)
      .values(snap)
      .onConflictDoUpdate({
        target: schema.dailyMetricsSnapshots.date,
        set: {
          mrr: snap.mrr,
          arr: snap.arr,
          totalCash: snap.totalCash,
          activeClients: snap.activeClients,
          activeProjects: snap.activeProjects,
          activeSubscriptions: snap.activeSubscriptions,
          overdueInvoices: snap.overdueInvoices,
          overdueAmount: snap.overdueAmount,
          metadata: snap.metadata,
        },
      });
  }

  console.log(`Inserted ${snapshots.length} daily snapshots.`);
  console.log("Done!");
  process.exit(0);
}

main().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
