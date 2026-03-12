/**
 * Number generation -- INV-YYYY-NNN, PROP-YYYY-NNN, CTR-YYYY-NNN formats.
 *
 * Uses advisory locks to prevent race conditions on concurrent requests.
 * Each entity type gets its own lock ID to avoid contention between types.
 */

import { db } from "@/lib/db";
import { invoices, proposals, contracts } from "@/lib/db/schema";
import { sql } from "drizzle-orm";

// Advisory lock IDs — arbitrary but unique per entity type
const LOCK_INVOICE = 100001;
const LOCK_PROPOSAL = 100002;
const LOCK_CONTRACT = 100003;

async function generateNumber(
  prefix: string,
  table: typeof invoices | typeof proposals | typeof contracts,
  lockId: number
): Promise<string> {
  const year = new Date().getFullYear();

  // Use pg_advisory_xact_lock to serialize number generation per type.
  // The lock is released automatically when the transaction commits.
  const [row] = await db.execute(sql`
    SELECT (
      SELECT count(*)::int FROM ${table}
      WHERE EXTRACT(YEAR FROM created_at) = ${year}
    ) AS current_count
    FROM pg_advisory_xact_lock(${lockId})
  `) as unknown as [{ current_count: number }];

  const sequence = ((row?.current_count ?? 0) + 1)
    .toString()
    .padStart(3, "0");

  return `${prefix}-${year}-${sequence}`;
}

export function generateInvoiceNumber(): Promise<string> {
  return generateNumber("INV", invoices, LOCK_INVOICE);
}

export function generateProposalNumber(): Promise<string> {
  return generateNumber("PROP", proposals, LOCK_PROPOSAL);
}

export function generateContractNumber(): Promise<string> {
  return generateNumber("CTR", contracts, LOCK_CONTRACT);
}
