import { db } from "@/lib/db";
import { clients, clientProjects, engagements } from "@/lib/db/schema";
import { eq, desc, ilike, or, sql, count } from "drizzle-orm";
import { createAuditLog } from "./audit";

export type Client = typeof clients.$inferSelect;
export type NewClient = typeof clients.$inferInsert;

export async function getClients(opts?: {
  search?: string;
  limit?: number;
  offset?: number;
}) {
  const conditions = [];
  if (opts?.search) {
    conditions.push(
      or(
        ilike(clients.name, `%${opts.search}%`),
        ilike(clients.companyName, `%${opts.search}%`),
        ilike(clients.email, `%${opts.search}%`)
      )
    );
  }

  const query = db
    .select()
    .from(clients)
    .orderBy(desc(clients.createdAt))
    .limit(opts?.limit ?? 50)
    .offset(opts?.offset ?? 0);

  if (conditions.length > 0) {
    return query.where(conditions[0]);
  }
  return query;
}

export async function getClientCount() {
  const result = await db.select({ value: count() }).from(clients);
  return result[0]?.value ?? 0;
}

export async function getClient(id: string) {
  const result = await db.select().from(clients).where(eq(clients.id, id));
  return result[0] ?? null;
}

export async function getClientByClerkId(clerkUserId: string) {
  const result = await db
    .select()
    .from(clients)
    .where(eq(clients.clerkUserId, clerkUserId));
  return result[0] ?? null;
}

export async function createClient(data: NewClient, actorId: string) {
  const result = await db.insert(clients).values(data).returning();
  const client = result[0];
  await createAuditLog({
    actorId,
    actorType: "user",
    action: "create",
    entityType: "client",
    entityId: client.id,
    metadata: { name: client.name },
  });
  return client;
}

export async function updateClient(
  id: string,
  data: Partial<NewClient>,
  actorId: string
) {
  const result = await db
    .update(clients)
    .set(data)
    .where(eq(clients.id, id))
    .returning();
  const client = result[0];
  if (client) {
    await createAuditLog({
      actorId,
      actorType: "user",
      action: "update",
      entityType: "client",
      entityId: client.id,
      metadata: { fields: Object.keys(data) },
    });
  }
  return client ?? null;
}

export async function deleteClient(id: string, actorId: string) {
  await createAuditLog({
    actorId,
    actorType: "user",
    action: "delete",
    entityType: "client",
    entityId: id,
  });
  await db.delete(clients).where(eq(clients.id, id));
}

export async function getClientProjects(clientId: string) {
  return db
    .select()
    .from(clientProjects)
    .where(eq(clientProjects.clientId, clientId));
}

export async function getClientEngagements(clientId: string) {
  return db
    .select()
    .from(engagements)
    .where(eq(engagements.clientId, clientId))
    .orderBy(desc(engagements.createdAt));
}

export async function linkClientToProject(
  data: typeof clientProjects.$inferInsert,
  actorId: string
) {
  const result = await db.insert(clientProjects).values(data).returning();
  await createAuditLog({
    actorId,
    actorType: "user",
    action: "link_project",
    entityType: "client_project",
    entityId: result[0].id,
    metadata: { clientId: data.clientId, projectId: data.projectId },
  });
  return result[0];
}
