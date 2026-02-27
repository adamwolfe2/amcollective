/**
 * GET /api/audit-logs -- Enhanced audit log listing with filtering, pagination, and export.
 */

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { desc, and, eq, gte, lte, ilike, count } from "drizzle-orm";
import { checkAdmin } from "@/lib/auth";
import { captureError } from "@/lib/errors";

export async function GET(request: NextRequest) {
  try {
    const userId = await checkAdmin();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const url = request.nextUrl.searchParams;
    const limit = Math.min(Number(url.get("limit")) || 50, 200);
    const offset = Number(url.get("offset")) || 0;
    const action = url.get("action");
    const entityType = url.get("entityType");
    const actorType = url.get("actorType");
    const search = url.get("search");
    const dateFrom = url.get("dateFrom");
    const dateTo = url.get("dateTo");
    const format = url.get("format"); // "json" or "csv"

    // Build conditions
    const conditions = [];
    if (action) conditions.push(ilike(schema.auditLogs.action, `%${action}%`));
    if (entityType) conditions.push(eq(schema.auditLogs.entityType, entityType));
    if (actorType) conditions.push(eq(schema.auditLogs.actorType, actorType as "user" | "system" | "agent"));
    if (search) {
      conditions.push(
        ilike(schema.auditLogs.action, `%${search}%`)
      );
    }
    if (dateFrom) conditions.push(gte(schema.auditLogs.createdAt, new Date(dateFrom)));
    if (dateTo) conditions.push(lte(schema.auditLogs.createdAt, new Date(dateTo)));

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    // Get total count
    const [totalResult] = await db
      .select({ count: count() })
      .from(schema.auditLogs)
      .where(whereClause);

    // Get entries
    const entries = await db
      .select()
      .from(schema.auditLogs)
      .where(whereClause)
      .orderBy(desc(schema.auditLogs.createdAt))
      .limit(limit)
      .offset(offset);

    // CSV export
    if (format === "csv") {
      const headers = "id,action,entity_type,entity_id,actor_id,actor_type,ip_address,created_at\n";
      const rows = entries
        .map(
          (e) =>
            `${e.id},${e.action},${e.entityType},${e.entityId},${e.actorId},${e.actorType},${e.ipAddress ?? ""},${e.createdAt.toISOString()}`
        )
        .join("\n");

      return new Response(headers + rows, {
        headers: {
          "Content-Type": "text/csv",
          "Content-Disposition": `attachment; filename="audit-log-${new Date().toISOString().split("T")[0]}.csv"`,
        },
      });
    }

    return NextResponse.json({
      entries,
      total: totalResult?.count ?? 0,
      limit,
      offset,
    });
  } catch (error) {
    captureError(error);
    return NextResponse.json(
      { error: "Failed to fetch audit logs" },
      { status: 500 }
    );
  }
}
