// Command Center Dashboard
// Layout: Compact metrics strip → Portfolio Grid (platforms) + Actions sidebar
// Floating chat bar replaces the full-page AI panel — click to open /ai

import { Suspense } from "react";
import Link from "next/link";
import { format, formatDistanceToNow } from "date-fns";
import { unstable_cache } from "next/cache";
import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { eq, and, sql, desc, gte, count, asc, isNull, lte, not, inArray, isNotNull } from "drizzle-orm";
import * as vercelConnector from "@/lib/connectors/vercel";
import * as stripeConnector from "@/lib/connectors/stripe";
import * as mercuryConnector from "@/lib/connectors/mercury";
import { getRecentActivity } from "@/lib/db/repositories/activity";
import { FloatingChatBar } from "@/components/floating-chat-bar";
import { SprintWidgetClient } from "@/components/sprint-widget-client";
import { PrioritiesWidget } from "@/components/dashboard/PrioritiesWidget";
import dynamic from "next/dynamic";
import type { RunwaySnapshot } from "@/components/dashboard/CashRunwayChart";
const CashRunwayChart = dynamic(
  () => import("@/components/dashboard/CashRunwayChart").then((mod) => mod.CashRunwayChart)
);
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
} from "lucide-react";
import { statusDot } from "@/lib/ui/status-colors";
import { EngagementsAccordion } from "@/components/dashboard/EngagementsAccordion";
import { ProductsAccordion } from "@/components/dashboard/ProductsAccordion";
import { greeting, formatCurrency } from "@/lib/ui/format";
import { getCachedPlatformSnapshots } from "@/lib/dashboard/platform-snapshots";
import {
  MetricsStripSkeleton,
  PlatformCardSkeleton,
  PipelineSkeleton,
  ActionsPanelSkeleton,
} from "@/components/dashboard/DashboardSkeletons";
import { captureError } from "@/lib/errors";
import { SetupChecklist } from "@/components/dashboard/SetupChecklist";
import { MetricPillClient } from "@/components/dashboard/MetricPillClient";

// ─── Cached data fetchers ───────────────────────────────────────────────────

const getCachedMrr = unstable_cache(
  async () => {
    const result = await stripeConnector.getMRR();
    const mrr = result.success ? (result.data?.mrr ?? 0) : 0;
    const activeSubs = result.success ? (result.data?.activeSubscriptions ?? 0) : 0;
    return { mrr: mrr / 100, activeSubs };
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

const getCachedMercuryAccounts = unstable_cache(
  () => mercuryConnector.getAccounts(),
  ["dashboard-mercury-accounts"],
  { revalidate: 300 }
);

const getCachedVercelDeployments = unstable_cache(
  () => vercelConnector.getRecentDeployments(5),
  ["dashboard-vercel-deployments"],
  { revalidate: 120 }
);

// ─── Sprint Widget ───────────────────────────────────────────────────────────

const getCachedCurrentSprint = unstable_cache(
  async () => {
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
      .select({
        id: schema.tasks.id,
        title: schema.tasks.title,
        status: schema.tasks.status,
        sectionId: schema.taskSprintAssignments.sectionId,
        sortOrder: schema.taskSprintAssignments.sortOrder,
      })
      .from(schema.taskSprintAssignments)
      .innerJoin(schema.tasks, eq(schema.taskSprintAssignments.taskId, schema.tasks.id))
      .where(
        and(
          eq(schema.taskSprintAssignments.sprintId, sprint.id),
          isNull(schema.taskSprintAssignments.removedAt)
        )
      )
      .orderBy(asc(schema.taskSprintAssignments.sortOrder));

    const totalTasks = tasks.length;
    const doneTasks = tasks.filter((t) => t.status === "done").length;

    return { sprint, sections, tasks, totalTasks, doneTasks };
  },
  ["dashboard-current-sprint"],
  { revalidate: 60 }
);

async function SprintWidget() {
  try {
    const data = await getCachedCurrentSprint();
    if (!data) {
      return (
        <div>
          <div className="flex items-center justify-between mb-2">
            <h3 className="font-mono text-[10px] uppercase tracking-wider text-[#0A0A0A]/40 flex items-center gap-1.5">
              <Zap size={10} />
              Weekly Sprint
            </h3>
            <Link href="/sprints" className="font-mono text-[10px] text-[#0A0A0A]/40 hover:text-[#0A0A0A]/60">
              New sprint →
            </Link>
          </div>
          <div className="border border-dashed border-[#0A0A0A]/10 py-4 text-center">
            <p className="font-mono text-[10px] text-[#0A0A0A]/30">
              No sprint this week.{" "}
              <Link href="/sprints" className="underline">Create one →</Link>
            </p>
          </div>
        </div>
      );
    }

    const { sprint, sections, tasks, totalTasks, doneTasks } = data;

    return (
      <SprintWidgetClient
        sprintId={sprint.id}
        sprintTitle={sprint.title}
        weeklyFocus={sprint.weeklyFocus}
        sprintPageUrl={`/sprints/${sprint.id}`}
        sections={sections.map((s) => ({ id: s.id, projectName: s.projectName }))}
        initialTasks={tasks.map((t) => ({
          id: t.id,
          title: t.title,
          status: t.status,
          sectionId: t.sectionId,
          sortOrder: t.sortOrder,
        }))}
        totalTasks={totalTasks}
        doneTasks={doneTasks}
      />
    );
  } catch (err) {
    captureError(err, { tags: { component: "Dashboard" } });
    return null;
  }
}

// ─── Cash Runway ─────────────────────────────────────────────────────────────

const getCachedRunwaySnapshots = unstable_cache(
  async (): Promise<RunwaySnapshot[]> => {
    const rows = await db
      .select()
      .from(schema.cashSnapshots)
      .orderBy(asc(schema.cashSnapshots.recordedAt))
      .limit(30);

    return rows.map((r) => ({
      recordedAt: r.recordedAt.toISOString(),
      runwayMonths: r.runwayMonths !== null ? Number(r.runwayMonths) : null,
      balanceCents: r.balanceCents,
      burnCents: r.burnCents,
    }));
  },
  ["dashboard-runway-snapshots"],
  { revalidate: 3600 }
);

async function CashRunwaySection() {
  try {
    const snapshots = await getCachedRunwaySnapshots();
    return (
      <div className="border border-[#0A0A0A]/10 bg-white p-4">
        <CashRunwayChart snapshots={snapshots} />
      </div>
    );
  } catch (err) {
    captureError(err instanceof Error ? err : new Error("CashRunwaySection failed"), { tags: { component: "dashboard" } });
    return null;
  }
}

// ─── CRM Pipeline Data ──────────────────────────────────────────────────────

const getCachedPipeline = unstable_cache(
  async () => {
    const allLeads = await db
      .select()
      .from(schema.leads)
      .where(eq(schema.leads.isArchived, false))
      .orderBy(desc(schema.leads.updatedAt));

    const engagements = await db
      .select({
        clientName: schema.clients.companyName,
        clientMrr: schema.clients.currentMrr,
        engTitle: schema.engagements.title,
        engStatus: schema.engagements.status,
        engValue: schema.engagements.value,
        engPeriod: schema.engagements.valuePeriod,
      })
      .from(schema.engagements)
      .innerJoin(schema.clients, eq(schema.engagements.clientId, schema.clients.id));

    const engMap = new Map<string, {
      engTitle: string | null;
      engStatus: string | null;
      engValue: number | null;
      engPeriod: string | null;
      clientMrr: number;
    }>();
    for (const e of engagements) {
      if (e.clientName) {
        engMap.set(e.clientName.toLowerCase(), {
          engTitle: e.engTitle,
          engStatus: e.engStatus,
          engValue: e.engValue,
          engPeriod: e.engPeriod,
          clientMrr: e.clientMrr,
        });
      }
    }

    const stageOrder = ["closed_won", "intent", "consideration", "interest", "nurture", "awareness"];
    const groups: Record<string, typeof allLeads> = {};
    for (const lead of allLeads) {
      if (!groups[lead.stage]) groups[lead.stage] = [];
      groups[lead.stage].push(lead);
    }

    return stageOrder
      .filter((s) => groups[s] && groups[s].length > 0)
      .map((stage) => {
        const leads = groups[stage];
        return {
          stage,
          label: stage,
          count: leads.length,
          totalValue: leads.reduce((s, l) => s + (l.estimatedValue ?? 0), 0),
          leads: leads.map((l) => {
            const companyKey = (l.companyName ?? "").toLowerCase();
            const eng = engMap.get(companyKey) ||
              Array.from(engMap.entries()).find(([k]) => companyKey.includes(k) || k.includes(companyKey))?.[1];

            return {
              id: l.id,
              companyName: l.companyName,
              contactName: l.contactName,
              stage: l.stage,
              assignedTo: l.assignedTo,
              estimatedValue: l.estimatedValue,
              probability: l.probability,
              notes: l.notes,
              tags: l.tags,
              nextFollowUpAt: l.nextFollowUpAt?.toISOString() ?? null,
              lastContactedAt: l.lastContactedAt?.toISOString() ?? null,
              engagementTitle: eng?.engTitle ?? null,
              engagementStatus: eng?.engStatus ?? null,
              engagementValue: eng?.engValue ?? null,
              engagementPeriod: eng?.engPeriod ?? null,
              clientMrr: eng?.clientMrr ?? null,
            };
          }),
        };
      });
  },
  ["dashboard-pipeline"],
  { revalidate: 60 }
);

async function PipelineSection() {
  try {
    const groups = await getCachedPipeline();
    return <EngagementsAccordion groups={groups} />;
  } catch (err) {
    captureError(err, { tags: { component: "Dashboard" } });
    return (
      <div className="border border-[#0A0A0A]/10 bg-white p-6 text-center">
        <p className="text-[#0A0A0A]/40 font-mono text-xs">Failed to load pipeline</p>
      </div>
    );
  }
}

// ─── Platform Snapshots ──────────────────────────────────────────────────────

async function PlatformSnapshotsSection() {
  try {
    const products = await getCachedPlatformSnapshots();
    return <ProductsAccordion products={products} />;
  } catch (err) {
    captureError(err, { tags: { component: "Dashboard" } });
    return null;
  }
}

// ─── Metrics Strip ──────────────────────────────────────────────────────────

async function MetricsStrip() {
  try {
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    const [mrrData, mercuryResult, activeProjectsResult, activeClientsResult, deltaSnapshots] =
      await Promise.all([
        getCachedMrr(),
        getCachedMercuryAccounts(),
        // Active portfolio projects (products with status = active)
        db
          .select({ value: count() })
          .from(schema.portfolioProjects)
          .where(eq(schema.portfolioProjects.status, "active")),
        // Active clients: distinct clients with at least one open kanban card
        db
          .select({ value: sql<number>`COUNT(DISTINCT ${schema.kanbanCards.clientId})` })
          .from(schema.kanbanCards)
          .where(sql`${schema.kanbanCards.completedAt} IS NULL`),
        // 7-day snapshots for trend delta (oldest vs newest)
        db
          .select()
          .from(schema.dailyMetricsSnapshots)
          .where(gte(schema.dailyMetricsSnapshots.date, sevenDaysAgo))
          .orderBy(asc(schema.dailyMetricsSnapshots.date))
          .limit(7),
      ]);

    const accounts = mercuryResult.success ? (mercuryResult.data ?? []) : [];
    const totalCash = accounts.reduce((s, a) => s + a.currentBalance, 0);
    const activeProjects = activeProjectsResult[0]?.value ?? 0;
    const activeClients = Number(activeClientsResult[0]?.value ?? 0);

    // Compute 7-day delta percentages from daily snapshots
    let mrrDelta: number | null = null;
    let cashDelta: number | null = null;
    if (deltaSnapshots.length >= 2) {
      const oldest = deltaSnapshots[0];
      const newest = deltaSnapshots[deltaSnapshots.length - 1];
      if (oldest.mrr > 0) {
        mrrDelta = ((newest.mrr - oldest.mrr) / oldest.mrr) * 100;
      }
      if (oldest.totalCash > 0) {
        cashDelta = ((newest.totalCash - oldest.totalCash) / oldest.totalCash) * 100;
      }
    }

    return (
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <MetricPillClient
          label="MRR"
          numericValue={mrrData.mrr}
          sub={`${mrrData.activeSubs} subs`}
          href="/finance"
          trend={mrrDelta}
          isCurrency={true}
        />
        <MetricPillClient
          label="Cash"
          numericValue={totalCash}
          sub="total balance"
          href="/finance"
          trend={cashDelta}
          isCurrency={true}
        />
        <MetricPillClient
          label="Active Projects"
          numericValue={activeProjects}
          sub="products live"
          href="/products"
        />
        <MetricPillClient
          label="Active Clients"
          numericValue={activeClients}
          sub="open engagements"
          href="/clients"
        />
      </div>
    );
  } catch (err) {
    captureError(err, { tags: { component: "Dashboard" } });
    return (
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
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
    const [overdueInvoices, staleClients, deploysResult, recentActivity, unsignedContracts, missedFollowups] =
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
        getCachedVercelDeployments(),
        getRecentActivity(10),
        db
          .select({
            id: schema.contracts.id,
            title: schema.contracts.title,
            contractNumber: schema.contracts.contractNumber,
            sentAt: schema.contracts.sentAt,
            clientName: schema.clients.name,
          })
          .from(schema.contracts)
          .leftJoin(schema.clients, eq(schema.contracts.clientId, schema.clients.id))
          .where(inArray(schema.contracts.status, ["sent", "viewed"]))
          .orderBy(schema.contracts.sentAt)
          .limit(5),
        db
          .select({
            id: schema.leads.id,
            contactName: schema.leads.contactName,
            companyName: schema.leads.companyName,
            nextFollowUpAt: schema.leads.nextFollowUpAt,
          })
          .from(schema.leads)
          .where(
            and(
              isNotNull(schema.leads.nextFollowUpAt),
              lte(schema.leads.nextFollowUpAt, now),
              eq(schema.leads.isArchived, false),
              not(inArray(schema.leads.stage, ["closed_won", "closed_lost", "nurture"]))
            )
          )
          .orderBy(schema.leads.nextFollowUpAt)
          .limit(5),
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

    for (const contract of unsignedContracts) {
      const daysSent = contract.sentAt
        ? Math.floor((now.getTime() - new Date(contract.sentAt).getTime()) / (1000 * 60 * 60 * 24))
        : null;
      actionItems.push({
        severity: daysSent != null && daysSent > 7 ? "critical" : "warning",
        label: `Unsigned contract${daysSent != null ? ` ${daysSent}d` : ""}`,
        detail: `${contract.clientName ?? "Unknown"} — ${contract.contractNumber}`,
        url: `/contracts/${contract.id}`,
      });
    }

    for (const lead of missedFollowups) {
      const daysOverdue = lead.nextFollowUpAt
        ? Math.floor((now.getTime() - new Date(lead.nextFollowUpAt).getTime()) / (1000 * 60 * 60 * 24))
        : 0;
      const name = lead.companyName ? `${lead.contactName} (${lead.companyName})` : lead.contactName;
      actionItems.push({
        severity: daysOverdue > 3 ? "critical" : "warning",
        label: `Follow-up overdue ${daysOverdue}d`,
        detail: name,
        url: `/leads`,
      });
    }

    actionItems.sort((a, b) => {
      const order = { critical: 0, warning: 1, info: 2 };
      return order[a.severity] - order[b.severity];
    });

    return (
      <div className="space-y-4">
        <PrioritiesWidget />
        <SprintWidget />

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
                  className="px-3 py-3 flex items-start gap-2.5 hover:bg-[#0A0A0A]/[0.02] transition-colors block"
                >
                  <span
                    className={`w-1.5 h-1.5 rounded-full shrink-0 mt-1.5 ${
                      item.severity === "critical"
                        ? statusDot.positive
                        : item.severity === "warning"
                          ? statusDot.warning
                          : statusDot.info
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
    captureError(err, { tags: { component: "Dashboard" } });
    return (
      <div className="border border-[#0A0A0A]/10 bg-white p-6 text-center">
        <p className="text-[#0A0A0A]/40 font-mono text-xs">
          Failed to load actions
        </p>
      </div>
    );
  }
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default async function DashboardPage() {
  const now = new Date();
  const user = await currentUser();
  const firstName = user?.firstName ?? "there";

  return (
    <div className="flex flex-col lg:h-[calc(100vh-7rem)] pb-20">
      {/* Onboarding checklist — shown until dismissed */}
      <SetupChecklist />

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
          <Link
            href="/ai"
            className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 font-mono text-[10px] border border-[#0A0A0A]/15 bg-white hover:border-[#0A0A0A]/30 transition-colors"
          >
            Open AM Agent →
          </Link>
        </div>
        <Suspense fallback={<MetricsStripSkeleton />}>
          <MetricsStrip />
        </Suspense>
      </div>

      {/* Main: Pipeline + Products + Side Panel */}
      <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 gap-3 sm:gap-4 min-h-0">
        <div className="lg:col-span-8 lg:overflow-y-auto min-h-0 space-y-3 sm:space-y-4">
          <Suspense fallback={<PlatformCardSkeleton />}>
            <PlatformSnapshotsSection />
          </Suspense>

          <Suspense fallback={<PipelineSkeleton />}>
            <PipelineSection />
          </Suspense>

          <Suspense fallback={<div className="h-24 bg-[#0A0A0A]/5 animate-pulse border border-[#0A0A0A]/10" />}>
            <CashRunwaySection />
          </Suspense>
        </div>

        <div className="lg:col-span-4 lg:overflow-y-auto min-h-0">
          <Suspense fallback={<ActionsPanelSkeleton />}>
            <ActionsPanel />
          </Suspense>
        </div>
      </div>

      <FloatingChatBar />
    </div>
  );
}

// ─── Components ──────────────────────────────────────────────────────────────

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
