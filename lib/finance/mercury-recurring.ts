/**
 * Detect recurring patterns in Mercury transaction history.
 *
 * Strategy:
 *   1. Look at all debits (expenses) over the last N days.
 *   2. Group by (counterpartyName, rounded amount bucket) — counterparties
 *      that bill within a few cents the same amount each cycle land together.
 *   3. For each group with ≥ MIN_OCCURRENCES, compute average days between
 *      consecutive postings.
 *   4. If the avg interval falls inside one of the cadence windows
 *      (weekly / biweekly / monthly / quarterly / annual), treat the group
 *      as a recurring pattern.
 *   5. Estimate next renewal = last seen + avg interval.
 *
 * Returns candidates ranked by recency × amount so the UI can surface the
 * highest-leverage ones first.
 *
 * Designed to be cheap — runs on whatever transactions are already in
 * mercury_transactions. No external API calls.
 */

import { differenceInDays } from "date-fns";

import type { CompanyTag } from "@/lib/db/schema/costs";

const MIN_OCCURRENCES = 2;
const AMOUNT_BUCKET_CENTS = 100; // group txns within ±$1 of each other

const CADENCE_WINDOWS: Array<{
  cycle: "weekly" | "biweekly" | "monthly" | "quarterly" | "annual";
  min: number;
  max: number;
  ideal: number;
}> = [
  { cycle: "weekly", min: 5, max: 9, ideal: 7 },
  { cycle: "biweekly", min: 12, max: 16, ideal: 14 },
  { cycle: "monthly", min: 25, max: 35, ideal: 30 },
  { cycle: "quarterly", min: 80, max: 100, ideal: 90 },
  { cycle: "annual", min: 350, max: 380, ideal: 365 },
];

export interface MercuryTxn {
  id: string;
  amountCents: number; // positive, absolute value
  direction: "debit" | "credit";
  counterpartyName: string | null;
  description: string | null;
  companyTag: CompanyTag;
  postedAt: Date;
}

export interface RecurringCandidate {
  /** Stable key derived from counterparty + bucket — useful as dedupe key. */
  key: string;
  counterparty: string;
  description: string | null;
  /** Estimated steady-state amount (cents). Median of observations. */
  amountCents: number;
  /** Range of amounts we saw, in cents — confidence signal. */
  amountRangeCents: { min: number; max: number };
  cycle: "weekly" | "biweekly" | "monthly" | "quarterly" | "annual";
  /** Observed average interval in days — for diagnostics. */
  avgIntervalDays: number;
  /** Tags seen on these transactions (mode wins; falls back to "untagged"). */
  dominantTag: CompanyTag;
  occurrences: number;
  firstSeen: Date;
  lastSeen: Date;
  /** Next expected charge date = lastSeen + ideal interval for that cycle. */
  nextExpected: Date;
  /** Source transaction ids so the UI can deep-link if desired. */
  txnIds: string[];
}

function bucketAmount(cents: number): number {
  return Math.round(cents / AMOUNT_BUCKET_CENTS) * AMOUNT_BUCKET_CENTS;
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? Math.round((sorted[mid - 1] + sorted[mid]) / 2)
    : sorted[mid];
}

function mode<T>(values: T[]): T | undefined {
  if (values.length === 0) return undefined;
  const counts = new Map<T, number>();
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
  let best: T | undefined;
  let bestN = 0;
  for (const [v, n] of counts.entries()) {
    if (n > bestN) {
      bestN = n;
      best = v;
    }
  }
  return best;
}

function matchCycle(avgDays: number): (typeof CADENCE_WINDOWS)[number] | null {
  for (const w of CADENCE_WINDOWS) {
    if (avgDays >= w.min && avgDays <= w.max) return w;
  }
  return null;
}

export interface DetectOptions {
  /** Defaults to 180 days back from "now". */
  lookbackDays?: number;
  /** Optional clock override for tests. */
  now?: Date;
}

/**
 * Pure function — feed it the debit transactions you've already pulled from
 * the DB and it returns candidates. Caller filters by lookback window first.
 */
export function detectRecurring(
  transactions: ReadonlyArray<MercuryTxn>,
  opts: DetectOptions = {}
): RecurringCandidate[] {
  const lookbackDays = opts.lookbackDays ?? 180;
  const now = opts.now ?? new Date();
  const cutoff = new Date(now.getTime() - lookbackDays * 24 * 60 * 60 * 1000);

  // Only debits, only within lookback, only with a counterparty.
  const filtered = transactions.filter(
    (t) =>
      t.direction === "debit" &&
      t.postedAt &&
      t.postedAt >= cutoff &&
      (t.counterpartyName?.trim() || t.description?.trim())
  );

  // Group by (counterparty, amount bucket).
  const groups = new Map<string, MercuryTxn[]>();
  for (const t of filtered) {
    const cp = (t.counterpartyName || t.description || "Unknown").trim();
    const bucket = bucketAmount(t.amountCents);
    const key = `${cp}::${bucket}`;
    const arr = groups.get(key) ?? [];
    arr.push(t);
    groups.set(key, arr);
  }

  const candidates: RecurringCandidate[] = [];
  for (const [key, txns] of groups.entries()) {
    if (txns.length < MIN_OCCURRENCES) continue;
    // Sort by postedAt ascending.
    txns.sort((a, b) => a.postedAt.getTime() - b.postedAt.getTime());

    // Compute intervals between consecutive postings.
    const intervals: number[] = [];
    for (let i = 1; i < txns.length; i++) {
      intervals.push(differenceInDays(txns[i].postedAt, txns[i - 1].postedAt));
    }
    const avgInterval = intervals.reduce((s, x) => s + x, 0) / intervals.length;
    const matched = matchCycle(avgInterval);
    if (!matched) continue;

    const amounts = txns.map((t) => t.amountCents);
    const medianAmount = median(amounts);
    const dominantTag = (mode(txns.map((t) => t.companyTag)) ?? "untagged") as CompanyTag;
    const lastSeen = txns[txns.length - 1].postedAt;
    const nextExpected = new Date(lastSeen.getTime() + matched.ideal * 24 * 60 * 60 * 1000);

    candidates.push({
      key,
      counterparty: txns[0].counterpartyName || txns[0].description || "Unknown",
      description: txns[txns.length - 1].description,
      amountCents: medianAmount,
      amountRangeCents: {
        min: Math.min(...amounts),
        max: Math.max(...amounts),
      },
      cycle: matched.cycle,
      avgIntervalDays: Math.round(avgInterval),
      dominantTag,
      occurrences: txns.length,
      firstSeen: txns[0].postedAt,
      lastSeen,
      nextExpected,
      txnIds: txns.map((t) => t.id),
    });
  }

  // Rank by monthly-equivalent burn so high-impact ones surface first.
  const monthlyEquiv = (c: RecurringCandidate): number => {
    switch (c.cycle) {
      case "weekly":
        return c.amountCents * 4.333;
      case "biweekly":
        return c.amountCents * 2.167;
      case "monthly":
        return c.amountCents;
      case "quarterly":
        return c.amountCents / 3;
      case "annual":
        return c.amountCents / 12;
    }
  };
  candidates.sort((a, b) => monthlyEquiv(b) - monthlyEquiv(a));
  return candidates;
}
