import { NextRequest, NextResponse } from "next/server";
import { checkAdmin } from "@/lib/auth";
import { captureError } from "@/lib/errors";
import { createAuditLog } from "@/lib/db/repositories/audit";
import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { eq, desc, and, gte, lte, sql } from "drizzle-orm";

/**
 * GET /api/time — List time entries with optional filters
 * Query params: clientId, projectId, from, to, billable, unbilledOnly
 */
export async function GET(request: NextRequest) {
  const userId = await checkAdmin();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const url = request.nextUrl;
    const clientId = url.searchParams.get("clientId");
    const projectId = url.searchParams.get("projectId");
    const from = url.searchParams.get("from");
    const to = url.searchParams.get("to");
    const billableOnly = url.searchParams.get("billable") === "true";
    const unbilledOnly = url.searchParams.get("unbilledOnly") === "true";
    const limit = parseInt(url.searchParams.get("limit") || "100", 10);

    const conditions = [];
    if (clientId) conditions.push(eq(schema.timeEntries.clientId, clientId));
    if (projectId) conditions.push(eq(schema.timeEntries.projectId, projectId));
    if (from) conditions.push(gte(schema.timeEntries.date, new Date(from)));
    if (to) conditions.push(lte(schema.timeEntries.date, new Date(to)));
    if (billableOnly) conditions.push(eq(schema.timeEntries.billable, true));
    if (unbilledOnly) {
      conditions.push(eq(schema.timeEntries.billable, true));
      conditions.push(sql`${schema.timeEntries.invoiceId} IS NULL`);
    }

    const entries = await db
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
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(schema.timeEntries.date))
      .limit(limit);

    return NextResponse.json(entries);
  } catch (error) {
    captureError(error, { tags: { route: "GET /api/time" } });
    return NextResponse.json({ error: "Failed to fetch time entries" }, { status: 500 });
  }
}

/**
 * POST /api/time — Create a time entry
 */
export async function POST(request: NextRequest) {
  const userId = await checkAdmin();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const body = await request.json();
    const {
      clientId,
      projectId,
      teamMemberId,
      date,
      hours,
      description,
      billable = true,
      hourlyRate,
      companyTag,
    } = body;

    if (!clientId || !date || !hours) {
      return NextResponse.json(
        { error: "clientId, date, and hours are required" },
        { status: 400 }
      );
    }

    const [entry] = await db
      .insert(schema.timeEntries)
      .values({
        clientId,
        projectId: projectId || null,
        teamMemberId: teamMemberId || null,
        date: new Date(date),
        hours: String(hours),
        description: description || null,
        billable,
        hourlyRate: hourlyRate ?? null,
        companyTag: companyTag || "am_collective",
        createdBy: userId,
      })
      .returning();

    await createAuditLog({
      actorId: userId,
      actorType: "user",
      action: "time_entry.created",
      entityType: "time_entry",
      entityId: entry.id,
      metadata: { clientId, hours, billable },
    });

    return NextResponse.json(entry, { status: 201 });
  } catch (error) {
    captureError(error, { tags: { route: "POST /api/time" } });
    return NextResponse.json({ error: "Failed to create time entry" }, { status: 500 });
  }
}
