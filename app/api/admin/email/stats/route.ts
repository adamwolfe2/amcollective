/**
 * GET /api/admin/email/stats
 *
 * Returns aggregate email deliverability metrics from emailEvents:
 *   - Last 24h overview (sent, delivered, opened, bounced, complained)
 *   - Per-template breakdown
 */

import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { db } from "@/lib/db";
import { emailEvents } from "@/lib/db/schema/email";
import { sql, gte, count } from "drizzle-orm";

export const runtime = "nodejs";

export async function GET() {
  const userId = await requireAuth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000);

  // Overview counts for last 24h
  const overviewRows = await db
    .select({
      event: emailEvents.event,
      count: count(),
    })
    .from(emailEvents)
    .where(gte(emailEvents.timestamp, since24h))
    .groupBy(emailEvents.event);

  const overview: Record<string, number> = {
    sent: 0,
    delivered: 0,
    opened: 0,
    bounced: 0,
    complained: 0,
    clicked: 0,
  };
  for (const row of overviewRows) {
    overview[row.event] = Number(row.count);
  }

  const totalSent = overview.sent || 1; // avoid division by zero
  const deliveredCount = overview.delivered;
  const openedCount = overview.opened;
  const bouncedCount = overview.bounced;
  const complainedCount = overview.complained;

  const stats = {
    sent24h: overview.sent,
    deliveredRate: Math.round((deliveredCount / totalSent) * 100),
    openRate: Math.round((openedCount / totalSent) * 100),
    bounceRate: Math.round((bouncedCount / totalSent) * 100),
    complaintRate: Math.round((complainedCount / totalSent) * 100),
  };

  // Per-template breakdown (all time)
  const templateRows = await db
    .select({
      templateName: emailEvents.templateName,
      event: emailEvents.event,
      count: count(),
    })
    .from(emailEvents)
    .groupBy(emailEvents.templateName, emailEvents.event);

  // Pivot template rows into a map
  const templateMap = new Map<
    string,
    { sent: number; delivered: number; opened: number; bounced: number; complained: number }
  >();

  for (const row of templateRows) {
    const key = row.templateName ?? "(unknown)";
    if (!templateMap.has(key)) {
      templateMap.set(key, { sent: 0, delivered: 0, opened: 0, bounced: 0, complained: 0 });
    }
    const entry = templateMap.get(key)!;
    const c = Number(row.count);
    if (row.event === "sent") entry.sent += c;
    else if (row.event === "delivered") entry.delivered += c;
    else if (row.event === "opened") entry.opened += c;
    else if (row.event === "bounced") entry.bounced += c;
    else if (row.event === "complained") entry.complained += c;
  }

  const templates = Array.from(templateMap.entries()).map(([name, counts]) => {
    const s = counts.sent || 1;
    return {
      templateName: name,
      sent: counts.sent,
      deliveredPct: Math.round((counts.delivered / s) * 100),
      openedPct: Math.round((counts.opened / s) * 100),
      bouncedPct: Math.round((counts.bounced / s) * 100),
      complainedPct: Math.round((counts.complained / s) * 100),
    };
  });

  // Recent 50 events
  const recentEvents = await db
    .select()
    .from(emailEvents)
    .orderBy(sql`${emailEvents.timestamp} DESC`)
    .limit(50);

  return NextResponse.json({ stats, templates, recentEvents });
}
