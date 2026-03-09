/**
 * GET /api/voice/briefing -- Voice-ready comprehensive business briefing.
 * Returns a single structured response optimized for text-to-speech consumption.
 * Aggregates all critical business data in one call.
 */

import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { eq, sql, count, and, gte, lte } from "drizzle-orm";
import { checkAdmin } from "@/lib/auth";
import { captureError } from "@/lib/errors";

export async function GET() {
  try {
    const userId = await checkAdmin();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    const [
      // Revenue
      mrrResult,
      // Cash
      mercuryAccounts,
      // Clients
      totalClients,
      activeClients,
      // Invoices
      overdueInvoices,
      openInvoices,
      // Leads
      activePipeline,
      overdueFollowUps,
      // Tasks
      inProgressTasks,
      overdueTasks,
      // Contracts
      pendingSignature,
      // Alerts
      unresolvedAlerts,
      // Messages
      unreadMessages,
      // Activity (today)
      todayActivity,
      // Online team
      onlineUsers,
    ] = await Promise.all([
      // MRR
      db.select({ total: sql<number>`COALESCE(SUM(${schema.subscriptions.amount}), 0)` })
        .from(schema.subscriptions).where(eq(schema.subscriptions.status, "active")),
      // Cash
      db.select().from(schema.mercuryAccounts),
      // Total clients
      db.select({ count: count() }).from(schema.clients),
      // Active clients
      db.select({ count: sql<number>`COUNT(DISTINCT ${schema.kanbanCards.clientId})` })
        .from(schema.kanbanCards).where(sql`${schema.kanbanCards.completedAt} IS NULL`),
      // Overdue invoices
      db.select({ count: count(), total: sql<number>`COALESCE(SUM(${schema.invoices.amount}), 0)` })
        .from(schema.invoices).where(eq(schema.invoices.status, "overdue")),
      // Open invoices
      db.select({ count: count() }).from(schema.invoices)
        .where(sql`${schema.invoices.status} IN ('draft', 'sent')`),
      // Active pipeline
      db.select({ count: count(), totalValue: sql<number>`COALESCE(SUM(${schema.leads.estimatedValue}), 0)` })
        .from(schema.leads).where(and(eq(schema.leads.isArchived, false), sql`${schema.leads.stage} NOT IN ('closed_won', 'closed_lost')`)),
      // Overdue follow-ups
      db.select({ count: count() }).from(schema.leads)
        .where(and(eq(schema.leads.isArchived, false), lte(schema.leads.nextFollowUpAt, now))),
      // In-progress tasks
      db.select({ count: count() }).from(schema.tasks)
        .where(and(eq(schema.tasks.isArchived, false), eq(schema.tasks.status, "in_progress"))),
      // Overdue tasks
      db.select({ count: count() }).from(schema.tasks)
        .where(and(eq(schema.tasks.isArchived, false), lte(schema.tasks.dueDate, now), sql`${schema.tasks.status} NOT IN ('done', 'cancelled')`)),
      // Pending signature contracts
      db.select({ count: count() }).from(schema.contracts)
        .where(sql`${schema.contracts.status} IN ('sent', 'viewed')`),
      // Unresolved alerts
      db.select({ count: count() }).from(schema.alerts).where(eq(schema.alerts.isResolved, false)),
      // Unread messages
      db.select({ count: count() }).from(schema.messages).where(eq(schema.messages.isRead, false)),
      // Today's activity
      db.select({ count: count() }).from(schema.auditLogs).where(gte(schema.auditLogs.createdAt, today)),
      // Online users
      db.select({ count: count() }).from(schema.userPresence)
        .where(gte(schema.userPresence.lastHeartbeat, new Date(now.getTime() - 2 * 60 * 1000))),
    ]);

    const mrr = Number(mrrResult[0]?.total ?? 0) / 100;
    const totalCash = mercuryAccounts.reduce((s, a) => s + Number(a.balance), 0) / 100;
    const overdueAmount = Number(overdueInvoices[0]?.total ?? 0) / 100;
    const pipelineValue = Number(activePipeline[0]?.totalValue ?? 0) / 100;

    // Build voice-friendly summary
    const summary = {
      greeting: `Good ${now.getHours() < 12 ? "morning" : now.getHours() < 17 ? "afternoon" : "evening"}.`,
      revenue: {
        mrr,
        arr: mrr * 12,
        totalCash,
      },
      clients: {
        total: totalClients[0]?.count ?? 0,
        active: Number(activeClients[0]?.count ?? 0),
      },
      invoices: {
        overdue: overdueInvoices[0]?.count ?? 0,
        overdueAmount,
        open: openInvoices[0]?.count ?? 0,
      },
      pipeline: {
        activeLeads: activePipeline[0]?.count ?? 0,
        pipelineValue,
        overdueFollowUps: overdueFollowUps[0]?.count ?? 0,
      },
      tasks: {
        inProgress: inProgressTasks[0]?.count ?? 0,
        overdue: overdueTasks[0]?.count ?? 0,
      },
      contracts: {
        pendingSignature: pendingSignature[0]?.count ?? 0,
      },
      alerts: {
        unresolved: unresolvedAlerts[0]?.count ?? 0,
      },
      messages: {
        unread: unreadMessages[0]?.count ?? 0,
      },
      activity: {
        todayCount: todayActivity[0]?.count ?? 0,
      },
      team: {
        online: onlineUsers[0]?.count ?? 0,
      },
      generatedAt: now.toISOString(),
    };

    // Build natural language briefing
    const lines: string[] = [summary.greeting];
    lines.push(`MRR is $${mrr.toLocaleString()}, cash position is $${totalCash.toLocaleString()}.`);

    if (overdueInvoices[0]?.count) {
      lines.push(`You have ${overdueInvoices[0].count} overdue invoice${overdueInvoices[0].count > 1 ? "s" : ""} totaling $${overdueAmount.toLocaleString()}.`);
    }

    if (activePipeline[0]?.count) {
      lines.push(`Pipeline has ${activePipeline[0].count} active lead${Number(activePipeline[0].count) > 1 ? "s" : ""} worth $${pipelineValue.toLocaleString()}.`);
    }

    if (overdueFollowUps[0]?.count) {
      lines.push(`${overdueFollowUps[0].count} lead follow-up${Number(overdueFollowUps[0].count) > 1 ? "s are" : " is"} overdue.`);
    }

    if (overdueTasks[0]?.count) {
      lines.push(`${overdueTasks[0].count} task${Number(overdueTasks[0].count) > 1 ? "s are" : " is"} past due.`);
    }

    if (pendingSignature[0]?.count) {
      lines.push(`${pendingSignature[0].count} contract${Number(pendingSignature[0].count) > 1 ? "s" : ""} awaiting signature.`);
    }

    if (unresolvedAlerts[0]?.count) {
      lines.push(`${unresolvedAlerts[0].count} unresolved alert${Number(unresolvedAlerts[0].count) > 1 ? "s" : ""}.`);
    }

    return NextResponse.json({
      ...summary,
      briefing: lines.join(" "),
    });
  } catch (error) {
    captureError(error);
    return NextResponse.json(
      { error: "Failed to generate briefing" },
      { status: 500 }
    );
  }
}
