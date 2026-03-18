import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { checkAdmin } from "@/lib/auth";
import { captureError } from "@/lib/errors";
import { createAuditLog } from "@/lib/db/repositories/audit";
import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { aj } from "@/lib/middleware/arcjet";

const companyTags = ["trackr", "wholesail", "taskspace", "cursive", "tbgc", "hook", "myvsl", "am_collective", "personal", "untagged"] as const;

const timeEntryUpdateSchema = z.object({
  clientId: z.string().uuid(),
  projectId: z.string().uuid().nullable(),
  teamMemberId: z.string().uuid().nullable(),
  date: z.string(),
  hours: z.number().min(0).max(24),
  description: z.string().max(5000).nullable(),
  billable: z.boolean(),
  hourlyRate: z.number().int().min(0),
  companyTag: z.enum(companyTags),
}).partial().refine(data => Object.keys(data).length > 0, "At least one field required");

type RouteContext = { params: Promise<{ id: string }> };

/**
 * GET /api/time/:id — Get a single time entry
 */
export async function GET(_request: NextRequest, context: RouteContext) {
  const userId = await checkAdmin();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const { id } = await context.params;
    const [entry] = await db
      .select({
        entry: schema.timeEntries,
        clientName: schema.clients.name,
        projectName: schema.portfolioProjects.name,
        teamMemberName: schema.teamMembers.name,
      })
      .from(schema.timeEntries)
      .leftJoin(schema.clients, eq(schema.timeEntries.clientId, schema.clients.id))
      .leftJoin(schema.portfolioProjects, eq(schema.timeEntries.projectId, schema.portfolioProjects.id))
      .leftJoin(schema.teamMembers, eq(schema.timeEntries.teamMemberId, schema.teamMembers.id))
      .where(eq(schema.timeEntries.id, id))
      .limit(1);

    if (!entry) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json(entry);
  } catch (error) {
    captureError(error, { tags: { route: "GET /api/time/:id" } });
    return NextResponse.json({ error: "Failed to fetch time entry" }, { status: 500 });
  }
}

/**
 * PATCH /api/time/:id — Update a time entry
 */
export async function PATCH(request: NextRequest, context: RouteContext) {
  if (aj) {
    const decision = await aj.protect(request, { requested: 1 });
    if (decision.isDenied()) {
      return NextResponse.json({ error: "Too many requests" }, { status: 429 });
    }
  }

  const userId = await checkAdmin();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const { id } = await context.params;
    const body = await request.json();

    // Only allow updating entries that haven't been invoiced
    const [existing] = await db
      .select()
      .from(schema.timeEntries)
      .where(eq(schema.timeEntries.id, id))
      .limit(1);

    if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (existing.invoiceId) {
      return NextResponse.json(
        { error: "Cannot edit an invoiced time entry" },
        { status: 400 }
      );
    }

    const parsed = timeEntryUpdateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const data = parsed.data;
    const updates: Record<string, unknown> = {};
    if (data.clientId !== undefined) updates.clientId = data.clientId;
    if (data.projectId !== undefined) updates.projectId = data.projectId || null;
    if (data.teamMemberId !== undefined) updates.teamMemberId = data.teamMemberId || null;
    if (data.date !== undefined) updates.date = new Date(data.date);
    if (data.hours !== undefined) updates.hours = String(data.hours);
    if (data.description !== undefined) updates.description = data.description || null;
    if (data.billable !== undefined) updates.billable = data.billable;
    if (data.hourlyRate !== undefined) updates.hourlyRate = data.hourlyRate;
    if (data.companyTag !== undefined) updates.companyTag = data.companyTag;

    const [updated] = await db
      .update(schema.timeEntries)
      .set(updates)
      .where(eq(schema.timeEntries.id, id))
      .returning();

    await createAuditLog({
      actorId: userId,
      actorType: "user",
      action: "time_entry.updated",
      entityType: "time_entry",
      entityId: id,
      metadata: { changes: Object.keys(updates) },
    });

    return NextResponse.json(updated);
  } catch (error) {
    captureError(error, { tags: { route: "PATCH /api/time/:id" } });
    return NextResponse.json({ error: "Failed to update time entry" }, { status: 500 });
  }
}

/**
 * DELETE /api/time/:id — Delete a time entry (only if not invoiced)
 */
export async function DELETE(request: NextRequest, context: RouteContext) {
  if (aj) {
    const decision = await aj.protect(request, { requested: 1 });
    if (decision.isDenied()) {
      return NextResponse.json({ error: "Too many requests" }, { status: 429 });
    }
  }

  const userId = await checkAdmin();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const { id } = await context.params;

    const [existing] = await db
      .select()
      .from(schema.timeEntries)
      .where(eq(schema.timeEntries.id, id))
      .limit(1);

    if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (existing.invoiceId) {
      return NextResponse.json(
        { error: "Cannot delete an invoiced time entry" },
        { status: 400 }
      );
    }

    await db.delete(schema.timeEntries).where(eq(schema.timeEntries.id, id));

    await createAuditLog({
      actorId: userId,
      actorType: "user",
      action: "time_entry.deleted",
      entityType: "time_entry",
      entityId: id,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    captureError(error, { tags: { route: "DELETE /api/time/:id" } });
    return NextResponse.json({ error: "Failed to delete time entry" }, { status: 500 });
  }
}
