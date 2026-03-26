import { NextRequest, NextResponse } from "next/server";
import { checkAdmin } from "@/lib/auth";
import { captureError } from "@/lib/errors";
import { createAuditLog } from "@/lib/db/repositories/audit";
import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { desc, eq, and, gte, lte } from "drizzle-orm";
import { buildCsv, csvResponse, fmtDollars, fmtDate } from "@/lib/export/csv";
import { aj } from "@/lib/middleware/arcjet";

/**
 * GET /api/export/invoices — Export invoices as CSV
 * Query params: from, to, status
 */
export async function GET(request: NextRequest) {
  if (aj) {
    const decision = await aj.protect(request, { requested: 1 });
    if (decision.isDenied()) {
      return NextResponse.json({ error: "Rate limited" }, { status: 429 });
    }
  }

  const userId = await checkAdmin();
  if (!userId) {
    return new Response("Unauthorized", { status: 401 });
  }

  try {
    const { searchParams } = request.nextUrl;
    const from = searchParams.get("from");
    const to = searchParams.get("to");
    const status = searchParams.get("status");

    const conditions = [];
    if (from) conditions.push(gte(schema.invoices.createdAt, new Date(from)));
    if (to) conditions.push(lte(schema.invoices.createdAt, new Date(to)));
    if (status) {
      conditions.push(eq(schema.invoices.status, status as typeof schema.invoices.status.enumValues[number]));
    }

    const rows = await db
      .select({
        number: schema.invoices.number,
        status: schema.invoices.status,
        amount: schema.invoices.amount,
        subtotal: schema.invoices.subtotal,
        taxAmount: schema.invoices.taxAmount,
        currency: schema.invoices.currency,
        dueDate: schema.invoices.dueDate,
        sentAt: schema.invoices.sentAt,
        paidAt: schema.invoices.paidAt,
        clientName: schema.clients.name,
        clientCompany: schema.clients.companyName,
        createdAt: schema.invoices.createdAt,
      })
      .from(schema.invoices)
      .leftJoin(schema.clients, eq(schema.invoices.clientId, schema.clients.id))
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(schema.invoices.createdAt))
      .limit(5000);

    const headers = [
      "Invoice #",
      "Client",
      "Company",
      "Status",
      "Subtotal",
      "Tax",
      "Total",
      "Currency",
      "Due Date",
      "Sent At",
      "Paid At",
      "Created At",
    ];

    const csvRows = rows.map((r) => [
      r.number,
      r.clientName,
      r.clientCompany,
      r.status,
      fmtDollars(r.subtotal),
      fmtDollars(r.taxAmount),
      fmtDollars(r.amount),
      r.currency,
      fmtDate(r.dueDate),
      fmtDate(r.sentAt),
      fmtDate(r.paidAt),
      fmtDate(r.createdAt),
    ]);

    const csv = buildCsv(headers, csvRows);
    const filename = `invoices-${new Date().toISOString().split("T")[0]}.csv`;

    await createAuditLog({
      actorId: userId,
      actorType: "user",
      action: "export.invoices",
      entityType: "export",
      entityId: "invoices",
      metadata: { format: "csv", count: rows.length, from, to, status },
    });

    return csvResponse(csv, filename);
  } catch (error) {
    captureError(error, { tags: { route: "GET /api/export/invoices" } });
    return new Response("Export failed", { status: 500 });
  }
}
