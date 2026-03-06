/**
 * Kanban Cards API — List cards for a client, create new card.
 *
 * GET: Returns all cards for a client with column + assignee info
 * POST: Create a new card in a column
 * Auth: owner or admin only.
 */

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { eq, asc } from "drizzle-orm";
import { createAuditLog } from "@/lib/db/repositories/audit";
import { checkAdmin } from "@/lib/auth";
import { captureError } from "@/lib/errors";

export async function GET(req: NextRequest) {
  const userId = await checkAdmin();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const clientId = req.nextUrl.searchParams.get("clientId");
  if (!clientId) {
    return NextResponse.json(
      { error: "clientId is required" },
      { status: 400 }
    );
  }

  const cards = await db
    .select({
      id: schema.kanbanCards.id,
      columnId: schema.kanbanCards.columnId,
      clientId: schema.kanbanCards.clientId,
      title: schema.kanbanCards.title,
      description: schema.kanbanCards.description,
      dueDate: schema.kanbanCards.dueDate,
      assigneeId: schema.kanbanCards.assigneeId,
      priority: schema.kanbanCards.priority,
      position: schema.kanbanCards.position,
      labels: schema.kanbanCards.labels,
      completedAt: schema.kanbanCards.completedAt,
      createdAt: schema.kanbanCards.createdAt,
      updatedAt: schema.kanbanCards.updatedAt,
      assigneeName: schema.teamMembers.name,
    })
    .from(schema.kanbanCards)
    .leftJoin(
      schema.teamMembers,
      eq(schema.kanbanCards.assigneeId, schema.teamMembers.id)
    )
    .where(eq(schema.kanbanCards.clientId, clientId))
    .orderBy(asc(schema.kanbanCards.position));

  return NextResponse.json(cards);
}

export async function POST(req: NextRequest) {
  const userId = await checkAdmin();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const { columnId, clientId, title, description, dueDate, assigneeId, priority, labels } = body;

    if (!columnId || !clientId || !title) {
      return NextResponse.json(
        { error: "columnId, clientId, and title are required" },
        { status: 400 }
      );
    }

    // Get max position in target column
    const existing = await db
      .select({ position: schema.kanbanCards.position })
      .from(schema.kanbanCards)
      .where(eq(schema.kanbanCards.columnId, columnId))
      .orderBy(asc(schema.kanbanCards.position));

    const maxPos = existing.length > 0 ? existing[existing.length - 1].position : -1;

    const [card] = await db
      .insert(schema.kanbanCards)
      .values({
        columnId,
        clientId,
        title,
        description: description || null,
        dueDate: dueDate ? new Date(dueDate) : null,
        assigneeId: assigneeId || null,
        priority: priority || "medium",
        position: maxPos + 1,
        labels: labels || null,
      })
      .returning();

    await createAuditLog({
      actorId: userId,
      actorType: "user",
      action: "create_kanban_card",
      entityType: "kanban_cards",
      entityId: card.id,
      metadata: { clientId, title, columnId },
    });

    return NextResponse.json(card, { status: 201 });
  } catch (err) {
    console.error("[kanban/cards] Error:", err);
    captureError(err, { tags: { route: "POST /api/kanban/cards" } });
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
