/**
 * Today's Priorities Widget
 *
 * Shows the 3-5 most important actions for today:
 * overdue invoices, strategy recommendations, alerts, tasks due soon.
 *
 * Queries the DB directly — no self-HTTP call, works correctly in
 * server components at build time and runtime.
 */

import Link from "next/link";
import { AlertTriangle, FileText, CheckSquare, Target, Zap } from "lucide-react";
import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { eq, and, sql, desc, lte, gte, isNull } from "drizzle-orm";

type PriorityUrgency = "critical" | "high" | "normal";

interface PriorityItem {
  id: string;
  type: "invoice" | "task" | "alert" | "recommendation";
  label: string;
  subtext: string;
  urgency: PriorityUrgency;
  href: string;
}

async function getPriorities(): Promise<PriorityItem[]> {
  const now = new Date();
  const tomorrow = new Date(now.getTime() + 48 * 60 * 60 * 1000);

  const [overdueInvoices, highPriorityRecs, unresolvedAlerts, dueSoonTasks] =
    await Promise.all([
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
        .limit(2),

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
        .limit(2),

      db
        .select({
          id: schema.tasks.id,
          title: schema.tasks.title,
          dueDate: schema.tasks.dueDate,
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
        .limit(2),
    ]);

  const items: PriorityItem[] = [];

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

  for (const rec of highPriorityRecs) {
    items.push({
      id: rec.id,
      type: "recommendation",
      label: rec.title,
      subtext: [rec.product ?? "platform-wide", rec.type.replace("_", " ")].join(" · "),
      urgency: rec.priority >= 2 ? "critical" : "high",
      href: "/strategy",
    });
  }

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

  const urgencyOrder: Record<PriorityUrgency, number> = {
    critical: 0,
    high: 1,
    normal: 2,
  };
  items.sort((a, b) => urgencyOrder[a.urgency] - urgencyOrder[b.urgency]);
  return items.slice(0, 5);
}

function typeIcon(type: PriorityItem["type"]) {
  const cls = "text-[#0A0A0A]/30";
  switch (type) {
    case "invoice": return <FileText size={11} className={cls} />;
    case "recommendation": return <Target size={11} className={cls} />;
    case "alert": return <AlertTriangle size={11} className={cls} />;
    case "task": return <CheckSquare size={11} className={cls} />;
  }
}

function urgencyDot(urgency: PriorityUrgency) {
  switch (urgency) {
    case "critical": return "bg-red-500";
    case "high": return "bg-amber-500";
    case "normal": return "bg-emerald-500";
  }
}

export async function PrioritiesWidget() {
  let items: PriorityItem[] = [];
  try {
    items = await getPriorities();
  } catch {
    // Fail silently — this widget is non-critical
    return null;
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <h3 className="font-mono text-[10px] uppercase tracking-wider text-[#0A0A0A]/40 flex items-center gap-1.5">
          <Zap size={10} />
          Today&apos;s Priorities
        </h3>
        {items.length === 0 && (
          <span className="font-mono text-[9px] text-emerald-600">All clear</span>
        )}
      </div>

      {items.length === 0 ? (
        <div className="border border-dashed border-[#0A0A0A]/10 py-3 text-center">
          <p className="font-mono text-[10px] text-[#0A0A0A]/30">No priority items today.</p>
        </div>
      ) : (
        <div className="border border-[#0A0A0A]/10 bg-white divide-y divide-[#0A0A0A]/5">
          {items.map((item) => (
            <Link
              key={item.id}
              href={item.href}
              className="px-3 py-2.5 flex items-start gap-2.5 hover:bg-[#0A0A0A]/[0.02] transition-colors block"
            >
              <span className={`w-1.5 h-1.5 rounded-full shrink-0 mt-1.5 ${urgencyDot(item.urgency)}`} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5 mb-0.5">
                  {typeIcon(item.type)}
                  <p className="font-mono text-[11px] font-medium text-[#0A0A0A] truncate">
                    {item.label}
                  </p>
                </div>
                <p className="font-serif text-[11px] text-[#0A0A0A]/50 truncate">
                  {item.subtext}
                </p>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
