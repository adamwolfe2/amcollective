/**
 * Cached platform snapshot aggregation for the CEO dashboard.
 * Pure data logic — no JSX. Consumed by ProductsAccordion.
 */

import { unstable_cache } from "next/cache";
import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { eq, desc, asc, isNull } from "drizzle-orm";
import * as stripeConnector from "@/lib/connectors/stripe";
import * as wholesailConnector from "@/lib/connectors/wholesail";
import * as cursiveConnector from "@/lib/connectors/cursive";
import * as trackrConnector from "@/lib/connectors/trackr";
import * as taskspaceConnector from "@/lib/connectors/taskspace";
import * as tbgcConnector from "@/lib/connectors/tbgc";
import * as hookConnector from "@/lib/connectors/hook";
import { getProductLogo } from "@/lib/ui/product-logos";
import { formatCurrency } from "@/lib/ui/format";
import type { WholesailSnapshot } from "@/lib/connectors/wholesail";
import type { CursiveSnapshot } from "@/lib/connectors/cursive";
import type { TrackrSnapshot } from "@/lib/connectors/trackr";
import type { TaskSpaceSnapshot } from "@/lib/connectors/taskspace";
import type { TBGCSnapshot } from "@/lib/connectors/tbgc";
import type { HookSnapshot } from "@/lib/connectors/hook";

// ─── Individual connector caches ─────────────────────────────────────────────

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

// ─── Types ───────────────────────────────────────────────────────────────────

export type ProductAlert = { message: string; severity: "critical" | "warning" | "info" };

export type ProductSnapshot = {
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

// ─── Aggregated snapshot fetcher ─────────────────────────────────────────────

export const getCachedPlatformSnapshots = unstable_cache(
  async (): Promise<ProductSnapshot[]> => {
    const [wholesail, cursive, trackr, taskspace, tbgc, hook, sprintTasks] = await Promise.all([
      getCachedWholesailSnapshot().catch(() => ({ success: false, data: null })),
      getCachedCursiveSnapshot().catch(() => ({ success: false, data: null })),
      getCachedTrackrSnapshot().catch(() => ({ success: false, data: null })),
      getCachedTaskSpaceSnapshot().catch(() => ({ success: false, data: null })),
      getCachedTBGCSnapshot().catch(() => ({ success: false, data: null })),
      getCachedHookSnapshot().catch(() => ({ success: false, data: null })),
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

    const products: ProductSnapshot[] = [];
    const s = (v: string | number | null | undefined) => String(v ?? 0);
    const fc = (c: number) => formatCurrency(c);

    // ── Wholesail ──
    const wd = wholesail.success ? (wholesail.data as WholesailSnapshot | null) : null;
    const wAlerts: ProductAlert[] = [];
    if (wd && wd.stuckProjects > 0) wAlerts.push({ message: `${wd.stuckProjects} stuck builds (>14d)`, severity: "critical" });
    if (wd && wd.overdueProjects > 0) wAlerts.push({ message: `${wd.overdueProjects} overdue builds`, severity: "warning" });
    if (wd && wd.intake?.pending > 0) wAlerts.push({ message: `${wd.intake.pending} pending intake submissions`, severity: "warning" });
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
    const cd = cursive.success ? (cursive.data as CursiveSnapshot | null) : null;
    const cAlerts: ProductAlert[] = [];
    if (cd && (cd.pipeline?.at_risk ?? 0) > 0) cAlerts.push({ message: `${cd.pipeline!.at_risk} at-risk workspaces`, severity: "warning" });
    if (cd && (cd.pixels?.trialsExpiringWeek ?? 0) > 0) cAlerts.push({ message: `${cd.pixels!.trialsExpiringWeek} pixel trials expiring this week`, severity: "warning" });
    if (cd && (cd.affiliates?.pendingApplications ?? 0) > 0) cAlerts.push({ message: `${cd.affiliates!.pendingApplications} pending affiliate applications`, severity: "info" });
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
    const td = trackr.success ? (trackr.data as TrackrSnapshot | null) : null;
    const tAlerts: ProductAlert[] = [];
    if (td && td.auditPipelinePending > 0) tAlerts.push({ message: `${td.auditPipelinePending} audits pending`, severity: "warning" });
    if (td && td.pendingArchitectApplications > 0) tAlerts.push({ message: `${td.pendingArchitectApplications} architect applications pending`, severity: "info" });
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
    const tsd = taskspace.success ? (taskspace.data as TaskSpaceSnapshot | null) : null;
    const tsAlerts: ProductAlert[] = [];
    if (tsd && tsd.openEscalations > 0) tsAlerts.push({ message: `${tsd.openEscalations} open escalations`, severity: "critical" });
    if (tsd && tsd.eodRate7Day < 50) tsAlerts.push({ message: `EOD report rate at ${tsd.eodRate7Day}% (target: 80%+)`, severity: "warning" });
    if (tsd && tsd.rocksAtRisk > 0) tsAlerts.push({ message: `${tsd.rocksAtRisk} rocks at risk`, severity: "warning" });
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
    const tbgcd = tbgc.success ? (tbgc.data as TBGCSnapshot | null) : null;
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
    const hd = hook.success ? (hook.data as HookSnapshot | null) : null;
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

    // ── MyVSL ──
    const myvslStripeMrr = await stripeConnector.getMRRByCompany().then(
      (r) => r.success ? (r.data?.find((c) => c.companyTag === "myvsl")?.mrr ?? 0) : 0
    ).catch(() => 0);
    products.push({
      name: "MyVSL", tag: "MV", slug: "myvsl", href: "/products/myvsl", logoUrl: getProductLogo("myvsl"),
      connected: true,
      mrrDisplay: myvslStripeMrr > 0 ? fc(myvslStripeMrr / 100) : "Pre-rev",
      stageDisplay: "Launched",
      alerts: [],
      tasks: tasksByProject.get("myvsl") ?? tasksByProject.get("flowline") ?? [],
      metrics: [
        { label: "Stage", value: "Launched" },
        { label: "MRR", value: myvslStripeMrr > 0 ? fc(myvslStripeMrr / 100) : "Pre-revenue" },
        { label: "Goal", value: "$5,000/mo" },
      ],
    });

    return products;
  },
  ["dashboard-platform-snapshots-v2"],
  { revalidate: 300 }
);
