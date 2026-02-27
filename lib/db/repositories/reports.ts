/**
 * EOD Reports Repository
 *
 * Adapted from TaskSpace EOD pattern (~/aimseod/app/api/eod-reports/route.ts)
 */

import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { eq, desc, and, gte, lte } from "drizzle-orm";
import { createAuditLog } from "./audit";

export async function getReports(filters?: {
  authorId?: string;
  startDate?: Date;
  endDate?: Date;
  limit?: number;
}) {
  const conditions = [];
  if (filters?.authorId) {
    conditions.push(eq(schema.eodReports.authorId, filters.authorId));
  }
  if (filters?.startDate) {
    conditions.push(gte(schema.eodReports.date, filters.startDate));
  }
  if (filters?.endDate) {
    conditions.push(lte(schema.eodReports.date, filters.endDate));
  }

  return db
    .select({
      report: schema.eodReports,
      author: {
        id: schema.teamMembers.id,
        name: schema.teamMembers.name,
        title: schema.teamMembers.title,
      },
    })
    .from(schema.eodReports)
    .innerJoin(
      schema.teamMembers,
      eq(schema.eodReports.authorId, schema.teamMembers.id)
    )
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(schema.eodReports.date))
    .limit(filters?.limit ?? 30);
}

export async function getReport(id: string) {
  const [report] = await db
    .select({
      report: schema.eodReports,
      author: {
        id: schema.teamMembers.id,
        name: schema.teamMembers.name,
        title: schema.teamMembers.title,
      },
    })
    .from(schema.eodReports)
    .innerJoin(
      schema.teamMembers,
      eq(schema.eodReports.authorId, schema.teamMembers.id)
    )
    .where(eq(schema.eodReports.id, id))
    .limit(1);
  return report ?? null;
}

export async function createReport(
  data: {
    authorId: string;
    date: Date;
    tasksCompleted?: Array<{ text: string; projectId?: string }>;
    blockers?: string;
    tomorrowPlan?: Array<{ text: string }>;
    needsEscalation?: boolean;
    escalationNote?: string;
  },
  actorId: string
) {
  const [report] = await db
    .insert(schema.eodReports)
    .values({
      authorId: data.authorId,
      date: data.date,
      tasksCompleted: data.tasksCompleted ?? null,
      blockers: data.blockers ?? null,
      tomorrowPlan: data.tomorrowPlan ?? null,
      needsEscalation: data.needsEscalation ?? false,
      escalationNote: data.escalationNote ?? null,
    })
    .returning();

  await createAuditLog({
    actorId,
    actorType: "user",
    action: "create",
    entityType: "eod_report",
    entityId: report.id,
    metadata: { date: data.date.toISOString(), authorId: data.authorId },
  });

  return report;
}
