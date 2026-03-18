/**
 * GET    /api/recurring/[id] — Get recurring template detail.
 * PATCH  /api/recurring/[id] — Update template.
 * DELETE /api/recurring/[id] — Cancel (set status to cancelled).
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { checkAdmin } from "@/lib/auth";
import { captureError } from "@/lib/errors";
import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { createAuditLog } from "@/lib/db/repositories/audit";

const lineItemSchema = z.object({
  description: z.string().min(1).max(500),
  quantity: z.number().min(0),
  unitPrice: z.number().int().min(0),
  amount: z.number().int().min(0),
});

const recurringUpdateSchema = z.object({
  lineItems: z.array(lineItemSchema).min(1),
  subtotal: z.number().int().min(0),
  taxRate: z.number().int().min(0).max(10000),
  taxAmount: z.number().int().min(0),
  total: z.number().int().min(0),
  paymentTerms: z.string().max(200),
  notes: z.string().max(10000).nullable(),
  interval: z.enum(["weekly", "biweekly", "monthly", "quarterly", "annual"]),
  endDate: z.string().nullable(),
  nextBillingDate: z.string(),
  autoSend: z.boolean(),
  status: z.enum(["active", "paused", "cancelled"]),
}).partial().refine(data => Object.keys(data).length > 0, "At least one field required");

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

    const parsed = recurringUpdateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const data = parsed.data;

    const [updated] = await db
      .update(schema.recurringInvoices)
      .set({
        ...(data.lineItems !== undefined && { lineItems: data.lineItems }),
        ...(data.subtotal !== undefined && { subtotal: data.subtotal }),
        ...(data.taxRate !== undefined && { taxRate: data.taxRate }),
        ...(data.taxAmount !== undefined && { taxAmount: data.taxAmount }),
        ...(data.total !== undefined && { total: data.total }),
        ...(data.paymentTerms !== undefined && {
          paymentTerms: data.paymentTerms,
        }),
        ...(data.notes !== undefined && { notes: data.notes }),
        ...(data.interval !== undefined && { interval: data.interval }),
        ...(data.endDate !== undefined && { endDate: data.endDate }),
        ...(data.nextBillingDate !== undefined && {
          nextBillingDate: data.nextBillingDate,
        }),
        ...(data.autoSend !== undefined && { autoSend: data.autoSend }),
        ...(data.status !== undefined && { status: data.status }),
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
      metadata: { fields: Object.keys(data) },
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
