/**
 * GET    /api/recurring/[id] — Get recurring template detail.
 * PATCH  /api/recurring/[id] — Update template.
 * DELETE /api/recurring/[id] — Cancel (set status to cancelled).
 */

import { NextResponse } from "next/server";
import { checkAdmin } from "@/lib/auth";
import { captureError } from "@/lib/errors";
import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { createAuditLog } from "@/lib/db/repositories/audit";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const userId = await checkAdmin();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;

    const [result] = await db
      .select({
        template: schema.recurringInvoices,
        clientName: schema.clients.name,
        clientEmail: schema.clients.email,
      })
      .from(schema.recurringInvoices)
      .leftJoin(
        schema.clients,
        eq(schema.recurringInvoices.clientId, schema.clients.id)
      )
      .where(eq(schema.recurringInvoices.id, id))
      .limit(1);

    if (!result) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    return NextResponse.json(result);
  } catch (error) {
    captureError(error, {
      tags: { source: "api", route: "recurring/[id]" },
      level: "error",
    });
    return NextResponse.json(
      { error: "Failed to fetch recurring invoice" },
      { status: 500 }
    );
  }
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const userId = await checkAdmin();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const body = await req.json();

    const [updated] = await db
      .update(schema.recurringInvoices)
      .set({
        ...(body.lineItems !== undefined && { lineItems: body.lineItems }),
        ...(body.subtotal !== undefined && { subtotal: body.subtotal }),
        ...(body.taxRate !== undefined && { taxRate: body.taxRate }),
        ...(body.taxAmount !== undefined && { taxAmount: body.taxAmount }),
        ...(body.total !== undefined && { total: body.total }),
        ...(body.paymentTerms !== undefined && {
          paymentTerms: body.paymentTerms,
        }),
        ...(body.notes !== undefined && { notes: body.notes }),
        ...(body.interval !== undefined && { interval: body.interval }),
        ...(body.endDate !== undefined && { endDate: body.endDate }),
        ...(body.nextBillingDate !== undefined && {
          nextBillingDate: body.nextBillingDate,
        }),
        ...(body.autoSend !== undefined && { autoSend: body.autoSend }),
        ...(body.status !== undefined && { status: body.status }),
      })
      .where(eq(schema.recurringInvoices.id, id))
      .returning();

    if (!updated) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    await createAuditLog({
      actorId: userId,
      actorType: "user",
      action: "update",
      entityType: "recurring_invoice",
      entityId: id,
      metadata: { fields: Object.keys(body) },
    });

    return NextResponse.json(updated);
  } catch (error) {
    captureError(error, {
      tags: { source: "api", route: "recurring/[id]" },
      level: "error",
    });
    return NextResponse.json(
      { error: "Failed to update recurring invoice" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const userId = await checkAdmin();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;

    const [cancelled] = await db
      .update(schema.recurringInvoices)
      .set({ status: "cancelled" })
      .where(eq(schema.recurringInvoices.id, id))
      .returning();

    if (!cancelled) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    await createAuditLog({
      actorId: userId,
      actorType: "user",
      action: "cancel",
      entityType: "recurring_invoice",
      entityId: id,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    captureError(error, {
      tags: { source: "api", route: "recurring/[id]" },
      level: "error",
    });
    return NextResponse.json(
      { error: "Failed to cancel recurring invoice" },
      { status: 500 }
    );
  }
}
