/**
 * POST /api/proposals/[id]/convert — Convert approved proposal to invoice.
 */

import { NextResponse } from "next/server";
import { checkAdmin } from "@/lib/auth";
import { captureError } from "@/lib/errors";
import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { createAuditLog } from "@/lib/db/repositories/audit";
import { generateInvoiceNumber } from "@/lib/invoices/number";

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const userId = await checkAdmin();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;

    const [proposal] = await db
      .select()
      .from(schema.proposals)
      .where(eq(schema.proposals.id, id))
      .limit(1);

    if (!proposal) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    if (proposal.status !== "approved") {
      return NextResponse.json(
        { error: "Only approved proposals can be converted" },
        { status: 400 }
      );
    }

    if (proposal.convertedToInvoiceId) {
      return NextResponse.json(
        { error: "Already converted to invoice" },
        { status: 400 }
      );
    }

    const invoiceNumber = await generateInvoiceNumber();
    const dueDate = new Date();
    dueDate.setDate(dueDate.getDate() + 30);

    const [invoice] = await db
      .insert(schema.invoices)
      .values({
        clientId: proposal.clientId,
        number: invoiceNumber,
        status: "draft",
        amount: proposal.total ?? 0,
        lineItems: proposal.lineItems,
        subtotal: proposal.subtotal ?? 0,
        taxRate: proposal.taxRate ?? 0,
        taxAmount: proposal.taxAmount ?? 0,
        dueDate,
        notes: `From proposal ${proposal.proposalNumber}: ${proposal.title}`,
      })
      .returning();

    // Link proposal to invoice
    await db
      .update(schema.proposals)
      .set({ convertedToInvoiceId: invoice.id })
      .where(eq(schema.proposals.id, id));

    await createAuditLog({
      actorId: userId,
      actorType: "user",
      action: "convert_proposal",
      entityType: "invoice",
      entityId: invoice.id,
      metadata: {
        proposalId: id,
        proposalNumber: proposal.proposalNumber,
        invoiceNumber,
      },
    });

    return NextResponse.json({
      success: true,
      invoiceId: invoice.id,
      invoiceNumber,
    });
  } catch (error) {
    captureError(error, {
      tags: { source: "api", route: "proposals/[id]/convert" },
      level: "error",
    });
    return NextResponse.json(
      { error: "Failed to convert proposal" },
      { status: 500 }
    );
  }
}
