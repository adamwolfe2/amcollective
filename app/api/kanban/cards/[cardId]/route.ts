/**
 * Kanban Card Detail API — Get, update, or delete a card.
 *
 * GET: Returns card with comments
 * PATCH: Update card fields (title, description, column, priority, etc.)
 * DELETE: Delete card
 * Auth: owner or admin only.
 */

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { eq, asc } from "drizzle-orm";
import { createAuditLog } from "@/lib/db/repositories/audit";
import { checkAdmin } from "@/lib/auth";
import { captureError } from "@/lib/errors";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ cardId: string }> }
) {
  const userId = await checkAdmin();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { cardId } = await params;

  const [card] = await db
    .select()
    .from(schema.kanbanCards)
    .where(eq(schema.kanbanCards.id, cardId))
    .limit(1);

  if (!card) {
    return NextResponse.json({ error: "Card not found" }, { status: 404 });
  }

  const comments = await db
    .select()
    .from(schema.kanbanComments)
    .where(eq(schema.kanbanComments.cardId, cardId))
    .orderBy(asc(schema.kanbanComments.createdAt));

  return NextResponse.json({ ...card, comments });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ cardId: string }> }
) {
  const userId = await checkAdmin();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { cardId } = await params;

  try {
    const body = await req.json();
    const updates: Record<string, unknown> = {};

    if (body.title !== undefined) updates.title = body.title;
    if (body.description !== undefined) updates.description = body.description;
    if (body.columnId !== undefined) updates.columnId = body.columnId;
    if (body.priority !== undefined) updates.priority = body.priority;
    if (body.position !== undefined) updates.position = body.position;
    if (body.labels !== undefined) updates.labels = body.labels;
    if (body.assigneeId !== undefined) updates.assigneeId = body.assigneeId || null;
    if (body.dueDate !== undefined)
      updates.dueDate = body.dueDate ? new Date(body.dueDate) : null;
    if (body.completedAt !== undefined)
      updates.completedAt = body.completedAt ? new Date(body.completedAt) : null;

    const [updated] = await db
      .update(schema.kanbanCards)
      .set(updates)
      .where(eq(schema.kanbanCards.id, cardId))
      .returning();

    if (!updated) {
      return NextResponse.json({ error: "Card not found" }, { status: 404 });
    }

    await createAuditLog({
      actorId: userId,
      actorType: "user",
      action: "update_kanban_card",
      entityType: "kanban_cards",
      entityId: cardId,
      metadata: { fields: Object.keys(updates) },
    });

    return NextResponse.json(updated);
  } catch (err) {
    captureError(err, { tags: { route: "PATCH /api/kanban/cards/[cardId]" } });
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ cardId: string }> }
) {
  const userId = await checkAdmin();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { cardId } = await params;

  try {
    const [deleted] = await db
      .delete(schema.kanbanCards)
      .where(eq(schema.kanbanCards.id, cardId))
      .returning({ id: schema.kanbanCards.id, title: schema.kanbanCards.title });

    if (!deleted) {
      return NextResponse.json({ error: "Card not found" }, { status: 404 });
    }

    await createAuditLog({
      actorId: userId,
      actorType: "user",
      action: "delete_kanban_card",
      entityType: "kanban_cards",
      entityId: cardId,
      metadata: { title: deleted.title },
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    captureError(err, { tags: { component: "kanban/cards" } });
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
