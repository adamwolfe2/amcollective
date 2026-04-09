/**
 * GET /api/audit-logs/stats -- Audit log statistics for compliance dashboard.
 */

import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { sql, count, gte, desc } from "drizzle-orm";
import { checkAdmin } from "@/lib/auth";
import { captureError } from "@/lib/errors";

export const runtime = "edge";
export const preferredRegion = "iad1";

export async function GET() {
  try {
    const userId = await checkAdmin();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const now = new Date();
    const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    const [
      totalCount,
      last24h,
      last7d,
      last30d,
      byAction,
      byEntityType,
      byActorType,
      dailyVolume,
    ] = await Promise.all([
      db.select({ count: count() }).from(schema.auditLogs),
      db.select({ count: count() }).from(schema.auditLogs)
        .where(gte(schema.auditLogs.createdAt, twentyFourHoursAgo)),
      db.select({ count: count() }).from(schema.auditLogs)
        .where(gte(schema.auditLogs.createdAt, sevenDaysAgo)),
      db.select({ count: count() }).from(schema.auditLogs)
        .where(gte(schema.auditLogs.createdAt, thirtyDaysAgo)),
      db.select({
        action: schema.auditLogs.action,
        count: count(),
      }).from(schema.auditLogs)
        .where(gte(schema.auditLogs.createdAt, thirtyDaysAgo))
        .groupBy(schema.auditLogs.action)
        .orderBy(desc(count()))
        .limit(20),
      db.select({
        entityType: schema.auditLogs.entityType,
        count: count(),
      }).from(schema.auditLogs)
        .where(gte(schema.auditLogs.createdAt, thirtyDaysAgo))
        .groupBy(schema.auditLogs.entityType)
        .orderBy(desc(count())),
      db.select({
        actorType: schema.auditLogs.actorType,
        count: count(),
      }).from(schema.auditLogs)
        .where(gte(schema.auditLogs.createdAt, thirtyDaysAgo))
        .groupBy(schema.auditLogs.actorType),
      db.select({
        day: sql<string>`TO_CHAR(${schema.auditLogs.createdAt}, 'YYYY-MM-DD')`,
        count: count(),
      }).from(schema.auditLogs)
        .where(gte(schema.auditLogs.createdAt, thirtyDaysAgo))
        .groupBy(sql`TO_CHAR(${schema.auditLogs.createdAt}, 'YYYY-MM-DD')`)
        .orderBy(sql`TO_CHAR(${schema.auditLogs.createdAt}, 'YYYY-MM-DD')`),
    ]);

    return NextResponse.json({
      totalEntries: totalCount[0]?.count ?? 0,
      last24h: last24h[0]?.count ?? 0,
      last7d: last7d[0]?.count ?? 0,
      last30d: last30d[0]?.count ?? 0,
      topActions: byAction,
      byEntityType,
      byActorType,
      dailyVolume,
    }, {
      headers: { "Cache-Control": "private, max-age=60, stale-while-revalidate=120" },
    });
  } catch (error) {
    captureError(error);
    return NextResponse.json(
      { error: "Failed to fetch audit stats" },
      { status: 500 }
    );
  }
}
