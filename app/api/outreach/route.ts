/**
 * GET /api/outreach — Outreach dashboard data
 *
 * Returns campaigns + recent events + aggregate stats from the DB.
 */

import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { desc, gte, count, eq, sql } from "drizzle-orm";
import { checkAdmin } from "@/lib/auth";

export async function GET() {
  try {
    const userId = await checkAdmin();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    const [
      campaigns,
      recentEvents,
      eventCounts30d,
      eventCounts7d,
      dailyActivity,
    ] = await Promise.all([
      // All campaigns
      db
        .select()
        .from(schema.outreachCampaigns)
        .orderBy(desc(schema.outreachCampaigns.updatedAt)),

      // Recent 50 events
      db
        .select()
        .from(schema.outreachEvents)
        .orderBy(desc(schema.outreachEvents.createdAt))
        .limit(50),

      // 30d event counts by type
      db
        .select({
          eventType: schema.outreachEvents.eventType,
          count: count(),
        })
        .from(schema.outreachEvents)
        .where(gte(schema.outreachEvents.createdAt, thirtyDaysAgo))
        .groupBy(schema.outreachEvents.eventType),

      // 7d event counts by type
      db
        .select({
          eventType: schema.outreachEvents.eventType,
          count: count(),
        })
        .from(schema.outreachEvents)
        .where(gte(schema.outreachEvents.createdAt, sevenDaysAgo))
        .groupBy(schema.outreachEvents.eventType),

      // Daily activity last 30 days
      db
        .select({
          day: sql<string>`TO_CHAR(${schema.outreachEvents.createdAt}, 'YYYY-MM-DD')`,
          sent: sql<number>`COUNT(*) FILTER (WHERE ${schema.outreachEvents.eventType} IN ('email_sent', 'contact_first_emailed'))`,
          opened: sql<number>`COUNT(*) FILTER (WHERE ${schema.outreachEvents.eventType} = 'email_opened')`,
          replied: sql<number>`COUNT(*) FILTER (WHERE ${schema.outreachEvents.eventType} = 'contact_replied')`,
          bounced: sql<number>`COUNT(*) FILTER (WHERE ${schema.outreachEvents.eventType} = 'email_bounced')`,
        })
        .from(schema.outreachEvents)
        .where(gte(schema.outreachEvents.createdAt, thirtyDaysAgo))
        .groupBy(sql`TO_CHAR(${schema.outreachEvents.createdAt}, 'YYYY-MM-DD')`)
        .orderBy(sql`TO_CHAR(${schema.outreachEvents.createdAt}, 'YYYY-MM-DD')`),
    ]);

    // Aggregate totals
    function sumByType(
      counts: Array<{ eventType: string; count: number }>,
      ...types: string[]
    ): number {
      return counts
        .filter((c) => types.includes(c.eventType))
        .reduce((sum, c) => sum + Number(c.count), 0);
    }

    const stats30d = {
      sent: sumByType(eventCounts30d, "email_sent", "contact_first_emailed"),
      opened: sumByType(eventCounts30d, "email_opened"),
      replied: sumByType(eventCounts30d, "contact_replied"),
      interested: sumByType(eventCounts30d, "contact_interested"),
      bounced: sumByType(eventCounts30d, "email_bounced"),
      unsubscribed: sumByType(eventCounts30d, "contact_unsubscribed"),
    };

    const stats7d = {
      sent: sumByType(eventCounts7d, "email_sent", "contact_first_emailed"),
      opened: sumByType(eventCounts7d, "email_opened"),
      replied: sumByType(eventCounts7d, "contact_replied"),
      interested: sumByType(eventCounts7d, "contact_interested"),
      bounced: sumByType(eventCounts7d, "email_bounced"),
      unsubscribed: sumByType(eventCounts7d, "contact_unsubscribed"),
    };

    return NextResponse.json({
      campaigns,
      recentEvents,
      stats30d,
      stats7d,
      dailyActivity,
    });
  } catch (error) {
    console.error("[Outreach API Error]", error);
    return NextResponse.json(
      { error: "Failed to fetch outreach data" },
      { status: 500 }
    );
  }
}
