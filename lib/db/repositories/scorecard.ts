/**
 * Scorecard Repository — Weekly metrics tracking (EOS pattern)
 *
 * Adapted from TaskSpace scorecard (~/aimseod/lib/db/scorecard.ts)
 */

import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { eq, desc, asc, and, gte, lte } from "drizzle-orm";
import { createAuditLog } from "./audit";

/** Get the Monday (week start) for a given date */
export function getWeekStart(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  d.setDate(diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

/** Get an array of the last N week start dates */
export function getLastNWeeks(n: number): Date[] {
  const weeks: Date[] = [];
  const now = getWeekStart(new Date());
  for (let i = 0; i < n; i++) {
    const d = new Date(now);
    d.setDate(d.getDate() - i * 7);
    weeks.push(d);
  }
  return weeks.reverse();
}

export async function getMetrics() {
  return db
    .select({
      metric: schema.scorecardMetrics,
      owner: {
        id: schema.teamMembers.id,
        name: schema.teamMembers.name,
      },
    })
    .from(schema.scorecardMetrics)
    .leftJoin(
      schema.teamMembers,
      eq(schema.scorecardMetrics.ownerId, schema.teamMembers.id)
    )
    .where(eq(schema.scorecardMetrics.isActive, true))
    .orderBy(asc(schema.scorecardMetrics.displayOrder));
}

export async function createMetric(
  data: {
    name: string;
    description?: string;
    ownerId?: string;
    targetValue?: string;
    targetDirection?: "above" | "below" | "exact";
    unit?: string;
    displayOrder?: number;
  },
  actorId: string
) {
  const [metric] = await db
    .insert(schema.scorecardMetrics)
    .values({
      name: data.name,
      description: data.description ?? null,
      ownerId: data.ownerId ?? null,
      targetValue: data.targetValue ?? null,
      targetDirection: data.targetDirection ?? "above",
      unit: data.unit ?? null,
      displayOrder: data.displayOrder ?? 0,
    })
    .returning();

  await createAuditLog({
    actorId,
    actorType: "user",
    action: "create",
    entityType: "scorecard_metric",
    entityId: metric.id,
    metadata: { name: data.name },
  });

  return metric;
}

export async function getEntries(metricId: string, weeks = 13) {
  const weekDates = getLastNWeeks(weeks);
  const startDate = weekDates[0];

  return db
    .select()
    .from(schema.scorecardEntries)
    .where(
      and(
        eq(schema.scorecardEntries.metricId, metricId),
        gte(schema.scorecardEntries.weekStart, startDate)
      )
    )
    .orderBy(asc(schema.scorecardEntries.weekStart));
}

export async function upsertEntry(
  data: {
    metricId: string;
    weekStart: Date;
    value: string;
    notes?: string;
  },
  actorId: string
) {
  // Check if entry exists for this metric + week
  const [existing] = await db
    .select()
    .from(schema.scorecardEntries)
    .where(
      and(
        eq(schema.scorecardEntries.metricId, data.metricId),
        eq(schema.scorecardEntries.weekStart, data.weekStart)
      )
    )
    .limit(1);

  if (existing) {
    const [updated] = await db
      .update(schema.scorecardEntries)
      .set({
        value: data.value,
        notes: data.notes ?? null,
        enteredBy: actorId,
      })
      .where(eq(schema.scorecardEntries.id, existing.id))
      .returning();
    return updated;
  }

  const [created] = await db
    .insert(schema.scorecardEntries)
    .values({
      metricId: data.metricId,
      weekStart: data.weekStart,
      value: data.value,
      notes: data.notes ?? null,
      enteredBy: actorId,
    })
    .returning();

  return created;
}

export async function getScorecardData(weeks = 13) {
  const weekDates = getLastNWeeks(weeks);
  const startDate = weekDates[0];

  const metrics = await getMetrics();
  const entries = await db
    .select()
    .from(schema.scorecardEntries)
    .where(gte(schema.scorecardEntries.weekStart, startDate))
    .orderBy(asc(schema.scorecardEntries.weekStart));

  // Build matrix: metric rows x week columns
  const entryMap = new Map<string, Map<string, typeof entries[0]>>();
  for (const entry of entries) {
    const key = entry.metricId;
    if (!entryMap.has(key)) entryMap.set(key, new Map());
    const weekKey = entry.weekStart instanceof Date
      ? entry.weekStart.toISOString().split("T")[0]
      : String(entry.weekStart);
    entryMap.get(key)!.set(weekKey, entry);
  }

  return { metrics, weekDates, entryMap };
}
