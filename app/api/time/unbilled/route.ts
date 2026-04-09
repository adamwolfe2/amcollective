import { NextResponse } from "next/server";
import { checkAdmin } from "@/lib/auth";
import { captureError } from "@/lib/errors";
import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { eq, and, sql } from "drizzle-orm";

/**
 * GET /api/time/unbilled — Get unbilled time entries grouped by client
 * Returns: { clients: [{ clientId, clientName, totalHours, totalValue, entries: [...] }] }
 */
export async function GET() {
  const userId = await checkAdmin();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    // Get all unbilled, billable time entries
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
      .where(
        and(
          eq(schema.timeEntries.billable, true),
          sql`${schema.timeEntries.invoiceId} IS NULL`
        )
      )
      .orderBy(schema.timeEntries.date);

    // Group by client
    const clientMap = new Map<
      string,
      {
        clientId: string;
        clientName: string;
        totalHours: number;
        totalValueCents: number;
        entries: typeof entries;
      }
    >();

    for (const row of entries) {
      const cid = row.entry.clientId;
      if (!clientMap.has(cid)) {
        clientMap.set(cid, {
          clientId: cid,
          clientName: row.clientName ?? "Unknown",
          totalHours: 0,
          totalValueCents: 0,
          entries: [],
        });
      }
      const group = clientMap.get(cid)!;
      const hours = parseFloat(row.entry.hours);
      const rate = row.entry.hourlyRate ?? 0;
      group.totalHours += hours;
      group.totalValueCents += Math.round(hours * rate);
      group.entries.push(row);
    }

    return NextResponse.json({
      clients: Array.from(clientMap.values()),
    }, {
      headers: { "Cache-Control": "private, max-age=60, stale-while-revalidate=120" },
    });
  } catch (error) {
    captureError(error, { tags: { route: "GET /api/time/unbilled" } });
    return NextResponse.json({ error: "Failed to fetch unbilled time" }, { status: 500 });
  }
}
