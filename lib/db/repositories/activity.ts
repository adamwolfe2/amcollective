import { db } from "@/lib/db";
import { auditLogs } from "@/lib/db/schema";
import { desc, eq } from "drizzle-orm";

export type AuditLog = typeof auditLogs.$inferSelect;

export async function getRecentActivity(limit = 10) {
  return db
    .select()
    .from(auditLogs)
    .orderBy(desc(auditLogs.createdAt))
    .limit(limit);
}

export async function getEntityActivity(_entityType: string, entityId: string) {
  return db
    .select()
    .from(auditLogs)
    .where(eq(auditLogs.entityId, entityId))
    .orderBy(desc(auditLogs.createdAt))
    .limit(20);
}
