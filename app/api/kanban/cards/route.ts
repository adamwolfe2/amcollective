/**
 * Kanban Cards API — List cards for a client, create new card.
 *
 * GET: Returns all cards for a client with column + assignee info
 * POST: Create a new card in a column
 * Auth: owner or admin only.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { eq, asc } from "drizzle-orm";
import { createAuditLog } from "@/lib/db/repositories/audit";
import { checkAdmin } from "@/lib/auth";
import { captureError } from "@/lib/errors";
import { aj } from "@/lib/middleware/arcjet";

const kanbanCardSchema = z.object({
  columnId: z.string().uuid("Invalid column ID"),
  clientId: z.string().uuid("Invalid client ID"),
  title: z.string().min(1, "Title is required").max(500).trim(),
  description: z.string().max(5000).optional().nullable(),
  dueDate: z.string().optional().nullable(),
  assigneeId: z.string().uuid().optional().nullable(),
  priority: z.enum(["high", "urgent", "medium", "low"]).optional(),
  labels: z.unknown().optional().nullable(),
});

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
  if (aj) {
    const decision = await aj.protect(req, { requested: 1 });
    if (decision.isDenied()) {
      return NextResponse.json({ error: "Rate limited" }, { status: 429 });
    }
  }

  const userId = await checkAdmin();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    let rawBody: unknown;
    try {
      rawBody = await req.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }

    const parsed = kanbanCardSchema.safeParse(rawBody);
    if (!parsed.success) {
      const firstError = parsed.error.errors[0];
      return NextResponse.json(
        { error: "Validation failed", field: firstError?.path?.join("."), message: firstError?.message },
        { status: 400 }
      );
    }

    const { columnId, clientId, title, description, dueDate, assigneeId, priority, labels } = parsed.data;

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
        labels: (labels || null) as typeof schema.kanbanCards.$inferInsert.labels,
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
