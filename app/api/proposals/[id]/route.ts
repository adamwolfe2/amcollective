/**
 * GET    /api/proposals/[id] — Proposal detail.
 * PATCH  /api/proposals/[id] — Update proposal.
 * DELETE /api/proposals/[id] — Delete (draft only).
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

    const [updated] = await db
      .update(schema.proposals)
      .set({
        ...(body.title !== undefined && { title: body.title }),
        ...(body.summary !== undefined && { summary: body.summary }),
        ...(body.scope !== undefined && { scope: body.scope }),
        ...(body.deliverables !== undefined && {
          deliverables: body.deliverables,
        }),
        ...(body.timeline !== undefined && { timeline: body.timeline }),
        ...(body.lineItems !== undefined && { lineItems: body.lineItems }),
        ...(body.subtotal !== undefined && { subtotal: body.subtotal }),
        ...(body.taxRate !== undefined && { taxRate: body.taxRate }),
        ...(body.taxAmount !== undefined && { taxAmount: body.taxAmount }),
        ...(body.total !== undefined && { total: body.total }),
        ...(body.paymentTerms !== undefined && {
          paymentTerms: body.paymentTerms,
        }),
        ...(body.validUntil !== undefined && { validUntil: body.validUntil }),
        ...(body.internalNotes !== undefined && {
          internalNotes: body.internalNotes,
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
      metadata: { fields: Object.keys(body) },
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
