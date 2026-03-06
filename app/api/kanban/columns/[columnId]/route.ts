/**
 * Kanban Column Detail API — Update or delete a column.
 *
 * PATCH: Update column name, color, or position
 * DELETE: Delete column (cascades cards)
 * Auth: owner or admin only.
 */

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { createAuditLog } from "@/lib/db/repositories/audit";
import { checkAdmin } from "@/lib/auth";
import { captureError } from "@/lib/errors";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ columnId: string }> }
) {
  const userId = await checkAdmin();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { columnId } = await params;

  try {
    const body = await req.json();
    const updates: Record<string, unknown> = {};
    if (body.name !== undefined) updates.name = body.name;
    if (body.color !== undefined) updates.color = body.color;
    if (body.position !== undefined) updates.position = body.position;

    const [updated] = await db
      .update(schema.kanbanColumns)
      .set(updates)
      .where(eq(schema.kanbanColumns.id, columnId))
      .returning();

    if (!updated) {
      return NextResponse.json({ error: "Column not found" }, { status: 404 });
    }

    return NextResponse.json(updated);
  } catch (err) {
    console.error("[kanban/columns] Error:", err);
    captureError(err, { tags: { route: "PATCH /api/kanban/columns/[columnId]" } });
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ columnId: string }> }
) {
  const userId = await checkAdmin();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { columnId } = await params;

  try {
    const [deleted] = await db
      .delete(schema.kanbanColumns)
      .where(eq(schema.kanbanColumns.id, columnId))
      .returning({ id: schema.kanbanColumns.id, name: schema.kanbanColumns.name });

    if (!deleted) {
      return NextResponse.json({ error: "Column not found" }, { status: 404 });
    }

    await createAuditLog({
      actorId: userId,
      actorType: "user",
      action: "delete_kanban_column",
      entityType: "kanban_columns",
      entityId: columnId,
      metadata: { name: deleted.name },
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[kanban/columns] Error:", err);
    captureError(err, { tags: { route: "DELETE /api/kanban/columns/[columnId]" } });
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
