/**
 * Invoice Preview API — Returns rendered HTML for email preview.
 *
 * GET /api/invoices/[id]/preview
 */

import { NextResponse } from "next/server";
import { checkAdmin } from "@/lib/auth";
import { getInvoice } from "@/lib/db/repositories/invoices";
import { buildInvoiceEmail } from "@/lib/invoices/email";
import { format } from "date-fns";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const userId = await checkAdmin();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { id } = await params;
    const data = await getInvoice(id);
    if (!data) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const { invoice, clientName } = data;
    const lineItems =
      (invoice.lineItems as
        | { description: string; quantity: number; unitPrice: number }[]
        | null) ?? [];
    const subtotal = lineItems.reduce(
      (s, li) => s + li.quantity * li.unitPrice,
      0
    );

    const html = buildInvoiceEmail({
      invoiceNumber: invoice.number ?? `INV-${invoice.id.slice(0, 8)}`,
      issueDate: format(invoice.createdAt, "MMMM d, yyyy"),
      dueDate: invoice.dueDate
        ? format(invoice.dueDate, "MMMM d, yyyy")
        : "Upon receipt",
      clientName: clientName ?? "Client",
      lineItems,
      subtotal,
      taxRate: invoice.taxRate ?? 0,
      taxAmount: invoice.taxAmount ?? 0,
      total: invoice.amount,
      notes: invoice.notes,
      paymentLinkUrl: invoice.stripePaymentLinkUrl,
    });

    return new NextResponse(html, {
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  } catch (error) {
    console.error("[invoice-preview]", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
