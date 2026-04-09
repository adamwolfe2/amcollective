/**
 * GET    /api/tasks/[id]  -- task detail with comments
 * PATCH  /api/tasks/[id]  -- update task
 * DELETE /api/tasks/[id]  -- archive task
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { eq, asc } from "drizzle-orm";
import { checkAdmin } from "@/lib/auth";
import { captureError } from "@/lib/errors";
import { createAuditLog } from "@/lib/db/repositories/audit";
import { aj } from "@/lib/middleware/arcjet";

const taskUpdateSchema = z.object({
  title: z.string().min(1).max(500).trim(),
  description: z.string().max(10000).nullable(),
  status: z.enum(["backlog", "todo", "in_progress", "in_review", "done", "cancelled"]),
  priority: z.enum(["high", "urgent", "medium", "low"]),
  dueDate: z.string().nullable(),
  assigneeId: z.string().uuid().nullable(),
  projectId: z.string().uuid().nullable(),
  clientId: z.string().uuid().nullable(),
  labels: z.array(z.string().max(100)).nullable(),
  position: z.number().int().min(0),
}).partial().refine(data => Object.keys(data).length > 0, "At least one field required");

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

    return NextResponse.json({ ...row, comments }, {
      headers: { "Cache-Control": "private, max-age=60, stale-while-revalidate=120" },
    });
  } catch (error) {
    captureError(error);
    return NextResponse.json(
      { error: "Failed to fetch task" },
      { status: 500 }
    );
  }
}

export async function PATCH(request: NextRequest, ctx: RouteContext) {
  if (aj) {
    const decision = await aj.protect(request, { requested: 1 });
    if (decision.isDenied()) {
      return NextResponse.json({ error: "Rate limited" }, { status: 429 });
    }
  }

  try {
    const userId = await checkAdmin();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await ctx.params;
    const body = await request.json();

    const parsed = taskUpdateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const data = parsed.data;
    const updates: Record<string, unknown> = {};

    if (data.title !== undefined) updates.title = data.title;
    if (data.description !== undefined) updates.description = data.description;
    if (data.status !== undefined) {
      updates.status = data.status;
      if (data.status === "done") {
        updates.completedAt = new Date();
      }
    }
    if (data.priority !== undefined) updates.priority = data.priority;
    if (data.dueDate !== undefined)
      updates.dueDate = data.dueDate ? new Date(data.dueDate) : null;
    if (data.assigneeId !== undefined) updates.assigneeId = data.assigneeId;
    if (data.projectId !== undefined) updates.projectId = data.projectId;
    if (data.clientId !== undefined) updates.clientId = data.clientId;
    if (data.labels !== undefined) updates.labels = data.labels;
    if (data.position !== undefined) updates.position = data.position;

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
      metadata: data,
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
  if (aj) {
    const decision = await aj.protect(_request, { requested: 1 });
    if (decision.isDenied()) {
      return NextResponse.json({ error: "Rate limited" }, { status: 429 });
    }
  }

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
