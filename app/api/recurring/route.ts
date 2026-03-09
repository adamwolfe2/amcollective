/**
 * GET  /api/recurring — List all recurring invoice templates.
 * POST /api/recurring — Create a new recurring template.
 */

import { NextResponse } from "next/server";
import { checkAdmin } from "@/lib/auth";
import { captureError } from "@/lib/errors";
import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { eq, desc } from "drizzle-orm";
import { createAuditLog } from "@/lib/db/repositories/audit";

export async function GET() {
  try {
    const userId = await checkAdmin();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const templates = await db
      .select({
        template: schema.recurringInvoices,
        clientName: schema.clients.name,
        clientCompany: schema.clients.companyName,
      })
      .from(schema.recurringInvoices)
      .leftJoin(
        schema.clients,
        eq(schema.recurringInvoices.clientId, schema.clients.id)
      )
      .orderBy(desc(schema.recurringInvoices.createdAt))
      .limit(500);

    return NextResponse.json(templates);
  } catch (error) {
    captureError(error, {
      tags: { source: "api", route: "recurring" },
      level: "error",
    });
    return NextResponse.json(
      { error: "Failed to fetch recurring invoices" },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  try {
    const userId = await checkAdmin();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();

    const [template] = await db
      .insert(schema.recurringInvoices)
      .values({
        clientId: body.clientId,
        companyTag: body.companyTag ?? "am_collective",
        lineItems: body.lineItems,
        subtotal: body.subtotal,
        taxRate: body.taxRate ?? 0,
        taxAmount: body.taxAmount ?? 0,
        total: body.total,
        paymentTerms: body.paymentTerms ?? "Net 30",
        notes: body.notes,
        interval: body.interval,
        startDate: body.startDate,
        endDate: body.endDate ?? null,
        nextBillingDate: body.startDate,
        autoSend: body.autoSend ?? true,
      })
      .returning();

    await createAuditLog({
      actorId: userId,
      actorType: "user",
      action: "create",
      entityType: "recurring_invoice",
      entityId: template.id,
      metadata: {
        clientId: body.clientId,
        interval: body.interval,
        total: body.total,
      },
    });

    return NextResponse.json(template, { status: 201 });
  } catch (error) {
    captureError(error, {
      tags: { source: "api", route: "recurring" },
      level: "error",
    });
    return NextResponse.json(
      { error: "Failed to create recurring invoice" },
      { status: 500 }
    );
  }
}
