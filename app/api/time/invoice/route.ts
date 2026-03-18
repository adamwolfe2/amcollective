import { NextRequest, NextResponse } from "next/server";
import { checkAdmin } from "@/lib/auth";
import { captureError } from "@/lib/errors";
import { createAuditLog } from "@/lib/db/repositories/audit";
import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { eq, and, inArray, sql } from "drizzle-orm";
import { generateInvoiceNumber } from "@/lib/invoices/number";

/**
 * POST /api/time/invoice — Generate an invoice from unbilled time entries
 * Body: { clientId, entryIds: string[], hourlyRate?: number (cents, fallback), dueDate?: string }
 */
export async function POST(request: NextRequest) {
  const userId = await checkAdmin();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const body = await request.json();
    const { clientId, entryIds, hourlyRate: fallbackRate, dueDate } = body;

    if (!clientId || !entryIds?.length) {
      return NextResponse.json(
        { error: "clientId and entryIds are required" },
        { status: 400 }
      );
    }

    // Fetch the entries to validate and calculate
    const entries = await db
      .select()
      .from(schema.timeEntries)
      .where(
        and(
          eq(schema.timeEntries.clientId, clientId),
          eq(schema.timeEntries.billable, true),
          sql`${schema.timeEntries.invoiceId} IS NULL`,
          inArray(schema.timeEntries.id, entryIds)
        )
      );

    if (entries.length === 0) {
      return NextResponse.json(
        { error: "No valid unbilled entries found" },
        { status: 400 }
      );
    }

    // Build line items from time entries
    const lineItems = entries.map((entry) => {
      const hours = parseFloat(entry.hours);
      const rate = entry.hourlyRate ?? fallbackRate ?? 0;
      return {
        description: `${entry.description || "Time"} (${hours}h)`,
        quantity: 1,
        unitPrice: Math.round(hours * rate), // total for this line in cents
      };
    });

    const subtotal = lineItems.reduce((sum, li) => sum + li.unitPrice, 0);
    const invoiceNumber = await generateInvoiceNumber();

    // Create invoice + link time entries atomically
    const [invoice] = await db.transaction(async (tx) => {
      const [inv] = await tx
        .insert(schema.invoices)
        .values({
          clientId,
          number: invoiceNumber,
          status: "draft",
          amount: subtotal,
          subtotal,
          lineItems,
          dueDate: dueDate ? new Date(dueDate) : null,
          notes: `Generated from ${entries.length} time ${entries.length === 1 ? "entry" : "entries"}`,
        })
        .returning();

      await tx
        .update(schema.timeEntries)
        .set({ invoiceId: inv.id })
        .where(inArray(schema.timeEntries.id, entryIds));

      return [inv];
    });

    await createAuditLog({
      actorId: userId,
      actorType: "user",
      action: "time_entry.invoiced",
      entityType: "invoice",
      entityId: invoice.id,
      metadata: { entryCount: entries.length, totalCents: subtotal },
    });

    return NextResponse.json({ invoiceId: invoice.id, invoiceNumber, total: subtotal }, { status: 201 });
  } catch (error) {
    captureError(error, { tags: { route: "POST /api/time/invoice" } });
    return NextResponse.json({ error: "Failed to generate invoice from time entries" }, { status: 500 });
  }
}
