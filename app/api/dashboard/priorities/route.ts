/**
 * Dashboard Priorities API
 *
 * Returns the top 5 highest-priority action items for today.
 * Pure DB query — no AI call, loads fast, gives users a daily anchor.
 *
 * Priority order:
 *   1. Overdue invoices (by days overdue)
 *   2. Active high-priority strategy recommendations
 *   3. Unresolved critical/warning alerts
 *   4. Tasks due today or tomorrow
 */

import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { eq, and, sql, desc, lte, gte, isNull } from "drizzle-orm";
import { checkAdmin } from "@/lib/auth";

export type PriorityUrgency = "critical" | "high" | "normal";

export interface PriorityItem {
  id: string;
  type: "invoice" | "task" | "alert" | "recommendation";
  label: string;
  subtext: string;
  urgency: PriorityUrgency;
  href: string;
}

export async function GET() {
  const userId = await checkAdmin();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = new Date();
  const tomorrow = new Date(now.getTime() + 48 * 60 * 60 * 1000);

  const [overdueInvoices, highPriorityRecs, unresolvedAlerts, dueSoonTasks] =
    await Promise.all([
      // 1. Overdue invoices — sorted by oldest first
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
        .limit(3),

      // 2. Active strategy recommendations — priority 2 (urgent) first
      db
        .select({
          id: schema.strategyRecommendations.id,
          title: schema.strategyRecommendations.title,
          type: schema.strategyRecommendations.type,
          priority: schema.strategyRecommendations.priority,
          product: schema.strategyRecommendations.product,
        })
        .from(schema.strategyRecommendations)
        .where(
          and(
            eq(schema.strategyRecommendations.status, "active"),
            gte(schema.strategyRecommendations.priority, 1)
          )
        )
        .orderBy(desc(schema.strategyRecommendations.priority))
        .limit(3),

      // 3. Unresolved critical/warning alerts
      db
        .select({
          id: schema.alerts.id,
          type: schema.alerts.type,
          severity: schema.alerts.severity,
          message: schema.alerts.message,
        })
        .from(schema.alerts)
        .where(
          and(
            isNull(schema.alerts.resolvedAt),
            sql`${schema.alerts.severity} IN ('critical', 'warning')`
          )
        )
        .orderBy(desc(schema.alerts.severity))
        .limit(3),

      // 4. Tasks due today or tomorrow (not done)
      db
        .select({
          id: schema.tasks.id,
          title: schema.tasks.title,
          dueDate: schema.tasks.dueDate,
          status: schema.tasks.status,
        })
        .from(schema.tasks)
        .where(
          and(
            sql`${schema.tasks.status} NOT IN ('done', 'cancelled')`,
            gte(schema.tasks.dueDate, now),
            lte(schema.tasks.dueDate, tomorrow)
          )
        )
        .orderBy(schema.tasks.dueDate)
        .limit(3),
    ]);

  const items: PriorityItem[] = [];

  // Overdue invoices
  for (const inv of overdueInvoices) {
    const daysOverdue = inv.dueDate
      ? Math.floor((now.getTime() - new Date(inv.dueDate).getTime()) / 86400000)
      : 0;
    const amount = (inv.amount / 100).toLocaleString("en-US", {
      style: "currency",
      currency: "USD",
      maximumFractionDigits: 0,
    });
    items.push({
      id: inv.id,
      type: "invoice",
      label: `Invoice overdue ${daysOverdue}d`,
      subtext: `${inv.clientName ?? "Unknown"} — ${amount}`,
      urgency: daysOverdue > 10 ? "critical" : "high",
      href: `/invoices/${inv.id}`,
    });
  }

  // Strategy recommendations
  for (const rec of highPriorityRecs) {
    items.push({
      id: rec.id,
      type: "recommendation",
      label: rec.title,
      subtext: [rec.product ?? "platform-wide", rec.type.replace("_", " ")]
        .join(" · "),
      urgency: rec.priority >= 2 ? "critical" : "high",
      href: "/strategy",
    });
  }

  // Alerts
  for (const alert of unresolvedAlerts) {
    items.push({
      id: alert.id,
      type: "alert",
      label: alert.message ?? alert.type,
      subtext: alert.type,
      urgency: alert.severity === "critical" ? "critical" : "high",
      href: "/alerts",
    });
  }

  // Tasks due soon
  for (const task of dueSoonTasks) {
    const dueLabel = task.dueDate
      ? new Date(task.dueDate).toLocaleDateString("en-US", {
          month: "short",
          day: "numeric",
        })
      : "soon";
    items.push({
      id: task.id,
      type: "task",
      label: task.title,
      subtext: `Due ${dueLabel}`,
      urgency: "normal",
      href: `/tasks/${task.id}`,
    });
  }

  // Sort: critical → high → normal, cap at 5
  const urgencyOrder: Record<PriorityUrgency, number> = {
    critical: 0,
    high: 1,
    normal: 2,
  };
  items.sort((a, b) => urgencyOrder[a.urgency] - urgencyOrder[b.urgency]);

  return NextResponse.json({ items: items.slice(0, 5) });
}
