import { db } from "@/lib/db";
import { invoices, clients, subscriptions, payments } from "@/lib/db/schema";
import { eq, desc, count, sql, and } from "drizzle-orm";
import { createAuditLog } from "./audit";

export type Invoice = typeof invoices.$inferSelect;
export type NewInvoice = typeof invoices.$inferInsert;

export type InvoiceWithClient = Invoice & {
  clientName: string | null;
  clientCompany: string | null;
};

export async function getInvoices(opts?: {
  status?: string;
  clientId?: string;
  limit?: number;
  offset?: number;
}) {
  const conditions = [];
  if (opts?.status) {
    conditions.push(eq(invoices.status, opts.status as Invoice["status"]));
  }
  if (opts?.clientId) {
    conditions.push(eq(invoices.clientId, opts.clientId));
  }

  const query = db
    .select({
      invoice: invoices,
      clientName: clients.name,
      clientCompany: clients.companyName,
    })
    .from(invoices)
    .leftJoin(clients, eq(invoices.clientId, clients.id))
    .orderBy(desc(invoices.createdAt))
    .limit(opts?.limit ?? 50)
    .offset(opts?.offset ?? 0);

  if (conditions.length > 0) {
    return query.where(and(...conditions));
  }
  return query;
}

export async function getInvoiceCount() {
  const result = await db.select({ value: count() }).from(invoices);
  return result[0]?.value ?? 0;
}

export async function getOpenInvoiceStats() {
  const result = await db
    .select({
      count: count(),
      total: sql<number>`coalesce(sum(${invoices.amount}), 0)`,
    })
    .from(invoices)
    .where(
      sql`${invoices.status} IN ('draft', 'sent', 'overdue')`
    );
  return {
    count: result[0]?.count ?? 0,
    totalCents: Number(result[0]?.total ?? 0),
  };
}

export async function getInvoice(id: string) {
  const result = await db
    .select({
      invoice: invoices,
      clientName: clients.name,
      clientCompany: clients.companyName,
      clientEmail: clients.email,
    })
    .from(invoices)
    .leftJoin(clients, eq(invoices.clientId, clients.id))
    .where(eq(invoices.id, id));
  return result[0] ?? null;
}

export async function getClientInvoices(clientId: string) {
  return db
    .select()
    .from(invoices)
    .where(eq(invoices.clientId, clientId))
    .orderBy(desc(invoices.createdAt));
}

export async function createInvoice(data: NewInvoice, actorId: string) {
  const result = await db.insert(invoices).values(data).returning();
  const invoice = result[0];
  await createAuditLog({
    actorId,
    actorType: "user",
    action: "create",
    entityType: "invoice",
    entityId: invoice.id,
    metadata: {
      number: invoice.number,
      amount: invoice.amount,
      clientId: invoice.clientId,
    },
  });
  return invoice;
}

export async function updateInvoice(
  id: string,
  data: Partial<NewInvoice>,
  actorId: string
) {
  const result = await db
    .update(invoices)
    .set(data)
    .where(eq(invoices.id, id))
    .returning();
  const invoice = result[0];
  if (invoice) {
    await createAuditLog({
      actorId,
      actorType: "user",
      action: "update",
      entityType: "invoice",
      entityId: invoice.id,
      metadata: { fields: Object.keys(data) },
    });
  }
  return invoice ?? null;
}

export async function markInvoicePaid(id: string, actorId: string) {
  const result = await db
    .update(invoices)
    .set({ status: "paid", paidAt: new Date() })
    .where(eq(invoices.id, id))
    .returning();
  const invoice = result[0];
  if (invoice) {
    await createAuditLog({
      actorId,
      actorType: "user",
      action: "mark_paid",
      entityType: "invoice",
      entityId: invoice.id,
      metadata: { amount: invoice.amount },
    });
  }
  return invoice ?? null;
}

export async function sendInvoice(id: string, actorId: string) {
  const result = await db
    .update(invoices)
    .set({ status: "sent" })
    .where(eq(invoices.id, id))
    .returning();
  const invoice = result[0];
  if (invoice) {
    await createAuditLog({
      actorId,
      actorType: "user",
      action: "send",
      entityType: "invoice",
      entityId: invoice.id,
    });
  }
  return invoice ?? null;
}

export async function getBillingKpis() {
  const [mrrResult, revenueThisMonth, outstanding, overdue, activeClients] =
    await Promise.all([
      // MRR: sum of active subscription amounts
      db
        .select({
          total: sql<number>`COALESCE(SUM(${subscriptions.amount}), 0)`,
        })
        .from(subscriptions)
        .where(eq(subscriptions.status, "active")),
      // Revenue this month: sum of paid invoices with paidAt in current month
      db
        .select({
          total: sql<number>`COALESCE(SUM(${invoices.amount}), 0)`,
        })
        .from(invoices)
        .where(
          and(
            eq(invoices.status, "paid"),
            sql`${invoices.paidAt} >= date_trunc('month', now())`
          )
        ),
      // Outstanding: sum of open invoices
      db
        .select({
          count: count(),
          total: sql<number>`COALESCE(SUM(${invoices.amount}), 0)`,
        })
        .from(invoices)
        .where(sql`${invoices.status} IN ('open', 'sent')`),
      // Overdue: sum of overdue invoices
      db
        .select({
          count: count(),
          total: sql<number>`COALESCE(SUM(${invoices.amount}), 0)`,
        })
        .from(invoices)
        .where(eq(invoices.status, "overdue")),
      // Active clients: clients with healthy payment or positive MRR
      db
        .select({ value: count() })
        .from(clients)
        .where(
          sql`${clients.paymentStatus} = 'healthy' OR ${clients.currentMrr} > 0`
        ),
    ]);

  return {
    mrr: Number(mrrResult[0]?.total ?? 0),
    revenueThisMonth: Number(revenueThisMonth[0]?.total ?? 0),
    outstanding: {
      count: outstanding[0]?.count ?? 0,
      total: Number(outstanding[0]?.total ?? 0),
    },
    overdue: {
      count: overdue[0]?.count ?? 0,
      total: Number(overdue[0]?.total ?? 0),
    },
    activeClients: activeClients[0]?.value ?? 0,
  };
}

export async function getRevenueByMonth(months = 12) {
  const result = await db.execute(sql`
    SELECT
      TO_CHAR(DATE_TRUNC('month', ${invoices.paidAt}), 'YYYY-MM') as month,
      COALESCE(SUM(${invoices.amount}), 0)::int as revenue
    FROM ${invoices}
    WHERE ${invoices.status} = 'paid'
      AND ${invoices.paidAt} >= NOW() - INTERVAL '${sql.raw(String(months))} months'
    GROUP BY DATE_TRUNC('month', ${invoices.paidAt})
    ORDER BY month ASC
  `);
  return result.rows as { month: string; revenue: number }[];
}

export async function getRecentPayments(limit = 10) {
  return db
    .select({
      payment: payments,
      clientName: clients.name,
    })
    .from(payments)
    .leftJoin(clients, eq(payments.clientId, clients.id))
    .orderBy(desc(payments.paymentDate))
    .limit(limit);
}
