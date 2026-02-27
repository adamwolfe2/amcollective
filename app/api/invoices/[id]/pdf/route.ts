/**
 * Invoice PDF Download API
 *
 * GET /api/invoices/[id]/pdf
 * Returns a downloadable PDF for the given invoice.
 * Admin-only (or client with matching clientId).
 */

import { NextResponse } from "next/server";
import { renderToBuffer } from "@react-pdf/renderer";
import { checkAdmin, getAuthUserId } from "@/lib/auth";
import { getInvoice } from "@/lib/db/repositories/invoices";
import { getClientByClerkId } from "@/lib/db/repositories/clients";
import { InvoicePDF } from "@/lib/pdf/invoice-pdf";
import { format } from "date-fns";
import { captureError } from "@/lib/errors";
import React from "react";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    // Check admin first, then check if authenticated client owns this invoice
    const adminId = await checkAdmin();
    let authorized = !!adminId;

    if (!authorized) {
      const userId = await getAuthUserId();
      if (userId) {
        const client = await getClientByClerkId(userId);
        if (client) {
          const data = await getInvoice(id);
          if (data && data.invoice.clientId === client.id) {
            authorized = true;
          }
        }
      }
    }

    if (!authorized) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const data = await getInvoice(id);
    if (!data) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const { invoice, clientName, clientEmail } = data;

    const lineItems = (
      invoice.lineItems as
        | { description: string; quantity: number; unitPrice: number }[]
        | null
    ) ?? [];

    const subtotal = lineItems.reduce(
      (s, li) => s + li.quantity * li.unitPrice,
      0
    );

    const pdfElement = React.createElement(InvoicePDF, {
      invoiceNumber: invoice.number ?? `INV-${invoice.id.slice(0, 8)}`,
      status: invoice.status,
      issuedAt: invoice.createdAt.toISOString(),
      dueAt: invoice.dueDate
        ? format(invoice.dueDate, "yyyy-MM-dd")
        : null,
      paidAt: invoice.paidAt ? invoice.paidAt.toISOString() : null,
      clientName: clientName ?? "Client",
      clientEmail: clientEmail ?? null,
      items: lineItems.map((li) => ({
        description: li.description,
        quantity: li.quantity,
        unitPrice: li.unitPrice,
        total: li.quantity * li.unitPrice,
      })),
      subtotal,
      tax: invoice.taxAmount ?? 0,
      taxRate: invoice.taxRate ?? 0,
      total: invoice.amount,
      notes: invoice.notes,
      paymentLinkUrl: invoice.stripePaymentLinkUrl,
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const buffer = await renderToBuffer(pdfElement as any);
    const filename = `${invoice.number ?? `INV-${invoice.id.slice(0, 8)}`}.pdf`;

    return new Response(new Uint8Array(buffer), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "private, max-age=60",
      },
    });
  } catch (err) {
    captureError(err, { tags: { route: "invoices/[id]/pdf" } });
    return NextResponse.json(
      { error: "Failed to generate PDF" },
      { status: 500 }
    );
  }
}
