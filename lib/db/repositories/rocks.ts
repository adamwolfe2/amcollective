/**
 * Rocks Repository — Quarterly objectives (EOS pattern)
 *
 * Adapted from TaskSpace rocks pattern (~/aimseod/lib/db/schema.sql)
 */

import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { eq, desc, and, count } from "drizzle-orm";
import { createAuditLog } from "./audit";

export async function getRocks(filters?: {
  quarter?: string;
  ownerId?: string;
  status?: string;
}) {
  const conditions = [];
  if (filters?.quarter) {
    conditions.push(eq(schema.rocks.quarter, filters.quarter));
  }
  if (filters?.ownerId) {
    conditions.push(eq(schema.rocks.ownerId, filters.ownerId));
  }
  if (filters?.status) {
    conditions.push(
      eq(
        schema.rocks.status,
        filters.status as "on_track" | "at_risk" | "off_track" | "done"
      )
    );
  }

  return db
    .select({
      rock: schema.rocks,
      owner: {
        id: schema.teamMembers.id,
        name: schema.teamMembers.name,
      },
    })
    .from(schema.rocks)
    .leftJoin(schema.teamMembers, eq(schema.rocks.ownerId, schema.teamMembers.id))
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(schema.rocks.createdAt));
}

export async function getRock(id: string) {
  const [rock] = await db
    .select({
      rock: schema.rocks,
      owner: {
        id: schema.teamMembers.id,
        name: schema.teamMembers.name,
      },
    })
    .from(schema.rocks)
    .leftJoin(schema.teamMembers, eq(schema.rocks.ownerId, schema.teamMembers.id))
    .where(eq(schema.rocks.id, id))
    .limit(1);
  return rock ?? null;
}

export async function createRock(
  data: {
    title: string;
    description?: string;
    ownerId?: string;
    projectId?: string;
    quarter: string;
    dueDate?: Date;
  },
  actorId: string
) {
  const [rock] = await db
    .insert(schema.rocks)
    .values({
      title: data.title,
      description: data.description ?? null,
      ownerId: data.ownerId ?? null,
      projectId: data.projectId ?? null,
      quarter: data.quarter,
      dueDate: data.dueDate ?? null,
    })
    .returning();

  await createAuditLog({
    actorId,
    actorType: "user",
    action: "create",
    entityType: "rock",
    entityId: rock.id,
    metadata: { title: data.title, quarter: data.quarter },
  });

  return rock;
}

export async function updateRock(
  id: string,
  data: Partial<{
    title: string;
    description: string;
    status: "on_track" | "at_risk" | "off_track" | "done";
    progress: number;
    ownerId: string;
    dueDate: Date;
  }>,
  actorId: string
) {
  const updateData: Record<string, unknown> = { ...data };
  if (data.status === "done") {
    updateData.completedAt = new Date();
    updateData.progress = 100;
  }

  const [rock] = await db
    .update(schema.rocks)
    .set(updateData)
    .where(eq(schema.rocks.id, id))
    .returning();

  if (rock) {
    await createAuditLog({
      actorId,
      actorType: "user",
      action: "update",
      entityType: "rock",
      entityId: id,
      metadata: data,
    });
  }

  return rock ?? null;
}

export async function getRockCount(quarter?: string) {
  const conditions = quarter
    ? [eq(schema.rocks.quarter, quarter)]
    : [];
  const [result] = await db
    .select({ count: count() })
    .from(schema.rocks)
    .where(conditions.length > 0 ? and(...conditions) : undefined);
  return result?.count ?? 0;
}

export function getCurrentQuarter(): string {
  const now = new Date();
  const q = Math.ceil((now.getMonth() + 1) / 3);
  return `Q${q} ${now.getFullYear()}`;
}
