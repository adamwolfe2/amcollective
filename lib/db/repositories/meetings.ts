/**
 * Meetings Repository — L10 meeting notes (EOS pattern)
 *
 * Adapted from TaskSpace meetings (~/aimseod/lib/db/meetings.ts)
 */

import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { eq, desc } from "drizzle-orm";
import { createAuditLog } from "./audit";

export async function getMeetings(limit = 20) {
  return db
    .select({
      meeting: schema.meetings,
      creator: {
        id: schema.teamMembers.id,
        name: schema.teamMembers.name,
      },
    })
    .from(schema.meetings)
    .leftJoin(
      schema.teamMembers,
      eq(schema.meetings.createdBy, schema.teamMembers.id)
    )
    .orderBy(desc(schema.meetings.createdAt))
    .limit(limit);
}

export async function getMeeting(id: string) {
  const [meeting] = await db
    .select({
      meeting: schema.meetings,
      creator: {
        id: schema.teamMembers.id,
        name: schema.teamMembers.name,
      },
    })
    .from(schema.meetings)
    .leftJoin(
      schema.teamMembers,
      eq(schema.meetings.createdBy, schema.teamMembers.id)
    )
    .where(eq(schema.meetings.id, id))
    .limit(1);
  return meeting ?? null;
}

export async function createMeeting(
  data: {
    title?: string;
    scheduledAt?: Date;
    attendees?: Array<{ id: string; name: string }>;
    createdBy?: string;
  },
  actorId: string
) {
  const [meeting] = await db
    .insert(schema.meetings)
    .values({
      title: data.title ?? "L10 Meeting",
      scheduledAt: data.scheduledAt ?? new Date(),
      attendees: data.attendees ?? null,
      createdBy: data.createdBy ?? null,
    })
    .returning();

  await createAuditLog({
    actorId,
    actorType: "user",
    action: "create",
    entityType: "meeting",
    entityId: meeting.id,
    metadata: { title: meeting.title },
  });

  return meeting;
}

export async function updateMeeting(
  id: string,
  data: Partial<{
    title: string;
    status: "scheduled" | "in_progress" | "completed" | "cancelled";
    notes: string;
    actionItems: Array<{ text: string; assigneeId?: string; done: boolean }>;
    rating: number;
    startedAt: Date;
    endedAt: Date;
  }>,
  actorId: string
) {
  const [meeting] = await db
    .update(schema.meetings)
    .set(data)
    .where(eq(schema.meetings.id, id))
    .returning();

  if (meeting) {
    await createAuditLog({
      actorId,
      actorType: "user",
      action: "update",
      entityType: "meeting",
      entityId: id,
      metadata: { status: data.status },
    });
  }

  return meeting ?? null;
}
