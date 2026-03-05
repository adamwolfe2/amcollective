/**
 * POST /api/sprints/[id]/tasks
 * Create a task and assign it to a sprint section in one call.
 * Used by the SprintWidget inline add-task UI.
 */

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { checkAdmin } from "@/lib/auth";
import { captureError } from "@/lib/errors";
import { createAuditLog } from "@/lib/db/repositories/audit";
import { sql } from "drizzle-orm";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, ctx: RouteContext) {
  try {
    const userId = await checkAdmin();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id: sprintId } = await ctx.params;
    const body = await request.json();
    const { title, sectionId } = body as { title: string; sectionId: string };

    if (!title?.trim()) {
      return NextResponse.json({ error: "Title is required" }, { status: 400 });
    }
    if (!sectionId) {
      return NextResponse.json({ error: "sectionId is required" }, { status: 400 });
    }

    // Create the task
    const [task] = await db
      .insert(schema.tasks)
      .values({
        title: title.trim(),
        status: "todo",
        priority: "medium",
        createdById: userId,
        companyTag: "am_collective",
        source: "manual",
      })
      .returning();

    // Get current max sort order for this section so the new task lands at the bottom
    const [maxRow] = await db
      .select({ max: sql<number>`COALESCE(MAX(sort_order), 0)` })
      .from(schema.taskSprintAssignments)
      .where(
        sql`sprint_id = ${sprintId} AND section_id = ${sectionId} AND removed_at IS NULL`
      );

    const nextOrder = (maxRow?.max ?? 0) + 1;

    // Assign to sprint + section
    await db.insert(schema.taskSprintAssignments).values({
      taskId: task.id,
      sprintId,
      sectionId,
      sortOrder: nextOrder,
    });

    await createAuditLog({
      actorId: userId,
      actorType: "user",
      action: "task.created",
      entityType: "task",
      entityId: task.id,
      metadata: { title: task.title, sprintId, sectionId, source: "sprint_widget" },
    });

    return NextResponse.json(
      { id: task.id, title: task.title, status: task.status, sectionId, sortOrder: nextOrder },
      { status: 201 }
    );
  } catch (error) {
    captureError(error);
    return NextResponse.json({ error: "Failed to create task" }, { status: 500 });
  }
}
