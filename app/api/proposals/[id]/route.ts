/**
 * GET    /api/proposals/[id] — Proposal detail.
 * PATCH  /api/proposals/[id] — Update proposal.
 * DELETE /api/proposals/[id] — Delete (draft only).
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
});

const proposalUpdateSchema = z.object({
  title: z.string().min(1).max(500).trim(),
  summary: z.string().max(50000).nullable(),
  scope: z.array(z.object({ title: z.string().max(500), content: z.string().max(50000) })).nullable(),
  deliverables: z.array(z.string().max(1000)).nullable(),
  timeline: z.string().max(10000).nullable(),
  lineItems: z.array(lineItemSchema).nullable(),
  subtotal: z.number().int().min(0),
  taxRate: z.number().int().min(0).max(10000),
  taxAmount: z.number().int().min(0),
  total: z.number().int().min(0),
  paymentTerms: z.string().max(500).nullable(),
  validUntil: z.string().nullable(),
  internalNotes: z.string().max(10000).nullable(),
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
        proposal: schema.proposals,
        clientName: schema.clients.name,
        clientEmail: schema.clients.email,
        clientCompany: schema.clients.companyName,
      })
      .from(schema.proposals)
      .leftJoin(
        schema.clients,
        eq(schema.proposals.clientId, schema.clients.id)
      )
      .where(eq(schema.proposals.id, id))
      .limit(1);

    if (!result) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    return NextResponse.json(result);
  } catch (error) {
    captureError(error, {
      tags: { source: "api", route: "proposals/[id]" },
      level: "error",
    });
    return NextResponse.json(
      { error: "Failed to fetch proposal" },
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

    const parsed = proposalUpdateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const data = parsed.data;

    const [updated] = await db
      .update(schema.proposals)
      .set({
        ...(data.title !== undefined && { title: data.title }),
        ...(data.summary !== undefined && { summary: data.summary }),
        ...(data.scope !== undefined && { scope: data.scope }),
        ...(data.deliverables !== undefined && {
          deliverables: data.deliverables,
        }),
        ...(data.timeline !== undefined && { timeline: data.timeline }),
        ...(data.lineItems !== undefined && { lineItems: data.lineItems }),
        ...(data.subtotal !== undefined && { subtotal: data.subtotal }),
        ...(data.taxRate !== undefined && { taxRate: data.taxRate }),
        ...(data.taxAmount !== undefined && { taxAmount: data.taxAmount }),
        ...(data.total !== undefined && { total: data.total }),
        ...(data.paymentTerms !== undefined && {
          paymentTerms: data.paymentTerms,
        }),
        ...(data.validUntil !== undefined && { validUntil: data.validUntil }),
        ...(data.internalNotes !== undefined && {
          internalNotes: data.internalNotes,
        }),
      })
      .where(eq(schema.proposals.id, id))
      .returning();

    if (!updated) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    await createAuditLog({
      actorId: userId,
      actorType: "user",
      action: "update",
      entityType: "proposal",
      entityId: id,
      metadata: { fields: Object.keys(data) },
    });

    return NextResponse.json(updated);
  } catch (error) {
    captureError(error, {
      tags: { source: "api", route: "proposals/[id]" },
      level: "error",
    });
    return NextResponse.json(
      { error: "Failed to update proposal" },
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

    // Only allow deleting draft proposals
    const [proposal] = await db
      .select()
      .from(schema.proposals)
      .where(eq(schema.proposals.id, id))
      .limit(1);

    if (!proposal) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    if (proposal.status !== "draft") {
      return NextResponse.json(
        { error: "Only draft proposals can be deleted" },
        { status: 400 }
      );
    }

    await db
      .delete(schema.proposals)
      .where(eq(schema.proposals.id, id));

    await createAuditLog({
      actorId: userId,
      actorType: "user",
      action: "delete",
      entityType: "proposal",
      entityId: id,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    captureError(error, {
      tags: { source: "api", route: "proposals/[id]" },
      level: "error",
    });
    return NextResponse.json(
      { error: "Failed to delete proposal" },
      { status: 500 }
    );
  }
}
