// Command Center Dashboard
// Layout: Compact metrics strip → AI Chat (primary) + Actions/Quick Access (side panel)
// Charts live in their dedicated pages (Finance, Analytics) — 1 click away from sidebar

import { Suspense } from "react";
import Link from "next/link";
import { format, formatDistanceToNow } from "date-fns";
import { unstable_cache } from "next/cache";
import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { eq, and, sql, desc, gte, count, asc } from "drizzle-orm";
import * as vercelConnector from "@/lib/connectors/vercel";
import { getRecentActivity } from "@/lib/db/repositories/activity";
import { AiChat } from "@/components/ai-chat";
import { currentUser } from "@clerk/nextjs/server";
import {
  Users,
  FolderKanban,
  Receipt,
  Landmark,
  Crosshair,
  ListTodo,
  TrendingUp,
  LineChart,
  Send,
  FileCheck,
  Zap,
  Check,
} from "lucide-react";

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

function formatCurrency(amount: number) {
  return amount.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });
}

// ─── Cached data fetchers ───────────────────────────────────────────────────

const getCachedMrr = unstable_cache(
  async () => {
    const [result] = await db
      .select({
        total: sql<string>`COALESCE(SUM(${schema.subscriptions.amount}), 0)`,
      })
      .from(schema.subscriptions)
      .where(eq(schema.subscriptions.status, "active"));
    const [subsCount] = await db
      .select({ value: count() })
      .from(schema.subscriptions)
      .where(eq(schema.subscriptions.status, "active"));
    return {
      mrr: Number(result?.total ?? 0) / 100,
      activeSubs: subsCount?.value ?? 0,
    };
  },
  ["dashboard-mrr"],
  { revalidate: 300 }
);

const getCachedStaleClients = unstable_cache(
  async () => {
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    return db
      .select({
        clientId: schema.clients.id,
        clientName: schema.clients.name,
        lastCardUpdate: sql<Date>`MAX(${schema.kanbanCards.updatedAt})`,
      })
      .from(schema.clients)
      .innerJoin(
        schema.kanbanCards,
        eq(schema.kanbanCards.clientId, schema.clients.id)
      )
      .groupBy(schema.clients.id, schema.clients.name)
      .having(sql`MAX(${schema.kanbanCards.updatedAt}) < ${sevenDaysAgo}`)
      .limit(5);
  },
  ["dashboard-stale-clients"],
  { revalidate: 300 }
);

// ─── Sprint Widget ───────────────────────────────────────────────────────────

async function getCurrentSprint() {
  const sprints = await db
    .select()
    .from(schema.weeklySprints)
    .orderBy(desc(schema.weeklySprints.weekOf))
    .limit(1);

  if (!sprints.length) return null;
  const sprint = sprints[0];

  const sections = await db
    .select()
    .from(schema.sprintSections)
    .where(eq(schema.sprintSections.sprintId, sprint.id))
    .orderBy(asc(schema.sprintSections.sortOrder));

  const tasks = await db
    .select()
    .from(schema.sprintTasks)
    .orderBy(asc(schema.sprintTasks.sortOrder));

  const tasksBySectionId = new Map<
    string,
    { total: number; done: number }
  >();
  for (const task of tasks) {
    const curr = tasksBySectionId.get(task.sectionId) ?? {
      total: 0,
      done: 0,
    };
    tasksBySectionId.set(task.sectionId, {
      total: curr.total + 1,
      done: curr.done + (task.isCompleted ? 1 : 0),
    });
  }

  const totalTasks = tasks.length;
  const doneTasks = tasks.filter((t) => t.isCompleted).length;

  return { sprint, sections, tasksBySectionId, totalTasks, doneTasks };
}

async function SprintWidget() {
  try {
    const data = await getCurrentSprint();
    if (!data) {
      return (
        <div>
          <div className="flex items-center justify-between mb-2">
            <h3 className="font-mono text-[10px] uppercase tracking-wider text-[#0A0A0A]/40 flex items-center gap-1.5">
              <Zap size={10} />
              Weekly Sprint
            </h3>
            <Link
              href="/sprints"
              className="font-mono text-[10px] text-[#0A0A0A]/40 hover:text-[#0A0A0A]/60"
            >
              New sprint →
            </Link>
          </div>
          <div className="border border-dashed border-[#0A0A0A]/10 py-4 text-center">
            <p className="font-mono text-[10px] text-[#0A0A0A]/30">
              No sprint this week.{" "}
              <Link href="/sprints" className="underline">
                Create one →
              </Link>
            </p>
          </div>
        </div>
      );
    }

    const { sprint, sections, tasksBySectionId, totalTasks, doneTasks } = data;
    const pct =
      totalTasks > 0 ? Math.round((doneTasks / totalTasks) * 100) : 0;

    return (
      <div>
        <div className="flex items-center justify-between mb-2">
          <h3 className="font-mono text-[10px] uppercase tracking-wider text-[#0A0A0A]/40 flex items-center gap-1.5">
            <Zap size={10} />
            Weekly Sprint
          </h3>
          <Link
            href={`/sprints/${sprint.id}`}
            className="font-mono text-[10px] text-[#0A0A0A]/40 hover:text-[#0A0A0A]/60"
          >
            Open →
          </Link>
        </div>
        <div className="border border-[#0A0A0A]/10 bg-white">
          {/* Sprint header */}
          <div className="px-3 py-2.5 border-b border-[#0A0A0A]/5">
            <p className="font-serif font-bold text-[#0A0A0A] text-sm">
              {sprint.title}
            </p>
            {sprint.weeklyFocus && (
              <p className="font-mono text-[9px] uppercase tracking-wider text-[#0A0A0A]/40 mt-0.5">
                {sprint.weeklyFocus}
              </p>
            )}
          </div>
          {/* Progress bar */}
          {totalTasks > 0 && (
            <div className="px-3 py-2 border-b border-[#0A0A0A]/5">
              <div className="flex items-center gap-2">
                <div className="flex-1 h-1 bg-[#0A0A0A]/10">
                  <div
                    className="h-full bg-[#0A0A0A] transition-all"
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <span className="font-mono text-[9px] text-[#0A0A0A]/40 shrink-0">
                  {doneTasks}/{totalTasks}
                </span>
              </div>
            </div>
          )}
          {/* Section list */}
          <div className="divide-y divide-[#0A0A0A]/5">
            {sections.slice(0, 6).map((section) => {
              const counts = tasksBySectionId.get(section.id) ?? {
                total: 0,
                done: 0,
              };
              const secPct =
                counts.total > 0
                  ? Math.round((counts.done / counts.total) * 100)
                  : 0;

              return (
                <div
                  key={section.id}
                  className="px-3 py-2 flex items-center justify-between"
                >
                  <p className="font-serif text-[11px] italic font-medium text-[#0A0A0A]">
                    {section.projectName}
                  </p>
                  <div className="flex items-center gap-2">
                    {counts.total > 0 && (
                      <>
                        <div className="w-12 h-1 bg-[#0A0A0A]/10">
                          <div
                            className="h-full bg-[#0A0A0A]"
                            style={{ width: `${secPct}%` }}
                          />
                        </div>
                        <span className="font-mono text-[9px] text-[#0A0A0A]/40">
                          {counts.done}/{counts.total}
                        </span>
                      </>
                    )}
                    {counts.total > 0 && counts.done === counts.total && (
                      <Check size={10} className="text-emerald-500" />
                    )}
                  </div>
                </div>
              );
            })}
            {sections.length > 6 && (
              <div className="px-3 py-1.5">
                <Link
                  href={`/sprints/${sprint.id}`}
                  className="font-mono text-[9px] text-[#0A0A0A]/40 hover:text-[#0A0A0A]/60"
                >
                  +{sections.length - 6} more sections →
                </Link>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  } catch (err) {
    console.error("[Dashboard] SprintWidget failed:", err);
    return null;
  }
}

// ─── Metrics Strip ──────────────────────────────────────────────────────────

async function MetricsStrip() {
  try {
    const [mrrData, mercuryAccounts, totalClientsResult, overdueResult, spendResult] =
      await Promise.all([
        getCachedMrr(),
        db.select().from(schema.mercuryAccounts),
        db.select({ value: count() }).from(schema.clients),
        db
          .select({
            cnt: count(),
            total: sql<string>`COALESCE(SUM(${schema.invoices.amount}), 0)`,
          })
          .from(schema.invoices)
          .where(eq(schema.invoices.status, "overdue")),
        db
          .select({
            totalSpend: sql<string>`COALESCE(SUM(ABS(${schema.mercuryTransactions.amount})), 0)`,
          })
          .from(schema.mercuryTransactions)
          .where(
            and(
              eq(schema.mercuryTransactions.direction, "debit"),
              gte(
                schema.mercuryTransactions.postedAt,
                new Date(Date.now() - 60 * 24 * 60 * 60 * 1000)
              )
            )
          ),
      ]);

    const totalCash = mercuryAccounts.reduce(
      (s, a) => s + Number(a.balance),
      0
    );
    const monthlySpend = Number(spendResult[0]?.totalSpend ?? 0) / 2;
    const runway = monthlySpend > 0 ? totalCash / monthlySpend : null;
    const overdueCount = overdueResult[0]?.cnt ?? 0;
    const overdueTotal = Number(overdueResult[0]?.total ?? 0) / 100;

    return (
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <MetricPill
          label="MRR"
          value={formatCurrency(mrrData.mrr)}
          sub={`${mrrData.activeSubs} subs`}
          href="/finance"
        />
        <MetricPill
          label="Cash"
          value={formatCurrency(totalCash)}
          sub={runway ? `${runway.toFixed(0)}mo runway` : ""}
          href="/finance"
        />
        <MetricPill
          label="Clients"
          value={String(totalClientsResult[0]?.value ?? 0)}
          href="/clients"
        />
        <MetricPill
          label="Overdue"
          value={overdueCount > 0 ? formatCurrency(overdueTotal) : "$0"}
          sub={overdueCount > 0 ? `${overdueCount} inv` : ""}
          href="/invoices"
          alert={overdueCount > 0}
        />
      </div>
    );
  } catch (err) {
    console.error("[Dashboard] MetricsStrip failed:", err);
    return (
      <div className="grid grid-cols-4 gap-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="h-16 bg-[#0A0A0A]/5 border border-[#0A0A0A]/10"
          />
        ))}
      </div>
    );
  }
}

// ─── Actions Panel ──────────────────────────────────────────────────────────

async function ActionsPanel() {
  try {
    const now = new Date();
    const [overdueInvoices, staleClients, deploysResult, recentActivity] =
      await Promise.all([
        db
          .select({
            id: schema.invoices.id,
            clientName: schema.clients.name,
            amount: schema.invoices.amount,
            dueDate: schema.invoices.dueDate,
          })
          .from(schema.invoices)
          .leftJoin(
            schema.clients,
            eq(schema.invoices.clientId, schema.clients.id)
          )
          .where(eq(schema.invoices.status, "overdue"))
          .orderBy(schema.invoices.dueDate)
          .limit(5),
        getCachedStaleClients(),
        vercelConnector.getRecentDeployments(5),
        getRecentActivity(10),
      ]);

    const failedDeploys = deploysResult.success
      ? (deploysResult.data ?? []).filter((d) => d.state === "ERROR")
      : [];

    const actionItems: Array<{
      severity: "critical" | "warning" | "info";
      label: string;
      detail: string;
      url: string;
    }> = [];

    for (const inv of overdueInvoices) {
      const daysOverdue = inv.dueDate
        ? Math.floor(
            (now.getTime() - new Date(inv.dueDate).getTime()) /
              (1000 * 60 * 60 * 24)
          )
        : 0;
      actionItems.push({
        severity: daysOverdue > 10 ? "critical" : "warning",
        label: `Invoice overdue ${daysOverdue}d`,
        detail: `${inv.clientName ?? "Unknown"} — ${formatCurrency(inv.amount / 100)}`,
        url: `/invoices/${inv.id}`,
      });
    }

    for (const deploy of failedDeploys) {
      actionItems.push({
        severity: "critical",
        label: "Deploy failed",
        detail: deploy.name,
        url: `/projects`,
      });
    }

    for (const c of staleClients) {
      const days = Math.floor(
        (now.getTime() - new Date(c.lastCardUpdate).getTime()) /
          (1000 * 60 * 60 * 24)
      );
      actionItems.push({
        severity: days > 10 ? "critical" : "warning",
        label: `No activity ${days}d`,
        detail: c.clientName,
        url: `/clients/${c.clientId}/kanban`,
      });
    }

    actionItems.sort((a, b) => {
      const order = { critical: 0, warning: 1, info: 2 };
      return order[a.severity] - order[b.severity];
    });

    return (
      <div className="space-y-4">
        {/* Sprint Widget */}
        <SprintWidget />

        {/* Action Required */}
        {actionItems.length > 0 && (
          <div>
            <h3 className="font-mono text-[10px] uppercase tracking-wider text-[#0A0A0A]/40 mb-2">
              Action Required
            </h3>
            <div className="border border-[#0A0A0A]/10 bg-white divide-y divide-[#0A0A0A]/5">
              {actionItems.slice(0, 5).map((item, i) => (
                <Link
                  key={i}
                  href={item.url}
                  className="px-3 py-2.5 flex items-start gap-2.5 hover:bg-[#0A0A0A]/[0.02] transition-colors block"
                >
                  <span
                    className={`w-1.5 h-1.5 rounded-full shrink-0 mt-1.5 ${
                      item.severity === "critical"
                        ? "bg-red-500"
                        : item.severity === "warning"
                          ? "bg-amber-500"
                          : "bg-emerald-500"
                    }`}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="font-mono text-[11px] font-medium text-[#0A0A0A]">
                      {item.label}
                    </p>
                    <p className="font-serif text-[11px] text-[#0A0A0A]/50 truncate">
                      {item.detail}
                    </p>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        )}

        {/* Quick Access */}
        <div>
          <h3 className="font-mono text-[10px] uppercase tracking-wider text-[#0A0A0A]/40 mb-2">
            Quick Access
          </h3>
          <div className="grid grid-cols-2 gap-1.5">
            <QuickLink href="/sprints" icon={Zap} label="Sprints" />
            <QuickLink href="/leads" icon={Crosshair} label="Leads" />
            <QuickLink href="/clients" icon={Users} label="Clients" />
            <QuickLink href="/projects" icon={FolderKanban} label="Projects" />
            <QuickLink href="/tasks" icon={ListTodo} label="Tasks" />
            <QuickLink href="/invoices" icon={Receipt} label="Invoices" />
            <QuickLink href="/contracts" icon={FileCheck} label="Contracts" />
            <QuickLink href="/finance" icon={Landmark} label="Finance" />
            <QuickLink href="/forecast" icon={TrendingUp} label="Forecast" />
            <QuickLink href="/analytics" icon={LineChart} label="Analytics" />
            <QuickLink href="/outreach" icon={Send} label="Outreach" />
          </div>
        </div>

        {/* Recent Activity */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <h3 className="font-mono text-[10px] uppercase tracking-wider text-[#0A0A0A]/40">
              Recent Activity
            </h3>
            <Link
              href="/activity"
              className="font-mono text-[10px] text-[#0A0A0A]/40 hover:text-[#0A0A0A]/60"
            >
              View all
            </Link>
          </div>
          {recentActivity.length === 0 ? (
            <div className="border border-[#0A0A0A]/10 bg-white py-6 text-center">
              <p className="text-[#0A0A0A]/40 font-serif text-xs">
                No activity yet.
              </p>
            </div>
          ) : (
            <div className="border border-[#0A0A0A]/10 bg-white divide-y divide-[#0A0A0A]/5">
              {recentActivity.slice(0, 8).map((entry) => (
                <div
                  key={entry.id}
                  className="px-3 py-2 flex items-center justify-between gap-2"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="px-1 py-0.5 font-mono text-[7px] uppercase tracking-wider bg-[#0A0A0A]/5 text-[#0A0A0A]/50 shrink-0">
                      {entry.action.length > 10
                        ? entry.action.slice(0, 10)
                        : entry.action}
                    </span>
                    <span className="font-serif text-[11px] text-[#0A0A0A]/60 truncate">
                      {entry.entityType}
                    </span>
                  </div>
                  <span className="font-mono text-[9px] text-[#0A0A0A]/30 shrink-0">
                    {formatDistanceToNow(new Date(entry.createdAt), {
                      addSuffix: true,
                    })}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  } catch (err) {
    console.error("[Dashboard] ActionsPanel failed:", err);
    return (
      <div className="border border-[#0A0A0A]/10 bg-white p-6 text-center">
        <p className="text-[#0A0A0A]/40 font-mono text-xs">
          Failed to load actions
        </p>
      </div>
    );
  }
}

// ─── Loading Skeletons ──────────────────────────────────────────────────────

function MetricsStripSkeleton() {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
      {Array.from({ length: 4 }).map((_, i) => (
        <div
          key={i}
          className="h-16 bg-[#0A0A0A]/5 animate-pulse border border-[#0A0A0A]/10"
        />
      ))}
    </div>
  );
}

function ActionsPanelSkeleton() {
  return (
    <div className="space-y-4">
      <div className="h-32 bg-[#0A0A0A]/5 animate-pulse border border-[#0A0A0A]/10" />
      <div className="h-48 bg-[#0A0A0A]/5 animate-pulse border border-[#0A0A0A]/10" />
      <div className="h-40 bg-[#0A0A0A]/5 animate-pulse border border-[#0A0A0A]/10" />
    </div>
  );
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default async function DashboardPage() {
  const now = new Date();
  const user = await currentUser();
  const firstName = user?.firstName ?? "there";

  return (
    <div className="flex flex-col h-[calc(100vh-7rem)]">
      {/* Header + Metrics */}
      <div className="shrink-0 space-y-3 mb-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold font-serif tracking-tight">
              {greeting()}, {firstName}
            </h1>
            <p className="text-[#0A0A0A]/40 font-mono text-[10px] mt-0.5">
              {format(now, "EEEE, MMMM d, yyyy")}
            </p>
          </div>
        </div>
        <Suspense fallback={<MetricsStripSkeleton />}>
          <MetricsStrip />
        </Suspense>
      </div>

      {/* Main: AI Chat + Side Panel */}
      <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 gap-4 min-h-0">
        {/* AI Chat — primary interface */}
        <div className="lg:col-span-7 xl:col-span-8 min-h-0 flex flex-col">
          <AiChat className="flex-1 min-h-0" />
        </div>

        {/* Side Panel — actions, quick access, activity */}
        <div className="lg:col-span-5 xl:col-span-4 overflow-y-auto min-h-0">
          <Suspense fallback={<ActionsPanelSkeleton />}>
            <ActionsPanel />
          </Suspense>
        </div>
      </div>
    </div>
  );
}

// ─── Components ──────────────────────────────────────────────────────────────

function MetricPill({
  label,
  value,
  sub,
  href,
  alert = false,
}: {
  label: string;
  value: string;
  sub?: string;
  href: string;
  alert?: boolean;
}) {
  return (
    <Link
      href={href}
      className={`block border bg-white px-3 py-2.5 hover:bg-[#0A0A0A]/[0.02] transition-colors ${
        alert
          ? "border-red-300 border-l-2 border-l-red-500"
          : "border-[#0A0A0A]/10"
      }`}
    >
      <span className="font-mono text-[9px] uppercase tracking-wider text-[#0A0A0A]/40">
        {label}
      </span>
      <div className="flex items-baseline gap-1.5">
        <span className="font-mono text-lg font-bold">{value}</span>
        {sub && (
          <span className="font-mono text-[9px] text-[#0A0A0A]/40">
            {sub}
          </span>
        )}
      </div>
    </Link>
  );
}

function QuickLink({
  href,
  icon: Icon,
  label,
}: {
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
}) {
  return (
    <Link
      href={href}
      className="flex items-center gap-2 px-3 py-2 border border-[#0A0A0A]/10 bg-white hover:bg-[#0A0A0A]/[0.02] hover:border-[#0A0A0A]/20 transition-colors"
    >
      <Icon className="w-3.5 h-3.5 text-[#0A0A0A]/50" />
      <span className="font-mono text-[11px] text-[#0A0A0A]/70">{label}</span>
    </Link>
  );
}
