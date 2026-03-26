import { db } from "@/lib/db";
import {
  clients,
  clientProjects,
  engagements,
  subscriptions,
  payments,
  invoices,
  kanbanColumns,
  DEFAULT_KANBAN_COLUMNS,
} from "@/lib/db/schema";
import { eq, desc, ilike, or, sql, count, and } from "drizzle-orm";
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

  // Seed default Kanban columns for new client
  await db.insert(kanbanColumns).values(
    DEFAULT_KANBAN_COLUMNS.map((col) => ({
      clientId: client.id,
      name: col.name,
      position: col.position,
      color: col.color,
      isDefault: true,
    }))
  );

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

export async function getClientSubscriptions(clientId: string) {
  return db
    .select()
    .from(subscriptions)
    .where(eq(subscriptions.clientId, clientId))
    .orderBy(desc(subscriptions.createdAt))
    .limit(100);
}

export async function getClientPayments(clientId: string, limit = 20) {
  return db
    .select()
    .from(payments)
    .where(eq(payments.clientId, clientId))
    .orderBy(desc(payments.paymentDate))
    .limit(limit);
}

export async function getClientBillingSummary(clientId: string) {
  const [invoiceStats, avgDaysToPay] = await Promise.all([
    // Total paid + total invoiced
    db
      .select({
        totalPaid: sql<number>`COALESCE(SUM(CASE WHEN ${invoices.status} = 'paid' THEN ${invoices.amount} ELSE 0 END), 0)`,
        totalInvoiced: sql<number>`COALESCE(SUM(${invoices.amount}), 0)`,
        invoiceCount: count(),
        paidCount: sql<number>`COALESCE(SUM(CASE WHEN ${invoices.status} = 'paid' THEN 1 ELSE 0 END), 0)`,
        outstandingCount: sql<number>`COALESCE(SUM(CASE WHEN ${invoices.status} IN ('open', 'sent', 'overdue') THEN 1 ELSE 0 END), 0)`,
        outstandingAmount: sql<number>`COALESCE(SUM(CASE WHEN ${invoices.status} IN ('open', 'sent', 'overdue') THEN ${invoices.amount} ELSE 0 END), 0)`,
      })
      .from(invoices)
      .where(eq(invoices.clientId, clientId)),
    // Average days to pay (paid invoices with due date)
    db
      .select({
        avgDays: sql<number>`COALESCE(AVG(EXTRACT(DAY FROM (${invoices.paidAt} - ${invoices.dueDate}::timestamp))), 0)`,
      })
      .from(invoices)
      .where(
        and(
          eq(invoices.clientId, clientId),
          eq(invoices.status, "paid"),
          sql`${invoices.dueDate} IS NOT NULL AND ${invoices.paidAt} IS NOT NULL`
        )
      ),
  ]);

  return {
    totalPaid: Number(invoiceStats[0]?.totalPaid ?? 0),
    totalInvoiced: Number(invoiceStats[0]?.totalInvoiced ?? 0),
    invoiceCount: invoiceStats[0]?.invoiceCount ?? 0,
    paidCount: Number(invoiceStats[0]?.paidCount ?? 0),
    outstandingCount: Number(invoiceStats[0]?.outstandingCount ?? 0),
    outstandingAmount: Number(invoiceStats[0]?.outstandingAmount ?? 0),
    avgDaysToPay: Math.round(Number(avgDaysToPay[0]?.avgDays ?? 0)),
  };
}
