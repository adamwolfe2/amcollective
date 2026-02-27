/**
 * GET    /api/tasks/[id]  -- task detail with comments
 * PATCH  /api/tasks/[id]  -- update task
 * DELETE /api/tasks/[id]  -- archive task
 */

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { eq, asc } from "drizzle-orm";
import { checkAdmin } from "@/lib/auth";
import { captureError } from "@/lib/errors";
import { createAuditLog } from "@/lib/db/repositories/audit";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: NextRequest, ctx: RouteContext) {
  try {
    const userId = await checkAdmin();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await ctx.params;

    const [row] = await db
      .select({
        task: schema.tasks,
        assigneeName: schema.teamMembers.name,
        projectName: schema.portfolioProjects.name,
      })
      .from(schema.tasks)
      .leftJoin(
        schema.teamMembers,
        eq(schema.tasks.assigneeId, schema.teamMembers.id)
      )
      .leftJoin(
        schema.portfolioProjects,
        eq(schema.tasks.projectId, schema.portfolioProjects.id)
      )
      .where(eq(schema.tasks.id, id))
      .limit(1);

    if (!row) {
      return NextResponse.json({ error: "Task not found" }, { status: 404 });
    }

    const comments = await db
      .select()
      .from(schema.taskComments)
      .where(eq(schema.taskComments.taskId, id))
      .orderBy(asc(schema.taskComments.createdAt))
      .limit(100);

    return NextResponse.json({ ...row, comments });
  } catch (error) {
    captureError(error);
    return NextResponse.json(
      { error: "Failed to fetch task" },
      { status: 500 }
    );
  }
}

export async function PATCH(request: NextRequest, ctx: RouteContext) {
  try {
    const userId = await checkAdmin();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await ctx.params;
    const body = await request.json();

    const updates: Record<string, unknown> = {};

    if (body.title !== undefined) updates.title = body.title;
    if (body.description !== undefined) updates.description = body.description;
    if (body.status !== undefined) {
      updates.status = body.status;
      if (body.status === "done") {
        updates.completedAt = new Date();
      }
    }
    if (body.priority !== undefined) updates.priority = body.priority;
    if (body.dueDate !== undefined)
      updates.dueDate = body.dueDate ? new Date(body.dueDate) : null;
    if (body.assigneeId !== undefined) updates.assigneeId = body.assigneeId;
    if (body.projectId !== undefined) updates.projectId = body.projectId;
    if (body.clientId !== undefined) updates.clientId = body.clientId;
    if (body.labels !== undefined) updates.labels = body.labels;
    if (body.position !== undefined) updates.position = body.position;

    const [updated] = await db
      .update(schema.tasks)
      .set(updates)
      .where(eq(schema.tasks.id, id))
      .returning();

    if (!updated) {
      return NextResponse.json({ error: "Task not found" }, { status: 404 });
    }

    await createAuditLog({
      actorId: userId,
      actorType: "user",
      action: "task.updated",
      entityType: "task",
      entityId: id,
      metadata: body,
    });

    return NextResponse.json(updated);
  } catch (error) {
    captureError(error);
    return NextResponse.json(
      { error: "Failed to update task" },
      { status: 500 }
    );
  }
}

export async function DELETE(_request: NextRequest, ctx: RouteContext) {
  try {
    const userId = await checkAdmin();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await ctx.params;

    await db
      .update(schema.tasks)
      .set({ isArchived: true })
      .where(eq(schema.tasks.id, id));

    await createAuditLog({
      actorId: userId,
      actorType: "user",
      action: "task.archived",
      entityType: "task",
      entityId: id,
    });

    return NextResponse.json({ archived: true });
  } catch (error) {
    captureError(error);
    return NextResponse.json(
      { error: "Failed to archive task" },
      { status: 500 }
    );
  }
}
