/**
 * AM Collective — TaskSpace Connector (READ-ONLY)
 *
 * Queries TaskSpace's Neon DB directly for portfolio dashboard metrics.
 * Env: TASKSPACE_DATABASE_URL
 *
 * Key metrics: orgs, members, EOD rates, tasks, rocks, escalations
 */

import { neon } from "@neondatabase/serverless";
import { safeCall, type ConnectorResult } from "./base";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface TaskSpaceOrgSnapshot {
  id: string;
  name: string;
  slug: string;
  memberCount: number;
  eodsToday: number;
  eodRate7Day: number;
  activeTasks: number;
  completedTasksWeek: number;
  openEscalations: number;
  rockHealth: {
    onTrack: number;
    atRisk: number;
    blocked: number;
    completed: number;
  };
  avgRockProgress: number;
  riskLevel: "healthy" | "warning" | "critical";
}

export interface TaskSpaceSnapshot {
  totalOrgs: number;
  totalMembers: number;
  eodsToday: number;
  eodRate7Day: number;
  activeTasks: number;
  completedTasksThisWeek: number;
  openEscalations: number;
  rocksOnTrack: number;
  rocksAtRisk: number;
  rocksBlocked: number;
  rocksCompleted: number;
  avgRockProgress: number;
  orgs: TaskSpaceOrgSnapshot[];
}

// ─── Internals ────────────────────────────────────────────────────────────────

export function isConfigured(): boolean {
  return !!process.env.TASKSPACE_DATABASE_URL;
}

// ─── Public API ───────────────────────────────────────────────────────────────

export async function getSnapshot(): Promise<ConnectorResult<TaskSpaceSnapshot>> {
  if (!isConfigured()) {
    return { success: false, error: "TASKSPACE_DATABASE_URL not set", fetchedAt: new Date() };
  }

  return safeCall(async () => {
    const sql = neon(process.env.TASKSPACE_DATABASE_URL!);

    // Get all organizations
    const orgsRows = await sql(
      "SELECT id, name, slug FROM organizations"
    ) as Array<{ id: string; name: string; slug: string }>;

    // Per-org member counts (active only)
    const memberCounts = await sql(
      "SELECT organization_id, COUNT(*) as count FROM organization_members WHERE status = 'active' GROUP BY organization_id"
    ) as Array<{ organization_id: string; count: string }>;
    const memberMap = new Map(memberCounts.map((r) => [r.organization_id, parseInt(r.count, 10)]));

    // Today's EODs per org
    const todayEods = await sql(
      "SELECT organization_id, COUNT(*) as count FROM eod_reports WHERE date = CURRENT_DATE GROUP BY organization_id"
    ) as Array<{ organization_id: string; count: string }>;
    const eodTodayMap = new Map(todayEods.map((r) => [r.organization_id, parseInt(r.count, 10)]));

    // 7-day EOD rate per org: (unique user-days with EOD) / (active members * 7) * 100
    const eod7d = await sql(
      `SELECT organization_id, COUNT(DISTINCT (user_id || '-' || date::text)) as eod_count
       FROM eod_reports
       WHERE date > CURRENT_DATE - INTERVAL '7 days'
       GROUP BY organization_id`
    ) as Array<{ organization_id: string; eod_count: string }>;
    const eod7dMap = new Map(eod7d.map((r) => [r.organization_id, parseInt(r.eod_count, 10)]));

    // Active tasks per org
    const activeTasks = await sql(
      "SELECT organization_id, COUNT(*) as count FROM assigned_tasks WHERE status IN ('pending', 'in-progress') GROUP BY organization_id"
    ) as Array<{ organization_id: string; count: string }>;
    const activeTaskMap = new Map(activeTasks.map((r) => [r.organization_id, parseInt(r.count, 10)]));

    // Completed tasks this week per org
    const completedTasks = await sql(
      "SELECT organization_id, COUNT(*) as count FROM assigned_tasks WHERE status = 'completed' AND completed_at > NOW() - INTERVAL '7 days' GROUP BY organization_id"
    ) as Array<{ organization_id: string; count: string }>;
    const completedTaskMap = new Map(completedTasks.map((r) => [r.organization_id, parseInt(r.count, 10)]));

    // Open escalations (last 7 days) per org
    const escalations = await sql(
      "SELECT organization_id, COUNT(*) as count FROM eod_reports WHERE needs_escalation = true AND date > CURRENT_DATE - INTERVAL '7 days' GROUP BY organization_id"
    ) as Array<{ organization_id: string; count: string }>;
    const escalationMap = new Map(escalations.map((r) => [r.organization_id, parseInt(r.count, 10)]));

    // Rock statuses per org
    const rockStats = await sql(
      `SELECT organization_id, status, COUNT(*) as count, COALESCE(AVG(progress), 0) as avg_progress
       FROM rocks
       GROUP BY organization_id, status`
    ) as Array<{ organization_id: string; status: string; count: string; avg_progress: string }>;

    // Build rock maps
    const rockMap = new Map<string, { onTrack: number; atRisk: number; blocked: number; completed: number; totalProgress: number; totalCount: number }>();
    for (const r of rockStats) {
      if (!rockMap.has(r.organization_id)) {
        rockMap.set(r.organization_id, { onTrack: 0, atRisk: 0, blocked: 0, completed: 0, totalProgress: 0, totalCount: 0 });
      }
      const entry = rockMap.get(r.organization_id)!;
      const cnt = parseInt(r.count, 10);
      const avgProg = parseFloat(r.avg_progress);
      entry.totalProgress += avgProg * cnt;
      entry.totalCount += cnt;
      switch (r.status) {
        case "on-track": entry.onTrack += cnt; break;
        case "at-risk": entry.atRisk += cnt; break;
        case "blocked": entry.blocked += cnt; break;
        case "completed": entry.completed += cnt; break;
      }
    }

    // Build per-org snapshots
    const orgSnapshots: TaskSpaceOrgSnapshot[] = orgsRows.map((org) => {
      const members = memberMap.get(org.id) ?? 0;
      const eodsToday = eodTodayMap.get(org.id) ?? 0;
      const eodCount7d = eod7dMap.get(org.id) ?? 0;
      const eodRate7Day = members > 0 ? Math.round((eodCount7d / (members * 7)) * 100) : 0;
      const active = activeTaskMap.get(org.id) ?? 0;
      const completed = completedTaskMap.get(org.id) ?? 0;
      const openEsc = escalationMap.get(org.id) ?? 0;
      const rocks = rockMap.get(org.id) ?? { onTrack: 0, atRisk: 0, blocked: 0, completed: 0, totalProgress: 0, totalCount: 0 };
      const avgRockProgress = rocks.totalCount > 0 ? Math.round(rocks.totalProgress / rocks.totalCount) : 0;

      // Risk level computation
      let riskLevel: "healthy" | "warning" | "critical" = "healthy";
      if (openEsc >= 3 || eodRate7Day < 30) {
        riskLevel = "critical";
      } else if (openEsc >= 1 || eodRate7Day < 60 || rocks.blocked > 0) {
        riskLevel = "warning";
      }

      return {
        id: org.id,
        name: org.name,
        slug: org.slug,
        memberCount: members,
        eodsToday,
        eodRate7Day,
        activeTasks: active,
        completedTasksWeek: completed,
        openEscalations: openEsc,
        rockHealth: { onTrack: rocks.onTrack, atRisk: rocks.atRisk, blocked: rocks.blocked, completed: rocks.completed },
        avgRockProgress,
        riskLevel,
      };
    });

    // Aggregate totals
    const totalOrgs = orgSnapshots.length;
    const totalMembers = orgSnapshots.reduce((s, o) => s + o.memberCount, 0);
    const eodsToday = orgSnapshots.reduce((s, o) => s + o.eodsToday, 0);
    const totalActiveTasks = orgSnapshots.reduce((s, o) => s + o.activeTasks, 0);
    const totalCompletedWeek = orgSnapshots.reduce((s, o) => s + o.completedTasksWeek, 0);
    const totalEscalations = orgSnapshots.reduce((s, o) => s + o.openEscalations, 0);
    const rocksOnTrack = orgSnapshots.reduce((s, o) => s + o.rockHealth.onTrack, 0);
    const rocksAtRisk = orgSnapshots.reduce((s, o) => s + o.rockHealth.atRisk, 0);
    const rocksBlocked = orgSnapshots.reduce((s, o) => s + o.rockHealth.blocked, 0);
    const rocksCompleted = orgSnapshots.reduce((s, o) => s + o.rockHealth.completed, 0);

    // Weighted average EOD rate across orgs
    const totalEod7d = orgSnapshots.reduce((s, o) => {
      const members = o.memberCount;
      return s + (members > 0 ? o.eodRate7Day * members : 0);
    }, 0);
    const eodRate7Day = totalMembers > 0 ? Math.round(totalEod7d / totalMembers) : 0;

    // Weighted average rock progress
    const allRockEntries = Array.from(rockMap.values());
    const totalRockCount = allRockEntries.reduce((s, e) => s + e.totalCount, 0);
    const totalRockProgress = allRockEntries.reduce((s, e) => s + e.totalProgress, 0);
    const avgRockProgress = totalRockCount > 0 ? Math.round(totalRockProgress / totalRockCount) : 0;

    return {
      totalOrgs,
      totalMembers,
      eodsToday,
      eodRate7Day,
      activeTasks: totalActiveTasks,
      completedTasksThisWeek: totalCompletedWeek,
      openEscalations: totalEscalations,
      rocksOnTrack,
      rocksAtRisk,
      rocksBlocked,
      rocksCompleted,
      avgRockProgress,
      orgs: orgSnapshots,
    };
  });
}
