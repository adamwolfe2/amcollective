/**
 * Test script — runs the full strategy engine pipeline and prints results.
 * Usage: npx tsx scripts/test-strategy.ts
 */

// Must be first — before any imports that read process.env
// eslint-disable-next-line @typescript-eslint/no-require-imports
require("dotenv").config({ path: require("path").resolve(process.cwd(), ".env.local") });

import { gatherStrategyData, generateStrategyRecommendations, persistStrategyResult } from "../lib/ai/agents/strategy-engine";

const fmt = (cents: number) => `$${Math.round(cents / 100).toLocaleString()}`;

async function main() {
  console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("  STRATEGY INTELLIGENCE ENGINE — TEST RUN");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

  // ── Step 1: Gather data ──────────────────────────────────────────────
  console.log("Step 1 / 3 — Gathering data from all connectors...");
  const startGather = Date.now();
  const data = await gatherStrategyData();
  console.log(`  Done in ${Date.now() - startGather}ms\n`);

  console.log("  Platform Financials:");
  console.log(`    Total MRR:      ${fmt(data.totalMrrCents)}/mo`);
  console.log(`    MRR Growth:     ${data.mrrGrowthPct !== null ? `${data.mrrGrowthPct > 0 ? "+" : ""}${data.mrrGrowthPct}%` : "insufficient data"} (30d)`);
  console.log(`    Cash:           ${data.totalCashCents > 0 ? fmt(data.totalCashCents) : "Mercury not synced"}`);
  console.log(`    Monthly Burn:   ${fmt(data.monthlyBurnCents)}`);
  console.log(`    Runway:         ${data.runwayMonths !== null ? `${data.runwayMonths} months` : "unknown"}`);
  console.log(`    Concentration:  ${data.concentrationPct}% (top product)`);
  console.log(`    Overdue:        ${data.overdueInvoices} invoices, ${fmt(data.overdueAmountCents)}`);
  console.log(`    Open Proposals: ${data.openProposalCount} (${fmt(data.openProposalValueCents)})`);
  console.log(`    Alerts:         ${data.unresolvedAlerts} unresolved`);
  console.log(`    At-Risk Rocks:  ${data.atRiskRocks}`);

  console.log("\n  Products:");
  if (data.products.length === 0) {
    console.log("    (no product connector data available)");
  } else {
    for (const p of data.products) {
      console.log(`    ${p.name.padEnd(12)} MRR: ${fmt(p.mrrCents).padEnd(10)} Cost: ${fmt(p.monthlyCostCents).padEnd(10)} Margin: ${p.marginPct}%${p.notes.length > 0 ? `  — ${p.notes.join(", ")}` : ""}`);
    }
  }

  console.log("\n  Costs by tag:");
  for (const [tag, cost] of Object.entries(data.costsByTag)) {
    console.log(`    ${tag.padEnd(14)} ${fmt(cost)}/mo`);
  }

  console.log("\n  Revenue trend:");
  if (data.revenueTrend.length === 0) {
    console.log("    (no trend data)");
  } else {
    for (const t of data.revenueTrend) {
      console.log(`    ${t.month}  ${fmt(t.revenue)}`);
    }
  }

  // ── Step 2: Generate recommendations ────────────────────────────────
  console.log("\nStep 2 / 3 — Generating recommendations via Claude...");
  const startGen = Date.now();
  const result = await generateStrategyRecommendations(data, false);
  console.log(`  Done in ${Date.now() - startGen}ms\n`);

  console.log("  Executive Summary:");
  console.log(`    ${result.metrics.executiveSummary}\n`);

  console.log(`  Health Score:  ${result.metrics.healthScore}/100`);
  console.log(`  Risk Level:    ${result.metrics.riskLevel}`);
  console.log(`  Runway:        ${result.metrics.runwayMonths !== null ? `${result.metrics.runwayMonths} months` : "unknown"}`);
  console.log(`  MRR Growth:    ${result.metrics.mrrGrowthPct !== null ? `${result.metrics.mrrGrowthPct}%` : "unknown"}`);

  console.log(`\n  Recommendations (${result.recommendations.length}):`);
  const priorityLabels: Record<number, string> = { 2: "URGENT", 1: "ACTION", 0: "INFO  " };
  for (const r of result.recommendations) {
    console.log(`\n  [${priorityLabels[r.priority] ?? "INFO  "}] ${r.title}`);
    console.log(`          Type: ${r.type} | Product: ${r.product ?? "platform"} | Effort: ${r.effort ?? "?"}`);
    if (r.estimatedValueCents) console.log(`          Impact: ~${fmt(r.estimatedValueCents)}/mo`);
    console.log(`          Action: ${r.recommendation.slice(0, 120)}...`);
  }

  console.log("\n  Revenue Forecast:");
  for (const f of result.metrics.revenueForecast) {
    console.log(`    ${f.month}  ${fmt(f.projectedMrrCents)}/mo (projected)`);
  }

  // ── Step 3: Persist ─────────────────────────────────────────────────
  const weekOf = (() => {
    const d = new Date();
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1);
    d.setDate(diff);
    return d.toISOString().split("T")[0];
  })();

  console.log(`\nStep 3 / 3 — Persisting to DB (week: ${weekOf})...`);
  const startPersist = Date.now();
  await persistStrategyResult(weekOf, result);
  console.log(`  Done in ${Date.now() - startPersist}ms`);

  console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("  COMPLETE — results saved to DB");
  console.log(`  View at: http://localhost:3000/strategy`);
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

  process.exit(0);
}

main().catch((err) => {
  console.error("\nFailed:", err);
  process.exit(1);
});
