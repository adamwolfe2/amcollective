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
import * as wholesailConnector from "@/lib/connectors/wholesail";
import * as cursiveConnector from "@/lib/connectors/cursive";
import * as trackrConnector from "@/lib/connectors/trackr";
import * as taskspaceConnector from "@/lib/connectors/taskspace";
import * as tbgcConnector from "@/lib/connectors/tbgc";
import * as hookConnector from "@/lib/connectors/hook";
import { getRecentActivity } from "@/lib/db/repositories/activity";
import { FloatingChatBar } from "@/components/floating-chat-bar";
import { SprintWidgetClient } from "@/components/sprint-widget-client";
import { PrioritiesWidget } from "@/components/dashboard/PrioritiesWidget";
import { CashRunwayChart, type RunwaySnapshot } from "@/components/dashboard/CashRunwayChart";
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
  ExternalLink,
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
    console.error("[Dashboard] SprintWidget failed:", err);
    return null;
  }
}

// ─── Cached platform connector snapshots ────────────────────────────────────

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

const getCachedWholesailSnapshot = unstable_cache(
  () => wholesailConnector.getSnapshot(),
  ["dashboard-wholesail-snapshot"],
  { revalidate: 300 }
);

const getCachedCursiveSnapshot = unstable_cache(
  () => cursiveConnector.getSnapshot(),
  ["dashboard-cursive-snapshot"],
  { revalidate: 300 }
);

const getCachedTrackrSnapshot = unstable_cache(
  () => trackrConnector.getSnapshot(),
  ["dashboard-trackr-snapshot"],
  { revalidate: 300 }
);

const getCachedTaskSpaceSnapshot = unstable_cache(
  () => taskspaceConnector.getSnapshot(),
  ["dashboard-taskspace-snapshot"],
  { revalidate: 300 }
);

const getCachedTBGCSnapshot = unstable_cache(
  () => tbgcConnector.getSnapshot(),
  ["dashboard-tbgc-snapshot"],
  { revalidate: 300 }
);

const getCachedHookSnapshot = unstable_cache(
  () => hookConnector.getSnapshot(),
  ["dashboard-hook-snapshot"],
  { revalidate: 300 }
);

// ─── Cash Runway ─────────────────────────────────────────────────────────────

const getCachedRunwaySnapshots = unstable_cache(
  async (): Promise<RunwaySnapshot[]> => {
    const rows = await db
      .select()
      .from(schema.cashSnapshots)
      .orderBy(asc(schema.cashSnapshots.recordedAt))
      .limit(30); // ~1 month of daily snapshots

    return rows.map((r) => ({
      recordedAt: r.recordedAt.toISOString(),
      runwayMonths: r.runwayMonths !== null ? Number(r.runwayMonths) : null,
      balanceCents: r.balanceCents,
      burnCents: r.burnCents,
    }));
  },
  ["dashboard-runway-snapshots"],
  { revalidate: 3600 } // 1 hour
);

async function CashRunwaySection() {
  try {
    const snapshots = await getCachedRunwaySnapshots();
    return (
      <div className="border border-[#0A0A0A]/10 bg-white p-4">
        <CashRunwayChart snapshots={snapshots} />
      </div>
    );
  } catch {
    return null;
  }
}

// ─── Metrics Strip ──────────────────────────────────────────────────────────

async function MetricsStrip() {
  try {
    const [mrrData, mercuryResult, totalClientsResult, overdueResult, spendResult] =
      await Promise.all([
        getCachedMrr(),
        getCachedMercuryAccounts(),
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

    const accounts = mercuryResult.success ? (mercuryResult.data ?? []) : [];
    const totalCash = accounts.reduce((s, a) => s + a.currentBalance, 0);
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
          sub={runway ? `${runway.toFixed(0)} mo runway` : "no data"}
          href="/finance"
        />
        <MetricPill
          label="Clients"
          value={String(totalClientsResult[0]?.value ?? 0)}
          sub="total active"
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

// ─── Platform Card Shared ────────────────────────────────────────────────────

function PlatformCardHeader({
  label,
  tag,
  internalHref,
}: {
  label: string;
  tag: string;
  internalHref: string;
}) {
  return (
    <div className="px-4 py-2.5 border-b border-[#0A0A0A]/5 flex items-center justify-between">
      <div className="flex items-center gap-2">
        <span className="inline-flex items-center justify-center w-5 h-5 bg-[#0A0A0A] font-mono text-[9px] font-bold text-white">
          {tag}
        </span>
        <span className="font-serif font-bold text-sm text-[#0A0A0A]">{label}</span>
      </div>
      <Link
        href={internalHref}
        className="font-mono text-[9px] text-[#0A0A0A]/40 hover:text-[#0A0A0A]/70 transition-colors"
      >
        details →
      </Link>
    </div>
  );
}

function CardStat({
  label,
  value,
  sub,
  alert,
}: {
  label: string;
  value: string;
  sub?: string;
  alert?: boolean;
}) {
  return (
    <div>
      <span className="font-mono text-[9px] uppercase tracking-wider text-[#0A0A0A]/40 block">
        {label}
      </span>
      <div className="flex items-baseline gap-1">
        <span
          className={`font-mono font-bold text-base leading-tight ${
            alert ? "text-red-600" : "text-[#0A0A0A]"
          }`}
        >
          {value}
        </span>
        {sub && (
          <span className="font-mono text-[9px] text-[#0A0A0A]/40">{sub}</span>
        )}
      </div>
    </div>
  );
}

function PlatformUnavailable() {
  return (
    <div className="p-4 flex items-center justify-center h-20">
      <p className="font-mono text-[10px] text-[#0A0A0A]/25">Not connected</p>
    </div>
  );
}

// ─── Wholesail Platform Card ─────────────────────────────────────────────────

async function WholesailCard() {
  try {
    const result = await getCachedWholesailSnapshot();
    const d = result.success ? result.data : null;

    return (
      <div className="border border-[#0A0A0A]/10 bg-white flex flex-col">
        <PlatformCardHeader label="Wholesail" tag="W" internalHref="/projects?platform=wholesail" />
        {d ? (
          <div className="p-4 space-y-3 flex-1">
            {/* Build pipeline */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <CardStat label="Builds" value={String(d.activeBuilds)} sub="active" />
              <CardStat label="Live" value={String(d.liveClients)} sub="clients" />
              <CardStat label="Total" value={String(Object.values(d.buildsByStatus).reduce((s, n) => s + n, 0))} sub="all time" />
              <CardStat label="Stuck" value={String(d.stuckProjects)} sub=">14d" alert={d.stuckProjects > 0} />
            </div>
            {/* Revenue */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <CardStat label="Pipeline" value={formatCurrency(d.pipelineValue)} />
              <CardStat label="MRR" value={formatCurrency(d.mrrFromRetainers)} sub="retainers" />
              <CardStat label="Overdue" value={String(d.overdueProjects)} sub="builds" alert={d.overdueProjects > 0} />
            </div>
            {/* Intake funnel */}
            <div>
              <span className="font-mono text-[9px] uppercase tracking-wider text-[#0A0A0A]/40 block mb-1.5">Intake funnel</span>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                <CardStat label="Pending" value={String(d.intake.pending)} alert={d.intake.pending > 0} />
                <CardStat label="Reviewed" value={String(d.intake.reviewed)} />
                <CardStat label="Converted" value={String(d.intake.converted)} />
                <CardStat label="Total" value={String(d.intake.total)} />
              </div>
            </div>
            {/* Costs */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <CardStat label="Build Costs MTD" value={formatCurrency(d.buildCostsMtdCents / 100)} />
              <CardStat label="Build Costs All-Time" value={formatCurrency(d.buildCostsAllTimeCents / 100)} />
            </div>
          </div>
        ) : (
          <PlatformUnavailable />
        )}
      </div>
    );
  } catch (err) {
    console.error("[Dashboard] WholesailCard failed:", err);
    return (
      <div className="border border-[#0A0A0A]/10 bg-white">
        <PlatformCardHeader label="Wholesail" tag="W" internalHref="/projects" />
        <PlatformUnavailable />
      </div>
    );
  }
}

// ─── Cursive Platform Card ────────────────────────────────────────────────────

async function CursiveCard() {
  try {
    const result = await getCachedCursiveSnapshot();
    const d = result.success ? result.data : null;

    return (
      <div className="border border-[#0A0A0A]/10 bg-white flex flex-col">
        <PlatformCardHeader label="Cursive" tag="C" internalHref="/leads?platform=cursive" />
        {d ? (
          <div className="p-4 space-y-3 flex-1">
            {/* Workspace pipeline */}
            <div>
              <span className="font-mono text-[9px] uppercase tracking-wider text-[#0A0A0A]/40 block mb-1.5">Workspace pipeline</span>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                <CardStat label="Total" value={String(d.totalWorkspaces)} />
                <CardStat label="Active" value={String(d.pipeline.active)} />
                <CardStat label="Trial" value={String(d.pipeline.trial)} />
                <CardStat label="New" value={String(d.pipeline.new)} sub="unstarted" />
              </div>
            </div>
            {/* Leads */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <CardStat label="Total Leads" value={String(d.leads.total)} />
              <CardStat label="New Leads" value={String(d.leads.createdThisWeek)} sub="this wk" />
              <CardStat label="At-Risk" value={String(d.pipeline.at_risk)} sub="workspaces" alert={d.pipeline.at_risk > 0} />
            </div>
            {/* Bookings */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <CardStat label="Bookings Today" value={String(d.bookings.today)} />
              <CardStat label="This Week" value={String(d.bookings.thisWeek)} />
              <CardStat label="This Month" value={String(d.bookings.thisMonth)} />
            </div>
            {/* Pixels */}
            <div>
              <span className="font-mono text-[9px] uppercase tracking-wider text-[#0A0A0A]/40 block mb-1.5">Pixels</span>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                <CardStat label="Installed" value={String(d.pixels.totalInstalls)} />
                <CardStat label="Active Trial" value={String(d.pixels.activeTrials)} />
                <CardStat label="Expiring" value={String(d.pixels.trialsExpiringWeek)} sub="7d" alert={d.pixels.trialsExpiringWeek > 0} />
                <CardStat label="Expired" value={String(d.pixels.trialsExpired)} />
              </div>
            </div>
            {/* Affiliates */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <CardStat label="Affiliates" value={String(d.affiliates.activeAffiliates)} sub="active" />
              <CardStat label="Applications" value={String(d.affiliates.pendingApplications)} sub="pending" alert={d.affiliates.pendingApplications > 0} />
              <CardStat label="Commissions" value={formatCurrency(d.affiliates.pendingCommissionsCents / 100)} sub="pending" />
            </div>
          </div>
        ) : (
          <PlatformUnavailable />
        )}
      </div>
    );
  } catch (err) {
    console.error("[Dashboard] CursiveCard failed:", err);
    return (
      <div className="border border-[#0A0A0A]/10 bg-white">
        <PlatformCardHeader label="Cursive" tag="C" internalHref="/leads" />
        <PlatformUnavailable />
      </div>
    );
  }
}

// ─── Trackr Platform Card ─────────────────────────────────────────────────────

async function TrackrCard() {
  try {
    const result = await getCachedTrackrSnapshot();
    const d = result.success ? result.data : null;

    return (
      <div className="border border-[#0A0A0A]/10 bg-white flex flex-col">
        <PlatformCardHeader label="Trackr" tag="T" internalHref="/analytics?platform=trackr" />
        {d ? (
          <div className="p-4 space-y-3 flex-1">
            {/* Users */}
            <div>
              <span className="font-mono text-[9px] uppercase tracking-wider text-[#0A0A0A]/40 block mb-1.5">Users</span>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                <CardStat label="Workspaces" value={String(d.totalWorkspaces)} />
                <CardStat label="New" value={String(d.newWorkspacesWeek)} sub="this wk" />
                <CardStat label="Paying" value={String(d.activeSubscriptions)} />
                <CardStat label="Trialing" value={String(d.trialingSubscriptions)} />
              </div>
            </div>
            {/* Revenue — plan breakdown */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <CardStat label="MRR" value={formatCurrency(d.mrrCents / 100)} />
              <CardStat label="Free" value={String(d.planBreakdown.free ?? 0)} sub="workspaces" />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <CardStat label="Team" value={String(d.planBreakdown.team ?? 0)} sub="plan" />
              <CardStat label="Startup" value={String(d.planBreakdown.startup ?? 0)} sub="plan" />
              <CardStat label="Enterprise" value={String(d.planBreakdown.enterprise ?? 0)} sub="plan" />
            </div>
            {/* Product */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <CardStat label="Tools Researched" value={String(d.totalToolsResearched)} />
              <CardStat label="Audits Pending" value={String(d.auditPipelinePending)} alert={d.auditPipelinePending > 0} />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <CardStat label="API Cost MTD" value={formatCurrency(d.apiCostsMtdCents / 100)} />
              <CardStat label="API Cost Today" value={formatCurrency(d.apiCostsTodayCents / 100)} />
            </div>
            {/* Architect program */}
            <div>
              <span className="font-mono text-[9px] uppercase tracking-wider text-[#0A0A0A]/40 block mb-1.5">Architect program</span>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <CardStat label="Active" value={String(d.activeArchitects)} />
                <CardStat label="Applications" value={String(d.pendingArchitectApplications)} sub="pending" alert={d.pendingArchitectApplications > 0} />
                <CardStat label="Commissions" value={formatCurrency(d.pendingCommissionsCents / 100)} sub="pending" />
              </div>
            </div>
          </div>
        ) : (
          <PlatformUnavailable />
        )}
      </div>
    );
  } catch (err) {
    console.error("[Dashboard] TrackrCard failed:", err);
    return (
      <div className="border border-[#0A0A0A]/10 bg-white">
        <PlatformCardHeader label="Trackr" tag="T" internalHref="/analytics" />
        <PlatformUnavailable />
      </div>
    );
  }
}

// ─── TaskSpace Platform Card ──────────────────────────────────────────────────

async function TaskSpaceCard() {
  try {
    const result = await getCachedTaskSpaceSnapshot();
    const d = result.success ? result.data : null;

    return (
      <div className="border border-[#0A0A0A]/10 bg-white flex flex-col">
        <PlatformCardHeader label="TaskSpace" tag="TS" internalHref="/team?platform=taskspace" />
        {d ? (
          <div className="p-4 space-y-3 flex-1">
            {/* Orgs & users */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <CardStat label="Orgs" value={String(d.totalOrgs)} />
              <CardStat label="Members" value={String(d.totalMembers)} />
              <CardStat label="Paying Orgs" value={String(d.payingOrgs)} />
            </div>
            {/* Revenue */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <CardStat label="MRR" value={formatCurrency(d.mrrCents / 100)} />
              <CardStat label="Team Plan" value={String(d.planBreakdown.team)} />
              <CardStat label="Business Plan" value={String(d.planBreakdown.business)} />
            </div>
            {/* EOD activity */}
            <div>
              <span className="font-mono text-[9px] uppercase tracking-wider text-[#0A0A0A]/40 block mb-1.5">EOD Reports</span>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <CardStat label="Today" value={String(d.eodsToday)} />
                <CardStat label="7-Day Rate" value={`${d.eodRate7Day}%`} alert={d.eodRate7Day < 50} />
                <CardStat label="Escalations" value={String(d.openEscalations)} sub="open" alert={d.openEscalations > 0} />
              </div>
            </div>
            {/* Tasks */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <CardStat label="Active Tasks" value={String(d.activeTasks)} />
              <CardStat label="Completed" value={String(d.completedTasksThisWeek)} sub="this wk" />
            </div>
            {/* Rocks */}
            <div>
              <span className="font-mono text-[9px] uppercase tracking-wider text-[#0A0A0A]/40 block mb-1.5">Rocks (quarterly goals)</span>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                <CardStat label="On-Track" value={String(d.rocksOnTrack)} />
                <CardStat label="At-Risk" value={String(d.rocksAtRisk)} alert={d.rocksAtRisk > 0} />
                <CardStat label="Blocked" value={String(d.rocksBlocked)} alert={d.rocksBlocked > 0} />
                <CardStat label="Done" value={String(d.rocksCompleted)} />
              </div>
              {d.rocksOnTrack + d.rocksAtRisk + d.rocksBlocked + d.rocksCompleted > 0 && (
                <div className="flex gap-0.5 h-1 mt-2">
                  {d.rocksOnTrack > 0 && <div className="h-full bg-emerald-400" style={{ flex: d.rocksOnTrack }} title={`On-track: ${d.rocksOnTrack}`} />}
                  {d.rocksAtRisk > 0 && <div className="h-full bg-amber-400" style={{ flex: d.rocksAtRisk }} title={`At-risk: ${d.rocksAtRisk}`} />}
                  {d.rocksBlocked > 0 && <div className="h-full bg-red-400" style={{ flex: d.rocksBlocked }} title={`Blocked: ${d.rocksBlocked}`} />}
                  {d.rocksCompleted > 0 && <div className="h-full bg-[#0A0A0A]/15" style={{ flex: d.rocksCompleted }} title={`Completed: ${d.rocksCompleted}`} />}
                </div>
              )}
            </div>
          </div>
        ) : (
          <PlatformUnavailable />
        )}
      </div>
    );
  } catch (err) {
    console.error("[Dashboard] TaskSpaceCard failed:", err);
    return (
      <div className="border border-[#0A0A0A]/10 bg-white">
        <PlatformCardHeader label="TaskSpace" tag="TS" internalHref="/team" />
        <PlatformUnavailable />
      </div>
    );
  }
}

// ─── TBGC Platform Card ────────────────────────────────────────────────────────

async function TBGCCard() {
  try {
    const result = await getCachedTBGCSnapshot();
    const d = result.success ? result.data : null;

    return (
      <div className="border border-[#0A0A0A]/10 bg-white flex flex-col">
        <PlatformCardHeader label="TBGC" tag="TB" internalHref="/products/tbgc" />
        {d ? (
          <div className="p-4 space-y-3 flex-1">
            {/* Stage badge */}
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center px-2 py-0.5 font-mono text-[9px] uppercase tracking-wider bg-amber-100 text-amber-700 border border-amber-200">
                {d.stage}
              </span>
              <span className="font-mono text-[9px] text-[#0A0A0A]/40">Custom B2B wholesale portal</span>
            </div>
            {/* Revenue */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <CardStat
                label="MRR"
                value={d.mrrCents > 0 ? formatCurrency(d.mrrCents / 100) : "Pre-revenue"}
              />
              <CardStat label="Subscriptions" value={String(d.activeSubscriptions)} sub="active" />
            </div>
            {/* Notes */}
            {d.notes.length > 0 && (
              <div>
                <span className="font-mono text-[9px] uppercase tracking-wider text-[#0A0A0A]/40 block mb-1">Status</span>
                {d.notes.map((note, i) => (
                  <p key={i} className="font-serif text-[11px] text-[#0A0A0A]/60">{note}</p>
                ))}
              </div>
            )}
          </div>
        ) : (
          <PlatformUnavailable />
        )}
      </div>
    );
  } catch (err) {
    console.error("[Dashboard] TBGCCard failed:", err);
    return (
      <div className="border border-[#0A0A0A]/10 bg-white">
        <PlatformCardHeader label="TBGC" tag="TB" internalHref="/products/tbgc" />
        <PlatformUnavailable />
      </div>
    );
  }
}

// ─── Hook Platform Card ────────────────────────────────────────────────────────

async function HookCard() {
  try {
    const result = await getCachedHookSnapshot();
    const d = result.success ? result.data : null;

    return (
      <div className="border border-[#0A0A0A]/10 bg-white flex flex-col">
        <PlatformCardHeader label="Hook" tag="H" internalHref="/products/hook" />
        {d ? (
          <div className="p-4 space-y-3 flex-1">
            {/* Stage badge */}
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center px-2 py-0.5 font-mono text-[9px] uppercase tracking-wider bg-blue-100 text-blue-700 border border-blue-200">
                {d.stage}
              </span>
              <span className="font-mono text-[9px] text-[#0A0A0A]/40">AI viral content platform</span>
            </div>
            {/* Revenue */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <CardStat
                label="MRR"
                value={d.mrrCents > 0 ? formatCurrency(d.mrrCents / 100) : "Pre-revenue"}
              />
              <CardStat label="Paying" value={String(d.activeSubscriptions)} sub="users" />
              <CardStat label="Trialing" value={String(d.trialingSubscriptions)} sub="users" />
            </div>
            {/* Notes */}
            {d.notes.length > 0 && (
              <div>
                <span className="font-mono text-[9px] uppercase tracking-wider text-[#0A0A0A]/40 block mb-1">Status</span>
                {d.notes.map((note, i) => (
                  <p key={i} className="font-serif text-[11px] text-[#0A0A0A]/60">{note}</p>
                ))}
              </div>
            )}
          </div>
        ) : (
          <PlatformUnavailable />
        )}
      </div>
    );
  } catch (err) {
    console.error("[Dashboard] HookCard failed:", err);
    return (
      <div className="border border-[#0A0A0A]/10 bg-white">
        <PlatformCardHeader label="Hook" tag="H" internalHref="/products/hook" />
        <PlatformUnavailable />
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
        // Unsigned contracts that were sent to clients
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
        // Leads with missed follow-ups
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
        {/* Today's Priorities */}
        <PrioritiesWidget />

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

function PlatformCardSkeleton() {
  return (
    <div className="border border-[#0A0A0A]/10 bg-white">
      <div className="px-4 py-2.5 border-b border-[#0A0A0A]/5">
        <div className="h-4 w-24 bg-[#0A0A0A]/5 animate-pulse" />
      </div>
      <div className="p-4 space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-10 bg-[#0A0A0A]/5 animate-pulse" />
          ))}
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {Array.from({ length: 2 }).map((_, i) => (
            <div key={i} className="h-10 bg-[#0A0A0A]/5 animate-pulse" />
          ))}
        </div>
      </div>
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
    // pb-24 keeps content above the floating chat bar
    <div className="flex flex-col h-[calc(100vh-7rem)] pb-20">
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

      {/* Main: Portfolio Grid + Side Panel */}
      <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 gap-4 min-h-0">
        {/* Portfolio Grid */}
        <div className="lg:col-span-8 overflow-y-auto min-h-0">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Suspense fallback={<PlatformCardSkeleton />}>
              <WholesailCard />
            </Suspense>
            <Suspense fallback={<PlatformCardSkeleton />}>
              <CursiveCard />
            </Suspense>
            <Suspense fallback={<PlatformCardSkeleton />}>
              <TrackrCard />
            </Suspense>
            <Suspense fallback={<PlatformCardSkeleton />}>
              <TaskSpaceCard />
            </Suspense>
            <Suspense fallback={<PlatformCardSkeleton />}>
              <TBGCCard />
            </Suspense>
            <Suspense fallback={<PlatformCardSkeleton />}>
              <HookCard />
            </Suspense>
            {/* Cash Runway — spans full width of portfolio grid */}
            <div className="col-span-full">
              <Suspense fallback={<div className="h-24 bg-[#0A0A0A]/5 animate-pulse border border-[#0A0A0A]/10" />}>
                <CashRunwaySection />
              </Suspense>
            </div>
          </div>
        </div>

        {/* Side Panel — sprint, actions, quick access, activity */}
        <div className="lg:col-span-4 overflow-y-auto min-h-0">
          <Suspense fallback={<ActionsPanelSkeleton />}>
            <ActionsPanel />
          </Suspense>
        </div>
      </div>

      {/* Floating Chat Bar */}
      <FloatingChatBar />
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
      <span className="font-mono text-lg font-bold block leading-tight">{value}</span>
      {sub && (
        <span className="font-mono text-[9px] text-[#0A0A0A]/40 block mt-0.5">
          {sub}
        </span>
      )}
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
