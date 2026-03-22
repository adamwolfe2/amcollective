/**
 * Kanban Reorder API — Batch update card/column positions after drag-and-drop.
 *
 * POST: Reorder cards or columns
 * Body: { type: "cards" | "columns", items: [{ id, position, columnId? }] }
 * Auth: owner or admin only.
 */

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { checkAdmin } from "@/lib/auth";
import { captureError } from "@/lib/errors";

interface ReorderItem {
  id: string;
  position: number;
  columnId?: string;
}

export async function POST(req: NextRequest) {
  const userId = await checkAdmin();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const { type, items } = body as { type: string; items: ReorderItem[] };

    if (!type || !items?.length) {
      return NextResponse.json(
        { error: "type and items are required" },
        { status: 400 }
      );
    }

    if (type === "cards") {
      await db.transaction(async (tx) => {
        for (const item of items) {
          const updates: Record<string, unknown> = { position: item.position };
          if (item.columnId) updates.columnId = item.columnId;

          await tx
            .update(schema.kanbanCards)
            .set(updates)
            .where(eq(schema.kanbanCards.id, item.id));
        }
      });
    } else if (type === "columns") {
      await db.transaction(async (tx) => {
        for (const item of items) {
          await tx
            .update(schema.kanbanColumns)
            .set({ position: item.position })
            .where(eq(schema.kanbanColumns.id, item.id));
        }
      });
    } else {
      return NextResponse.json(
        { error: "type must be 'cards' or 'columns'" },
        { status: 400 }
      );
    }

    return NextResponse.json({ success: true, updated: items.length });
  } catch (err) {
    captureError(err, { tags: { route: "POST /api/kanban/reorder" } });
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
