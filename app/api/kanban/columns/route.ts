/**
 * Kanban Columns API — List columns for a client, create new column.
 *
 * GET: Returns all columns for a client (query: clientId)
 * POST: Create a new column
 * Auth: owner or admin only.
 */

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { eq, asc } from "drizzle-orm";
import { createAuditLog } from "@/lib/db/repositories/audit";
import { checkAdmin } from "@/lib/auth";
import { captureError } from "@/lib/errors";
import { aj } from "@/lib/middleware/arcjet";

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

  const columns = await db
    .select()
    .from(schema.kanbanColumns)
    .where(eq(schema.kanbanColumns.clientId, clientId))
    .orderBy(asc(schema.kanbanColumns.position));

  return NextResponse.json(columns);
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
    const body = await req.json();
    const { clientId, name, color } = body;

    if (!clientId || !name) {
      return NextResponse.json(
        { error: "clientId and name are required" },
        { status: 400 }
      );
    }

    // Get max position
    const existing = await db
      .select({ position: schema.kanbanColumns.position })
      .from(schema.kanbanColumns)
      .where(eq(schema.kanbanColumns.clientId, clientId))
      .orderBy(asc(schema.kanbanColumns.position));

    const maxPos = existing.length > 0 ? existing[existing.length - 1].position : -1;

    const [column] = await db
      .insert(schema.kanbanColumns)
      .values({
        clientId,
        name,
        position: maxPos + 1,
        color: color || null,
        isDefault: false,
      })
      .returning();

    await createAuditLog({
      actorId: userId,
      actorType: "user",
      action: "create_kanban_column",
      entityType: "kanban_columns",
      entityId: column.id,
      metadata: { clientId, name },
    });

    return NextResponse.json(column, { status: 201 });
  } catch (err) {
    captureError(err, { tags: { route: "POST /api/kanban/columns" } });
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
