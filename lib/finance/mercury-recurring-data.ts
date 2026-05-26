/**
 * Mercury recurring-candidate data fetcher.
 * Loads debit transactions from the DB and feeds them to the pure detector.
 */

import "server-only";

import { and, eq, gte, isNotNull } from "drizzle-orm";

import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import type { CompanyTag } from "@/lib/db/schema/costs";
import {
  detectRecurring,
  type MercuryTxn,
  type RecurringCandidate,
} from "./mercury-recurring";

export interface FetchRecurringOptions {
  lookbackDays?: number;
}

export interface FetchRecurringResult {
  candidates: RecurringCandidate[];
  /** Subscription_costs already on file — used to mark candidates as "already added". */
  existingCostKeys: Set<string>;
  rawTxnCount: number;
}

function normalize(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

/**
 * Composite key: normalized vendor + nearest $10. Lets us answer "is this
 * candidate already in subscription_costs?" without exact-string matching.
 */
function dedupeKey(name: string, amountCents: number): string {
  const bucketed = Math.round(amountCents / 1000) * 1000;
  return `${normalize(name)}::${bucketed}`;
}

export async function fetchRecurringCandidates(
  opts: FetchRecurringOptions = {}
): Promise<FetchRecurringResult> {
  const lookbackDays = opts.lookbackDays ?? 180;
  const cutoff = new Date(Date.now() - lookbackDays * 24 * 60 * 60 * 1000);

  const [txnRows, existingCosts] = await Promise.all([
    db
      .select({
        id: schema.mercuryTransactions.id,
        amount: schema.mercuryTransactions.amount,
        direction: schema.mercuryTransactions.direction,
        counterpartyName: schema.mercuryTransactions.counterpartyName,
        description: schema.mercuryTransactions.description,
        companyTag: schema.mercuryTransactions.companyTag,
        postedAt: schema.mercuryTransactions.postedAt,
      })
      .from(schema.mercuryTransactions)
      .where(
        and(
          eq(schema.mercuryTransactions.direction, "debit"),
          isNotNull(schema.mercuryTransactions.postedAt),
          gte(schema.mercuryTransactions.postedAt, cutoff)
        )
      ),
    db
      .select({
        name: schema.subscriptionCosts.name,
        vendor: schema.subscriptionCosts.vendor,
        amount: schema.subscriptionCosts.amount,
      })
      .from(schema.subscriptionCosts)
      .where(eq(schema.subscriptionCosts.isActive, true)),
  ]);

  const txns: MercuryTxn[] = txnRows
    .filter((r) => r.postedAt)
    .map((r) => ({
      id: r.id,
      // Mercury amounts are numeric strings from drizzle — convert to absolute cents.
      amountCents: Math.round(Math.abs(Number(r.amount)) * 100),
      direction: r.direction as "debit" | "credit",
      counterpartyName: r.counterpartyName,
      description: r.description,
      companyTag: r.companyTag as CompanyTag,
      postedAt: r.postedAt as Date,
    }));

  const candidates = detectRecurring(txns, { lookbackDays });

  const existingCostKeys = new Set<string>();
  for (const c of existingCosts) {
    existingCostKeys.add(dedupeKey(c.name, c.amount));
    existingCostKeys.add(dedupeKey(c.vendor, c.amount));
  }

  return { candidates, existingCostKeys, rawTxnCount: txns.length };
}

export function isCandidateAlreadyTracked(
  candidate: RecurringCandidate,
  existingCostKeys: Set<string>
): boolean {
  return existingCostKeys.has(dedupeKey(candidate.counterparty, candidate.amountCents));
}
