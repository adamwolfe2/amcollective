/**
 * Anomaly Detection — Phase 3
 *
 * Compares today's metrics against rolling baselines computed from the
 * daily_metrics_snapshots table. Only runs on rows where data_complete=true,
 * so corrupt 0-value snapshots (before Stripe was connected) can't poison
 * the baseline.
 *
 * Called by the morning-briefing Inngest job as an optional step.
 * Returns empty string if insufficient data (< MIN_BASELINE_DAYS of good rows).
 *
 * Anomaly types detected:
 *   - MRR drop > 5% below N-day rolling average
 *   - MRR spike > 15% above N-day rolling average (good news worth surfacing)
 *   - Overdue invoices spike > 50% above rolling average
 *   - Zero MRR when previous N days all had MRR > 0 (possible Stripe issue)
 */

import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { eq, desc, and, lt } from "drizzle-orm";

/** Minimum number of data_complete=true rows before anomaly detection fires */
const MIN_BASELINE_DAYS = 7;

/** Rolling window for baseline calculation */
const BASELINE_WINDOW = 14;

export interface AnomalyResult {
  hasAnomalies: boolean;
  anomalies: string[];        // human-readable descriptions
  baselineDataPoints: number; // how many rows went into the baseline
}

export async function detectAnomalies(
  currentMrr: number | null,
  currentOverdueInvoices: number
): Promise<AnomalyResult> {
  const result: AnomalyResult = { hasAnomalies: false, anomalies: [], baselineDataPoints: 0 };

  // Only run on clean data
  if (currentMrr === null) return result;

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Fetch the last BASELINE_WINDOW data_complete snapshots (excluding today)
  const snapshots = await db
    .select({
      mrr: schema.dailyMetricsSnapshots.mrr,
      overdueInvoices: schema.dailyMetricsSnapshots.overdueInvoices,
      date: schema.dailyMetricsSnapshots.date,
    })
    .from(schema.dailyMetricsSnapshots)
    .where(
      and(
        eq(schema.dailyMetricsSnapshots.dataComplete, true),
        lt(schema.dailyMetricsSnapshots.date, today)
      )
    )
    .orderBy(desc(schema.dailyMetricsSnapshots.date))
    .limit(BASELINE_WINDOW);

  result.baselineDataPoints = snapshots.length;

  // Not enough clean history yet
  if (snapshots.length < MIN_BASELINE_DAYS) return result;

  // ── Rolling averages ──────────────────────────────────────────────────────

  const avgMrr = snapshots.reduce((s, r) => s + r.mrr, 0) / snapshots.length;
  const avgOverdue = snapshots.reduce((s, r) => s + r.overdueInvoices, 0) / snapshots.length;

  // ── MRR anomalies ─────────────────────────────────────────────────────────

  if (avgMrr > 0) {
    const mrrDelta = (currentMrr - avgMrr) / avgMrr;

    if (mrrDelta < -0.05) {
      // Drop > 5%
      const pct = Math.round(Math.abs(mrrDelta) * 100);
      const avg = `$${Math.round(avgMrr / 100).toLocaleString()}`;
      const cur = `$${Math.round(currentMrr / 100).toLocaleString()}`;
      result.anomalies.push(
        `MRR down ${pct}% vs ${snapshots.length}d avg (${cur} vs ${avg} avg) — check for cancellations or Stripe sync issue`
      );
    } else if (mrrDelta > 0.15) {
      // Spike > 15% (good news)
      const pct = Math.round(mrrDelta * 100);
      const avg = `$${Math.round(avgMrr / 100).toLocaleString()}`;
      const cur = `$${Math.round(currentMrr / 100).toLocaleString()}`;
      result.anomalies.push(
        `MRR up ${pct}% vs ${snapshots.length}d avg (${cur} vs ${avg} avg)`
      );
    }

    // Zero MRR when all prior days had positive MRR (likely a Stripe sync issue)
    if (currentMrr === 0 && snapshots.every((s) => s.mrr > 0)) {
      result.anomalies.push(
        `MRR dropped to $0 — all prior ${snapshots.length} days had positive MRR. Stripe sync may have failed.`
      );
    }
  }

  // ── Overdue invoice anomalies ─────────────────────────────────────────────

  if (avgOverdue > 0 && currentOverdueInvoices > avgOverdue * 1.5) {
    const pct = Math.round(((currentOverdueInvoices - avgOverdue) / avgOverdue) * 100);
    result.anomalies.push(
      `Overdue invoices up ${pct}% vs ${snapshots.length}d avg (${currentOverdueInvoices} vs ${Math.round(avgOverdue)} avg)`
    );
  }

  result.hasAnomalies = result.anomalies.length > 0;
  return result;
}

/**
 * Formats anomaly results as a context string for injection into briefing prompt.
 * Returns empty string if no anomalies or insufficient data.
 */
export function formatAnomalyContext(result: AnomalyResult): string {
  if (!result.hasAnomalies) return "";
  return `## Anomalies Detected (${result.baselineDataPoints}d baseline)\n${result.anomalies.map((a) => `- ${a}`).join("\n")}`;
}
