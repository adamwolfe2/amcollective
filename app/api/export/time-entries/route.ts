import { NextRequest } from "next/server";
import { checkAdmin } from "@/lib/auth";
import { captureError } from "@/lib/errors";
import { createAuditLog } from "@/lib/db/repositories/audit";
import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { desc, eq, and, gte, lte } from "drizzle-orm";
import { buildCsv, csvResponse, fmtDollars, fmtDate } from "@/lib/export/csv";

/**
 * GET /api/export/time-entries — Export time entries as CSV
 * Query params: from, to, clientId, billable, unbilledOnly
 */
export async function GET(request: NextRequest) {
  const userId = await checkAdmin();
  if (!userId) {
    return new Response("Unauthorized", { status: 401 });
  }

  try {
    const { searchParams } = request.nextUrl;
    const from = searchParams.get("from");
    const to = searchParams.get("to");
    const clientId = searchParams.get("clientId");
    const billable = searchParams.get("billable");
    const unbilledOnly = searchParams.get("unbilledOnly");

    const conditions = [];
    if (from) conditions.push(gte(schema.timeEntries.date, new Date(from)));
    if (to) conditions.push(lte(schema.timeEntries.date, new Date(to)));
    if (clientId) conditions.push(eq(schema.timeEntries.clientId, clientId));
    if (billable === "true") conditions.push(eq(schema.timeEntries.billable, true));
    if (billable === "false") conditions.push(eq(schema.timeEntries.billable, false));
    if (unbilledOnly === "true") {
      conditions.push(eq(schema.timeEntries.billable, true));
    }

    const rows = await db
      .select({
        date: schema.timeEntries.date,
        hours: schema.timeEntries.hours,
        description: schema.timeEntries.description,
        billable: schema.timeEntries.billable,
        hourlyRate: schema.timeEntries.hourlyRate,
        companyTag: schema.timeEntries.companyTag,
        clientName: schema.clients.name,
        projectName: schema.portfolioProjects.name,
        teamMemberName: schema.teamMembers.name,
        createdAt: schema.timeEntries.createdAt,
      })
      .from(schema.timeEntries)
      .leftJoin(schema.clients, eq(schema.timeEntries.clientId, schema.clients.id))
      .leftJoin(
        schema.portfolioProjects,
        eq(schema.timeEntries.projectId, schema.portfolioProjects.id)
      )
      .leftJoin(
        schema.teamMembers,
        eq(schema.timeEntries.teamMemberId, schema.teamMembers.id)
      )
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(schema.timeEntries.date))
      .limit(10000);

    const headers = [
      "Date",
      "Client",
      "Project",
      "Team Member",
      "Hours",
      "Billable",
      "Hourly Rate",
      "Total Value",
      "Description",
      "Company Tag",
      "Created At",
    ];

    const csvRows = rows.map((r) => {
      const hours = Number(r.hours ?? 0);
      const rate = r.hourlyRate ?? 0;
      const totalCents = Math.round(hours * rate);
      return [
        fmtDate(r.date),
        r.clientName,
        r.projectName,
        r.teamMemberName,
        hours.toFixed(2),
        r.billable ? "Yes" : "No",
        fmtDollars(rate),
        fmtDollars(totalCents),
        r.description,
        r.companyTag,
        fmtDate(r.createdAt),
      ];
    });

    const csv = buildCsv(headers, csvRows);
    const filename = `time-entries-${new Date().toISOString().split("T")[0]}.csv`;

    await createAuditLog({
      actorId: userId,
      actorType: "user",
      action: "export.time_entries",
      entityType: "export",
      entityId: "time-entries",
      metadata: { format: "csv", count: rows.length, from, to, clientId },
    });

    return csvResponse(csv, filename);
  } catch (error) {
    captureError(error, { tags: { route: "GET /api/export/time-entries" } });
    return new Response("Export failed", { status: 500 });
  }
}
