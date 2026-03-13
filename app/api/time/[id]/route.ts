import { NextRequest, NextResponse } from "next/server";
import { checkAdmin } from "@/lib/auth";
import { captureError } from "@/lib/errors";
import { createAuditLog } from "@/lib/db/repositories/audit";
import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { aj } from "@/lib/middleware/arcjet";

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

    const updates: Record<string, unknown> = {};
    if (body.clientId !== undefined) updates.clientId = body.clientId;
    if (body.projectId !== undefined) updates.projectId = body.projectId || null;
    if (body.teamMemberId !== undefined) updates.teamMemberId = body.teamMemberId || null;
    if (body.date !== undefined) updates.date = new Date(body.date);
    if (body.hours !== undefined) updates.hours = String(body.hours);
    if (body.description !== undefined) updates.description = body.description || null;
    if (body.billable !== undefined) updates.billable = body.billable;
    if (body.hourlyRate !== undefined) updates.hourlyRate = body.hourlyRate;
    if (body.companyTag !== undefined) updates.companyTag = body.companyTag;

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
