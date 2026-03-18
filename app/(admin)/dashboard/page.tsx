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
} from "lucide-react";
import { statusDot, statusText, statusBadge } from "@/lib/ui/status-colors";
import { EngagementsAccordion } from "@/components/dashboard/EngagementsAccordion";
import { ProductsAccordion } from "@/components/dashboard/ProductsAccordion";
import { getProductLogo } from "@/lib/ui/product-logos";

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

// ─── CRM Pipeline Data ──────────────────────────────────────────────────────

const getCachedPipeline = unstable_cache(
  async () => {
    // Fetch all active leads
    const allLeads = await db
      .select()
      .from(schema.leads)
      .where(eq(schema.leads.isArchived, false))
      .orderBy(desc(schema.leads.updatedAt));

    // Fetch engagements + client MRR for won deals
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

    // Build a map of client company name → engagement data
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

    // Group by stage
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
            // Try to match engagement data
            const companyKey = (l.companyName ?? "").toLowerCase();
            const eng = engMap.get(companyKey) ||
              // Try partial match
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
    console.error("[Dashboard] PipelineSection failed:", err);
    return (
      <div className="border border-[#0A0A0A]/10 bg-white p-6 text-center">
        <p className="text-[#0A0A0A]/40 font-mono text-xs">Failed to load pipeline</p>
      </div>
    );
  }
}

// ─── Platform Snapshots for Products Accordion ──────────────────────────────

/* eslint-disable @typescript-eslint/no-explicit-any */
const getCachedPlatformSnapshots = unstable_cache(
  async () => {
    const [wholesail, cursive, trackr, taskspace, tbgc, hook, sprintTasks] = await Promise.all([
      getCachedWholesailSnapshot().catch(() => ({ success: false, data: null })),
      getCachedCursiveSnapshot().catch(() => ({ success: false, data: null })),
      getCachedTrackrSnapshot().catch(() => ({ success: false, data: null })),
      getCachedTaskSpaceSnapshot().catch(() => ({ success: false, data: null })),
      getCachedTBGCSnapshot().catch(() => ({ success: false, data: null })),
      getCachedHookSnapshot().catch(() => ({ success: false, data: null })),
      // Fetch all sprint tasks grouped by project section
      db
        .select({
          taskId: schema.tasks.id,
          taskTitle: schema.tasks.title,
          taskStatus: schema.tasks.status,
          taskPriority: schema.tasks.priority,
          sectionProjectName: schema.sprintSections.projectName,
          sprintTitle: schema.weeklySprints.title,
        })
        .from(schema.taskSprintAssignments)
        .innerJoin(schema.tasks, eq(schema.taskSprintAssignments.taskId, schema.tasks.id))
        .innerJoin(schema.sprintSections, eq(schema.taskSprintAssignments.sectionId, schema.sprintSections.id))
        .innerJoin(schema.weeklySprints, eq(schema.taskSprintAssignments.sprintId, schema.weeklySprints.id))
        .where(isNull(schema.taskSprintAssignments.removedAt))
        .orderBy(desc(schema.weeklySprints.weekOf), asc(schema.taskSprintAssignments.sortOrder))
        .limit(200)
        .catch(() => []),
    ]);

    // Group tasks by project name (case-insensitive)
    const tasksByProject = new Map<string, Array<{
      id: string;
      title: string;
      status: string;
      priority: string;
      sprintTitle: string | null;
    }>>();
    for (const t of sprintTasks) {
      const key = (t.sectionProjectName ?? "").toLowerCase();
      if (!key) continue;
      if (!tasksByProject.has(key)) tasksByProject.set(key, []);
      tasksByProject.get(key)!.push({
        id: t.taskId,
        title: t.taskTitle,
        status: t.taskStatus,
        priority: t.taskPriority,
        sprintTitle: t.sprintTitle,
      });
    }

    type ProductAlert = { message: string; severity: "critical" | "warning" | "info" };
    type Product = {
      name: string;
      tag: string;
      slug: string;
      href: string;
      connected: boolean;
      metrics: Array<{ label: string; value: string; alert?: boolean }>;
      logoUrl?: string | null;
      mrrDisplay?: string | null;
      stageDisplay?: string | null;
      alerts?: ProductAlert[];
      tasks?: Array<{ id: string; title: string; status: string; priority: string; sprintTitle: string | null }>;
    };

    const products: Product[] = [];
    const s = (v: any) => String(v ?? 0);
    const fc = (c: number) => formatCurrency(c);

    // ── Wholesail ──
    const wd = wholesail.success ? (wholesail.data as any) : null;
    const wAlerts: ProductAlert[] = [];
    if (wd?.stuckProjects > 0) wAlerts.push({ message: `${wd.stuckProjects} stuck builds (>14d)`, severity: "critical" });
    if (wd?.overdueProjects > 0) wAlerts.push({ message: `${wd.overdueProjects} overdue builds`, severity: "warning" });
    if (wd?.intake?.pending > 0) wAlerts.push({ message: `${wd.intake.pending} pending intake submissions`, severity: "warning" });
    products.push({
      name: "Wholesail", tag: "W", slug: "wholesail", href: "/products/wholesail", logoUrl: getProductLogo("wholesail"),
      connected: !!wd,
      mrrDisplay: wd ? fc(wd.mrrFromRetainers) : null,
      stageDisplay: "Launched",
      alerts: wAlerts,
      tasks: tasksByProject.get("wholesail") ?? [],
      metrics: wd ? [
        { label: "Active Builds", value: s(wd.activeBuilds) },
        { label: "Live Clients", value: s(wd.liveClients) },
        { label: "Pipeline", value: fc(wd.pipelineValue) },
        { label: "MRR", value: fc(wd.mrrFromRetainers) },
        { label: "Stuck >14d", value: s(wd.stuckProjects), alert: wd.stuckProjects > 0 },
        { label: "Build Costs MTD", value: fc(wd.buildCostsMtdCents / 100) },
      ] : [],
    });

    // ── Cursive ──
    const cd = cursive.success ? (cursive.data as any) : null;
    const cAlerts: ProductAlert[] = [];
    if (cd?.pipeline?.at_risk > 0) cAlerts.push({ message: `${cd.pipeline.at_risk} at-risk workspaces`, severity: "warning" });
    if (cd?.pixels?.trialsExpiringWeek > 0) cAlerts.push({ message: `${cd.pixels.trialsExpiringWeek} pixel trials expiring this week`, severity: "warning" });
    if (cd?.affiliates?.pendingApplications > 0) cAlerts.push({ message: `${cd.affiliates.pendingApplications} pending affiliate applications`, severity: "info" });
    products.push({
      name: "Cursive", tag: "C", slug: "cursive", href: "/products/cursive", logoUrl: getProductLogo("cursive"),
      connected: !!cd,
      mrrDisplay: cd ? `${s(cd.totalWorkspaces)} ws` : null,
      stageDisplay: "Launched",
      alerts: cAlerts,
      tasks: tasksByProject.get("cursive") ?? [],
      metrics: cd ? [
        { label: "Workspaces", value: s(cd.totalWorkspaces) },
        { label: "Active", value: s(cd.pipeline?.active) },
        { label: "Trial", value: s(cd.pipeline?.trial) },
        { label: "Total Leads", value: s(cd.leads?.total) },
        { label: "Pixels Installed", value: s(cd.pixels?.totalInstalls) },
        { label: "Bookings This Wk", value: s(cd.bookings?.thisWeek) },
      ] : [],
    });

    // ── Trackr ──
    const td = trackr.success ? (trackr.data as any) : null;
    const tAlerts: ProductAlert[] = [];
    if (td?.auditPipelinePending > 0) tAlerts.push({ message: `${td.auditPipelinePending} audits pending`, severity: "warning" });
    if (td?.pendingArchitectApplications > 0) tAlerts.push({ message: `${td.pendingArchitectApplications} architect applications pending`, severity: "info" });
    products.push({
      name: "Trackr", tag: "T", slug: "trackr", href: "/products/trackr", logoUrl: getProductLogo("trackr"),
      connected: !!td,
      mrrDisplay: td ? fc((td.mrrCents ?? 0) / 100) : null,
      stageDisplay: "Launched",
      alerts: tAlerts,
      tasks: tasksByProject.get("trackr") ?? [],
      metrics: td ? [
        { label: "Workspaces", value: s(td.totalWorkspaces) },
        { label: "Paying", value: s(td.activeSubscriptions) },
        { label: "Trialing", value: s(td.trialingSubscriptions) },
        { label: "MRR", value: fc((td.mrrCents ?? 0) / 100) },
        { label: "Tools Researched", value: s(td.totalToolsResearched) },
        { label: "API Cost MTD", value: fc(td.apiCostsMtdCents / 100) },
      ] : [],
    });

    // ── TaskSpace ──
    const tsd = taskspace.success ? (taskspace.data as any) : null;
    const tsAlerts: ProductAlert[] = [];
    if (tsd?.openEscalations > 0) tsAlerts.push({ message: `${tsd.openEscalations} open escalations`, severity: "critical" });
    if (tsd?.eodRate7Day < 50) tsAlerts.push({ message: `EOD report rate at ${tsd.eodRate7Day}% (target: 80%+)`, severity: "warning" });
    if (tsd?.rocksAtRisk > 0) tsAlerts.push({ message: `${tsd.rocksAtRisk} rocks at risk`, severity: "warning" });
    products.push({
      name: "TaskSpace", tag: "TS", slug: "taskspace", href: "/products/taskspace", logoUrl: getProductLogo("taskspace"),
      connected: !!tsd,
      mrrDisplay: tsd ? fc((tsd.mrrCents ?? 0) / 100) : null,
      stageDisplay: "Launched",
      alerts: tsAlerts,
      tasks: tasksByProject.get("taskspace") ?? [],
      metrics: tsd ? [
        { label: "Orgs", value: s(tsd.totalOrgs) },
        { label: "Members", value: s(tsd.totalMembers) },
        { label: "Paying Orgs", value: s(tsd.payingOrgs) },
        { label: "MRR", value: fc((tsd.mrrCents ?? 0) / 100) },
        { label: "Active Tasks", value: s(tsd.activeTasks) },
        { label: "EOD Rate 7d", value: `${tsd.eodRate7Day}%`, alert: tsd.eodRate7Day < 50 },
      ] : [],
    });

    // ── TBGC ──
    const tbgcd = tbgc.success ? (tbgc.data as any) : null;
    products.push({
      name: "TBGC", tag: "TB", slug: "tbgc", href: "/products/tbgc", logoUrl: getProductLogo("tbgc"),
      connected: !!tbgcd,
      mrrDisplay: tbgcd && tbgcd.mrrCents > 0 ? fc(tbgcd.mrrCents / 100) : "Pre-rev",
      stageDisplay: tbgcd?.stage ?? "Building",
      alerts: [],
      tasks: tasksByProject.get("tbgc") ?? [],
      metrics: tbgcd ? [
        { label: "Stage", value: s(tbgcd.stage) },
        { label: "MRR", value: (tbgcd.mrrCents ?? 0) > 0 ? fc(tbgcd.mrrCents / 100) : "Pre-revenue" },
        { label: "Subscriptions", value: s(tbgcd.activeSubscriptions) },
      ] : [],
    });

    // ── Hook ──
    const hd = hook.success ? (hook.data as any) : null;
    products.push({
      name: "Hook", tag: "H", slug: "hook", href: "/products/hook", logoUrl: getProductLogo("hook"),
      connected: !!hd,
      mrrDisplay: hd && hd.mrrCents > 0 ? fc(hd.mrrCents / 100) : "Pre-rev",
      stageDisplay: hd?.stage ?? "Beta",
      alerts: [],
      tasks: tasksByProject.get("hook") ?? [],
      metrics: hd ? [
        { label: "Stage", value: s(hd.stage) },
        { label: "MRR", value: (hd.mrrCents ?? 0) > 0 ? fc(hd.mrrCents / 100) : "Pre-revenue" },
        { label: "Paying", value: s(hd.activeSubscriptions) },
        { label: "Trialing", value: s(hd.trialingSubscriptions) },
      ] : [],
    });

    return products;
  },
  ["dashboard-platform-snapshots-v2"],
  { revalidate: 300 }
);
/* eslint-enable @typescript-eslint/no-explicit-any */

async function PlatformSnapshotsSection() {
  try {
    const products = await getCachedPlatformSnapshots();
    return <ProductsAccordion products={products} />;
  } catch (err) {
    console.error("[Dashboard] PlatformSnapshotsSection failed:", err);
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
            alert ? statusText.negative : "text-[#0A0A0A]"
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

async function _WholesailCard() {
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

async function _CursiveCard() {
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

async function _TrackrCard() {
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

async function _TaskSpaceCard() {
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
                  {d.rocksOnTrack > 0 && <div className={`h-full ${statusDot.positive}`} style={{ flex: d.rocksOnTrack }} title={`On-track: ${d.rocksOnTrack}`} />}
                  {d.rocksAtRisk > 0 && <div className={`h-full ${statusDot.warning}`} style={{ flex: d.rocksAtRisk }} title={`At-risk: ${d.rocksAtRisk}`} />}
                  {d.rocksBlocked > 0 && <div className={`h-full ${statusDot.negative}`} style={{ flex: d.rocksBlocked }} title={`Blocked: ${d.rocksBlocked}`} />}
                  {d.rocksCompleted > 0 && <div className={`h-full ${statusDot.neutral}`} style={{ flex: d.rocksCompleted }} title={`Completed: ${d.rocksCompleted}`} />}
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

async function _TBGCCard() {
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
              <span className={`inline-flex items-center px-2 py-0.5 font-mono text-[9px] uppercase tracking-wider ${statusBadge.warning}`}>
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

async function _HookCard() {
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
              <span className={`inline-flex items-center px-2 py-0.5 font-mono text-[9px] uppercase tracking-wider ${statusBadge.info}`}>
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

function PipelineSkeleton() {
  return (
    <div className="space-y-2">
      <div className="h-4 w-40 bg-[#0A0A0A]/5 animate-pulse" />
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="h-12 bg-[#0A0A0A]/5 animate-pulse border border-[#0A0A0A]/10" />
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
    // pb-24 keeps content above the floating chat bar
    <div className="flex flex-col lg:h-[calc(100vh-7rem)] pb-20">
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
        {/* Left column — Pipeline & Engagements + Products */}
        <div className="lg:col-span-8 lg:overflow-y-auto min-h-0 space-y-3 sm:space-y-4">
          {/* Products */}
          <Suspense fallback={<PlatformCardSkeleton />}>
            <PlatformSnapshotsSection />
          </Suspense>

          {/* Pipeline & Engagements */}
          <Suspense fallback={<PipelineSkeleton />}>
            <PipelineSection />
          </Suspense>

          {/* Cash Runway */}
          <Suspense fallback={<div className="h-24 bg-[#0A0A0A]/5 animate-pulse border border-[#0A0A0A]/10" />}>
            <CashRunwaySection />
          </Suspense>
        </div>

        {/* Side Panel — sprint, actions, quick access, activity */}
        <div className="lg:col-span-4 lg:overflow-y-auto min-h-0">
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
          ? "border-[#0A0A0A]/30 border-l-2 border-l-[#0A0A0A]"
          : "border-[#0A0A0A]/10"
      }`}
    >
      <span className="font-mono text-[9px] uppercase tracking-wider text-[#0A0A0A]/40">
        {label}
      </span>
      <span className="font-mono text-base sm:text-lg font-bold block leading-tight truncate">{value}</span>
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
