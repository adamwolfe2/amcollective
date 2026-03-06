/**
 * Dashboard Summary API — Aggregates all metrics from DB snapshots.
 *
 * GET: Returns combined revenue, cash, client, invoice, project, and activity data.
 * Auth: owner or admin only.
 *
 * Decision: Reads from DB only (mercuryAccounts, subscriptions, invoices, posthogSnapshots,
 * portfolioProjects, auditLogs). Never calls external APIs directly — Inngest sync jobs
 * keep the data fresh.
 */

import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { eq, desc, and, sql, count, gte, lte, asc } from "drizzle-orm";
import { checkAdmin } from "@/lib/auth";
import { captureError } from "@/lib/errors";
import * as stripeConnector from "@/lib/connectors/stripe";
import * as mercuryConnector from "@/lib/connectors/mercury";
import type { ConnectorResult } from "@/lib/connectors/base";

// ─── Timeout Wrapper ─────────────────────────────────────────────────────────

function withTimeout<T>(
  promise: Promise<ConnectorResult<T>>,
  ms: number,
  label: string
): Promise<ConnectorResult<T>> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms)
    ),
  ]).catch((err) => {
    captureError(err, {
      tags: { route: "dashboard-summary", connector: label },
      level: "warning",
    });
    return { success: false as const, error: String(err), fetchedAt: new Date() };
  });
}

export async function GET() {
  const userId = await checkAdmin();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
  const now = new Date();
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const fourteenDaysAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);
  const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

  const [
    // Revenue (live from Stripe)
    stripeData,
    failedPaymentsResult,
    // Cash (live from Mercury)
    mercuryResult,
    // Clients
    totalClientsResult,
    activeClientsResult,
    // Invoices
    overdueInvoices,
    upcomingInvoices,
    // Projects
    projects,
    // Activity (last 24h)
    recentActivity,
    // PostHog
    posthogData,
    // Delta snapshots
    sevenDaySnapshots,
    // Stale clients (no kanban card movement in 7+ days)
    staleClients,
  ] = await Promise.all([
    // MRR + active subscriptions — live from Stripe (5s timeout)
    withTimeout(stripeConnector.getMRR(), 5000, "stripe-mrr"),
    // Failed payments in last 14 days
    db
      .select({ value: count() })
      .from(schema.payments)
      .where(
        and(
          eq(schema.payments.status, "failed"),
          gte(schema.payments.paymentDate, fourteenDaysAgo)
        )
      ),
    // Mercury accounts — live from API (5s timeout)
    withTimeout(mercuryConnector.getAccounts(), 5000, "mercury-accounts"),
    // Total clients
    db.select({ value: count() }).from(schema.clients),
    // Active clients (at least one non-completed kanban card)
    db
      .select({ value: sql<number>`COUNT(DISTINCT ${schema.kanbanCards.clientId})` })
      .from(schema.kanbanCards)
      .where(sql`${schema.kanbanCards.completedAt} IS NULL`),
    // Overdue invoices
    db
      .select({
        id: schema.invoices.id,
        clientName: schema.clients.name,
        amount: schema.invoices.amount,
        dueDate: schema.invoices.dueDate,
      })
      .from(schema.invoices)
      .leftJoin(schema.clients, eq(schema.invoices.clientId, schema.clients.id))
      .where(eq(schema.invoices.status, "overdue"))
      .orderBy(schema.invoices.dueDate)
      .limit(10),
    // Upcoming invoices (due in 14 days)
    db
      .select({
        id: schema.invoices.id,
        clientName: schema.clients.name,
        amount: schema.invoices.amount,
        dueDate: schema.invoices.dueDate,
      })
      .from(schema.invoices)
      .leftJoin(schema.clients, eq(schema.invoices.clientId, schema.clients.id))
      .where(
        and(
          sql`${schema.invoices.status} IN ('open', 'sent')`,
          gte(schema.invoices.dueDate, now),
          lte(schema.invoices.dueDate, new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000))
        )
      )
      .orderBy(schema.invoices.dueDate)
      .limit(10),
    // Portfolio projects
    db
      .select({
        id: schema.portfolioProjects.id,
        name: schema.portfolioProjects.name,
        status: schema.portfolioProjects.status,
      })
      .from(schema.portfolioProjects),
    // Recent audit log entries (last 24h)
    db
      .select()
      .from(schema.auditLogs)
      .where(gte(schema.auditLogs.createdAt, twentyFourHoursAgo))
      .orderBy(desc(schema.auditLogs.createdAt))
      .limit(20),
    // PostHog snapshots (latest per project)
    db
      .select({
        projectId: schema.posthogSnapshots.projectId,
        dau: schema.posthogSnapshots.dau,
        projectName: schema.portfolioProjects.name,
        snapshotDate: schema.posthogSnapshots.snapshotDate,
      })
      .from(schema.posthogSnapshots)
      .innerJoin(
        schema.portfolioProjects,
        eq(schema.posthogSnapshots.projectId, schema.portfolioProjects.id)
      )
      .orderBy(desc(schema.posthogSnapshots.snapshotDate))
      .limit(20),
    // 7-day metric snapshots for delta calculation
    db
      .select()
      .from(schema.dailyMetricsSnapshots)
      .where(gte(schema.dailyMetricsSnapshots.date, sevenDaysAgo))
      .orderBy(asc(schema.dailyMetricsSnapshots.date))
      .limit(2),
    // Clients with kanban cards — find those with no card movement in 7+ days
    db
      .select({
        clientId: schema.clients.id,
        clientName: schema.clients.name,
        lastCardUpdate: sql<Date>`MAX(${schema.kanbanCards.updatedAt})`,
        currentColumn: sql<string>`(
          SELECT ${schema.kanbanColumns.name}
          FROM ${schema.kanbanColumns}
          WHERE ${schema.kanbanColumns.id} = (
            SELECT ${schema.kanbanCards.columnId}
            FROM ${schema.kanbanCards}
            WHERE ${schema.kanbanCards.clientId} = ${schema.clients.id}
            ORDER BY ${schema.kanbanCards.updatedAt} DESC
            LIMIT 1
          )
        )`,
      })
      .from(schema.clients)
      .innerJoin(
        schema.kanbanCards,
        eq(schema.kanbanCards.clientId, schema.clients.id)
      )
      .groupBy(schema.clients.id, schema.clients.name)
      .having(sql`MAX(${schema.kanbanCards.updatedAt}) < ${sevenDaysAgo}`),
  ]);

  // Process Mercury
  const mercuryAccounts = mercuryResult.success ? (mercuryResult.data ?? []) : [];
  const totalCash = mercuryAccounts.reduce((s, a) => s + a.currentBalance, 0);

  // Process MRR
  const mrr = stripeData.success ? (stripeData.data?.mrr ?? 0) : 0;
  const activeSubscriptionsCount = stripeData.success ? (stripeData.data?.activeSubscriptions ?? 0) : 0;
  const arr = mrr * 12;

  // Process overdue invoices
  const totalOverdueAmount = overdueInvoices.reduce(
    (s, inv) => s + inv.amount,
    0
  );

  // Process PostHog — deduplicate to latest per project
  const latestByProject = new Map<string, { dau: number; name: string }>();
  for (const snap of posthogData) {
    if (!latestByProject.has(snap.projectId)) {
      latestByProject.set(snap.projectId, {
        dau: snap.dau ?? 0,
        name: snap.projectName,
      });
    }
  }
  const dauByProduct = Array.from(latestByProject.entries()).map(
    ([, data]) => ({
      product: data.name,
      dau: data.dau,
      change: 0,
    })
  );
  const totalDailyActiveUsers = dauByProduct.reduce(
    (s, p) => s + p.dau,
    0
  );

  // Process activity feed
  const recentActivityFormatted = recentActivity.map((entry) => ({
    type: mapActionToType(entry.action),
    description: `${entry.action} — ${entry.entityType}`,
    companyTag: "am_collective",
    timestamp: entry.createdAt.toISOString(),
    entityId: entry.entityId,
    entityType: entry.entityType,
  }));

  // Process stale clients
  const clientsNeedingAttention = staleClients.map((c) => ({
    id: c.clientId,
    name: c.clientName,
    daysSinceActivity: Math.floor(
      (now.getTime() - new Date(c.lastCardUpdate).getTime()) /
        (1000 * 60 * 60 * 24)
    ),
    currentColumn: c.currentColumn ?? "Unknown",
  }));

  const activeProjects = projects.filter((p) => p.status === "active");

  let mrrChange: number | null = null;
  let cashChange: number | null = null;
  if (sevenDaySnapshots.length >= 2) {
    const oldest = sevenDaySnapshots[0];
    const newest = sevenDaySnapshots[sevenDaySnapshots.length - 1];
    if (oldest.mrr > 0) {
      mrrChange = ((newest.mrr - oldest.mrr) / oldest.mrr) * 100;
    }
    if (oldest.totalCash > 0) {
      cashChange = ((newest.totalCash - oldest.totalCash) / oldest.totalCash) * 100;
    }
  }

  const summary = {
    mrr: mrr / 100,
    arr: arr / 100,
    mrrChange,
    activeSubscriptions: activeSubscriptionsCount,
    failedPayments: failedPaymentsResult[0]?.value ?? 0,
    totalCash,
    cashChange,
    runway: 0,
    totalClients: totalClientsResult[0]?.value ?? 0,
    activeClients: Number(activeClientsResult[0]?.value ?? 0),
    clientsNeedingAttention,
    overdueInvoices: overdueInvoices.map((inv) => ({
      id: inv.id,
      clientName: inv.clientName ?? "Unknown",
      amount: inv.amount / 100,
      daysOverdue: inv.dueDate
        ? Math.floor(
            (now.getTime() - new Date(inv.dueDate).getTime()) /
              (1000 * 60 * 60 * 24)
          )
        : 0,
    })),
    totalOverdueAmount: totalOverdueAmount / 100,
    upcomingInvoices: upcomingInvoices.map((inv) => ({
      id: inv.id,
      clientName: inv.clientName ?? "Unknown",
      amount: inv.amount / 100,
      dueDate: inv.dueDate?.toISOString() ?? null,
    })),
    totalProjects: activeProjects.length,
    projectsWithErrors: [] as { id: string; name: string; lastDeployStatus: string }[],
    recentActivity: recentActivityFormatted,
    totalDailyActiveUsers,
    dauByProduct,
    upcomingRenewals: [],
    generatedAt: now.toISOString(),
  };

  return NextResponse.json(summary);
  } catch (error) {
    captureError(error, {
      tags: { route: "dashboard-summary" },
      level: "error",
    });
    return NextResponse.json(
      { error: "Failed to load dashboard summary" },
      { status: 500 }
    );
  }
}

function mapActionToType(action: string): string {
  if (action.includes("payment") || action.includes("paid")) return "payment";
  if (action.includes("client") || action.includes("create_client"))
    return "client_added";
  if (action.includes("card") || action.includes("move")) return "card_moved";
  if (action.includes("document") || action.includes("upload"))
    return "document_uploaded";
  if (action.includes("invoice") || action.includes("send"))
    return "invoice_sent";
  if (action.includes("deploy") || action.includes("fail"))
    return "deploy_failed";
  return "payment";
}
