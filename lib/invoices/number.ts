/**
 * Number generation — INV-YYYY-NNN and PROP-YYYY-NNN formats.
 */

import { db } from "@/lib/db";
import { invoices, proposals } from "@/lib/db/schema";
import { sql } from "drizzle-orm";

export async function generateInvoiceNumber(): Promise<string> {
  const year = new Date().getFullYear();

  const [result] = await db
    .select({ count: sql<number>`count(*)` })
    .from(invoices)
    .where(sql`EXTRACT(YEAR FROM ${invoices.createdAt}) = ${year}`);

  const sequence = (Number(result?.count ?? 0) + 1)
    .toString()
    .padStart(3, "0");

  return `INV-${year}-${sequence}`;
}

export async function generateProposalNumber(): Promise<string> {
  const year = new Date().getFullYear();

  const [result] = await db
    .select({ count: sql<number>`count(*)` })
    .from(proposals)
    .where(sql`EXTRACT(YEAR FROM ${proposals.createdAt}) = ${year}`);

  const sequence = (Number(result?.count ?? 0) + 1)
    .toString()
    .padStart(3, "0");

  return `PROP-${year}-${sequence}`;
}
