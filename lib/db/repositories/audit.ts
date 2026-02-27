"use server";

import { db } from "@/lib/db";
import { auditLogs } from "@/lib/db/schema";

export async function createAuditLog(opts: {
  actorId: string;
  actorType: "user" | "system" | "agent";
  action: string;
  entityType: string;
  entityId: string;
  metadata?: Record<string, unknown>;
}) {
  await db.insert(auditLogs).values({
    actorId: opts.actorId,
    actorType: opts.actorType,
    action: opts.action,
    entityType: opts.entityType,
    entityId: opts.entityId,
    metadata: opts.metadata ?? null,
  });
}
