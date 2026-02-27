import { db } from "@/lib/db";
import { services } from "@/lib/db/schema";
import { eq, asc } from "drizzle-orm";
import { createAuditLog } from "./audit";

export type Service = typeof services.$inferSelect;
export type NewService = typeof services.$inferInsert;

export async function getServices() {
  return db.select().from(services).orderBy(asc(services.sortOrder));
}

export async function getService(id: string) {
  const result = await db.select().from(services).where(eq(services.id, id));
  return result[0] ?? null;
}

export async function createService(data: NewService, actorId: string) {
  const result = await db.insert(services).values(data).returning();
  const service = result[0];
  await createAuditLog({
    actorId,
    actorType: "user",
    action: "create",
    entityType: "service",
    entityId: service.id,
    metadata: { name: service.name },
  });
  return service;
}

export async function updateService(
  id: string,
  data: Partial<NewService>,
  actorId: string
) {
  const result = await db
    .update(services)
    .set(data)
    .where(eq(services.id, id))
    .returning();
  const service = result[0];
  if (service) {
    await createAuditLog({
      actorId,
      actorType: "user",
      action: "update",
      entityType: "service",
      entityId: service.id,
      metadata: { fields: Object.keys(data) },
    });
  }
  return service ?? null;
}

export async function deleteService(id: string, actorId: string) {
  await createAuditLog({
    actorId,
    actorType: "user",
    action: "delete",
    entityType: "service",
    entityId: id,
  });
  await db.delete(services).where(eq(services.id, id));
}
