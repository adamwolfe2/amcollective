/**
 * Invoice number generation — INV-YYYY-NNN format.
 */

import { db } from "@/lib/db";
import { invoices } from "@/lib/db/schema";
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
