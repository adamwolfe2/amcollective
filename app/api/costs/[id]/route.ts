/**
 * Subscription Cost [id] API — PATCH and DELETE for individual costs.
 *
 * PATCH /api/costs/[id] — Update a subscription cost
 * DELETE /api/costs/[id] — Soft-delete (set isActive = false)
 * Auth: owner or admin only.
 */

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { checkAdmin } from "@/lib/auth";
import { captureError } from "@/lib/errors";
import { createAuditLog } from "@/lib/db/repositories/audit";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const userId = await checkAdmin();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  try {
    const body = await req.json();
    const updates: Record<string, unknown> = {};

    if (body.name !== undefined) updates.name = body.name;
    if (body.vendor !== undefined) updates.vendor = body.vendor;
    if (body.companyTag !== undefined) updates.companyTag = body.companyTag;
    if (body.amount !== undefined) updates.amount = Math.round(Number(body.amount));
    if (body.billingCycle !== undefined) updates.billingCycle = body.billingCycle;
    if (body.nextRenewal !== undefined) updates.nextRenewal = body.nextRenewal ? new Date(body.nextRenewal) : null;
    if (body.category !== undefined) updates.category = body.category;
    if (body.notes !== undefined) updates.notes = body.notes;
    if (body.isActive !== undefined) updates.isActive = body.isActive;

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: "No fields to update" }, { status: 400 });
    }

    const [cost] = await db
      .update(schema.subscriptionCosts)
      .set(updates)
      .where(eq(schema.subscriptionCosts.id, id))
      .returning();

    if (!cost) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    await createAuditLog({
      actorId: userId,
      actorType: "user",
      action: "update_subscription_cost",
      entityType: "subscription_cost",
      entityId: id,
      metadata: updates,
    });

    return NextResponse.json({ cost });
  } catch (err) {
    captureError(err, { tags: { route: `PATCH /api/costs/${id}` } });
    return NextResponse.json(
      { error: "Failed to update cost" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const userId = await checkAdmin();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  try {
    const [cost] = await db
      .update(schema.subscriptionCosts)
      .set({ isActive: false })
      .where(eq(schema.subscriptionCosts.id, id))
      .returning();

    if (!cost) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    await createAuditLog({
      actorId: userId,
      actorType: "user",
      action: "deactivate_subscription_cost",
      entityType: "subscription_cost",
      entityId: id,
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    captureError(err, { tags: { route: `DELETE /api/costs/${id}` } });
    return NextResponse.json(
      { error: "Failed to delete cost" },
      { status: 500 }
    );
  }
}
