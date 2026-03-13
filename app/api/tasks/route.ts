/**
 * GET  /api/tasks  -- list tasks (filter by status, assignee, project)
 * POST /api/tasks  -- create task
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { eq, desc, and, sql } from "drizzle-orm";
import { checkAdmin } from "@/lib/auth";
import { captureError } from "@/lib/errors";
import { createAuditLog } from "@/lib/db/repositories/audit";
import { aj } from "@/lib/middleware/arcjet";

const companyTags = ["trackr", "wholesail", "taskspace", "cursive", "tbgc", "hook", "am_collective", "personal", "untagged"] as const;

const taskSchema = z.object({
  title: z.string().min(1, "Title is required").max(500).trim(),
  description: z.string().max(10000).optional().nullable(),
  status: z.enum(["backlog", "todo", "in_progress", "in_review", "done", "cancelled"]).optional(),
  priority: z.enum(["high", "urgent", "medium", "low"]).optional(),
  dueDate: z.string().optional().nullable(),
  assigneeId: z.string().uuid().optional().nullable(),
  projectId: z.string().uuid().optional().nullable(),
  clientId: z.string().uuid().optional().nullable(),
  companyTag: z.enum(companyTags).optional(),
  labels: z.unknown().optional().nullable(),
  source: z.enum(["manual", "linear", "voice", "webhook", "sprint"]).optional(),
});

export async function GET(request: NextRequest) {
  try {
    const userId = await checkAdmin();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = request.nextUrl;
    const status = searchParams.get("status");
    const assigneeId = searchParams.get("assigneeId");
    const projectId = searchParams.get("projectId");

    const conditions = [eq(schema.tasks.isArchived, false)];

    if (status && status !== "all") {
      conditions.push(
        eq(
          schema.tasks.status,
          status as (typeof schema.taskStatusEnum.enumValues)[number]
        )
      );
    }
    if (assigneeId) {
      conditions.push(eq(schema.tasks.assigneeId, assigneeId));
    }
    if (projectId) {
      conditions.push(eq(schema.tasks.projectId, projectId));
    }

    const rows = await db
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
      .where(and(...conditions))
      .orderBy(
        sql`CASE ${schema.tasks.priority}
          WHEN 'urgent' THEN 0
          WHEN 'high' THEN 1
          WHEN 'medium' THEN 2
          WHEN 'low' THEN 3
        END`,
        desc(schema.tasks.createdAt)
      )
      .limit(200);

    return NextResponse.json(rows);
  } catch (error) {
    captureError(error);
    return NextResponse.json(
      { error: "Failed to fetch tasks" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
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

    let rawBody: unknown;
    try {
      rawBody = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }

    const parsed = taskSchema.safeParse(rawBody);
    if (!parsed.success) {
      const firstError = parsed.error.errors[0];
      return NextResponse.json(
        { error: "Validation failed", field: firstError?.path?.join("."), message: firstError?.message },
        { status: 400 }
      );
    }

    const body = parsed.data;

    const [task] = await db
      .insert(schema.tasks)
      .values({
        title: body.title,
        description: body.description ?? null,
        status: body.status ?? "todo",
        priority: body.priority ?? "medium",
        dueDate: body.dueDate ? new Date(body.dueDate) : null,
        assigneeId: body.assigneeId ?? null,
        createdById: userId,
        projectId: body.projectId ?? null,
        clientId: body.clientId ?? null,
        companyTag: body.companyTag ?? "am_collective",
        labels: body.labels as typeof schema.tasks.$inferInsert.labels ?? null,
        source: body.source ?? "manual",
      })
      .returning();

    await createAuditLog({
      actorId: userId,
      actorType: "user",
      action: "task.created",
      entityType: "task",
      entityId: task.id,
      metadata: { title: body.title },
    });

    return NextResponse.json(task, { status: 201 });
  } catch (error) {
    captureError(error);
    return NextResponse.json(
      { error: "Failed to create task" },
      { status: 500 }
    );
  }
}
