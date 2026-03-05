/**
 * AM Collective — Wholesail Connector (READ-ONLY)
 *
 * Primary: HTTP endpoint GET /api/connector/stats (requires WHOLESAIL_CONNECTOR_SECRET)
 * Fallback: Direct Neon DB query (requires WHOLESAIL_DATABASE_URL)
 *
 * 5-minute cache, graceful degradation on error.
 */

import { neon } from "@neondatabase/serverless";
import { safeCall, cached, type ConnectorResult } from "./base";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface WholesailProjectSnapshot {
  id: string;
  company: string;
  status: string;
  currentPhase: number;
  contractValue: number;
  retainer: number;
  totalCostCents: number;
  marginPct: number;
  daysInStatus: number;
  targetLaunchDate: string | null;
  isOverdue: boolean;
  lastActivityAt: string | null;
}

export interface WholesailIntakeFunnel {
  pending: number;
  reviewed: number;
  converted: number;
  archived?: number;
  total: number;
}

export interface WholesailRecentActivity {
  type: string;
  company: string;
  status?: string;
  ts: string;
}

export interface WholesailSnapshot {
  // Pipeline counts (from HTTP or DB)
  buildsByStatus: Record<string, number>;
  activeBuilds: number;
  liveClients: number;
  newIntakesMonth: number;
  pipelineValue: number;
  mrrFromRetainers: number;
  monthlyRevenue: number;
  buildCostsMtdCents: number;
  buildCostsByService: Record<string, number>;
  buildCostsAllTimeCents: number;
  stuckProjects: number;
  overdueProjects: number;
  intake: WholesailIntakeFunnel;
  unreadMessages: number;
  recentActivity: WholesailRecentActivity[];
  // Source info
  source: "http" | "db";
  // Per-project detail (DB only)
  projects?: WholesailProjectSnapshot[];
}

// ─── HTTP connector response shape ───────────────────────────────────────────

interface ConnectorStatsResponse {
  ts: string;
  pipeline: Record<string, number>;
  intakes: { pending: number; reviewed: number; converted: number; archived?: number; total: number };
  projects: { active: number; total: number; byStatus: Record<string, number> };
  revenue: { totalContractValue: number; totalMonthlyRetainer: number; totalMrr: number };
  buildCosts: { totalAllTime: number; mtd: number; byService: Record<string, number> };
  unreadMessages: number;
  recentActivity: WholesailRecentActivity[];
}

// ─── Internals ────────────────────────────────────────────────────────────────

export function isConfigured(): boolean {
  return !!(process.env.WHOLESAIL_CONNECTOR_SECRET || process.env.WHOLESAIL_DATABASE_URL);
}

// ─── HTTP Endpoint (preferred) ────────────────────────────────────────────────

async function fetchFromHttp(): Promise<WholesailSnapshot> {
  const secret = process.env.WHOLESAIL_CONNECTOR_SECRET!;
  const res = await fetch("https://wholesailhub.com/api/connector/stats", {
    method: "GET",
    headers: { "x-connector-secret": secret },
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) throw new Error(`Wholesail connector returned ${res.status}`);
  const d = await res.json() as ConnectorStatsResponse;

  // Map pipeline stages to our buildsByStatus (HTTP uses lowercase names)
  const buildsByStatus: Record<string, number> = {};
  for (const [stage, count] of Object.entries(d.pipeline ?? {})) {
    buildsByStatus[stage.toUpperCase()] = count;
  }

  return {
    buildsByStatus,
    activeBuilds: d.projects?.active ?? 0,
    liveClients: d.pipeline?.live ?? 0,
    newIntakesMonth: d.intakes?.total ?? 0,
    pipelineValue: d.revenue?.totalContractValue ?? 0,
    mrrFromRetainers: d.revenue?.totalMonthlyRetainer ?? 0,
    monthlyRevenue: d.revenue?.totalMrr ?? 0,
    buildCostsMtdCents: d.buildCosts?.mtd ?? 0,
    buildCostsByService: d.buildCosts?.byService ?? {},
    buildCostsAllTimeCents: d.buildCosts?.totalAllTime ?? 0,
    stuckProjects: 0, // not available via HTTP
    overdueProjects: 0, // not available via HTTP
    intake: {
      pending: d.intakes?.pending ?? 0,
      reviewed: d.intakes?.reviewed ?? 0,
      converted: d.intakes?.converted ?? 0,
      archived: d.intakes?.archived,
      total: d.intakes?.total ?? 0,
    },
    unreadMessages: d.unreadMessages ?? 0,
    recentActivity: d.recentActivity ?? [],
    source: "http",
  };
}

// ─── DB Fallback ──────────────────────────────────────────────────────────────

async function fetchFromDb(): Promise<WholesailSnapshot> {
  const sql = neon(process.env.WHOLESAIL_DATABASE_URL!);

  // Fetch all projects
  const projects = await sql(
    `SELECT id, company, status, "currentPhase", "contractValue", retainer,
            "monthlyRevenue", "targetLaunchDate", "updatedAt", "createdAt"
     FROM "Project"`
  ) as Array<{
    id: string; company: string; status: string; currentPhase: number;
    contractValue: number; retainer: number; monthlyRevenue: number;
    targetLaunchDate: string | null; updatedAt: string; createdAt: string;
  }>;

  // Intakes this month
  const intakeRows = await sql(
    `SELECT COUNT(*) as count FROM "IntakeSubmission" WHERE "createdAt" > DATE_TRUNC('month', NOW())`
  ) as Array<{ count: string }>;
  const newIntakesMonth = parseInt(intakeRows[0]?.count ?? "0", 10);

  // Intake funnel
  const [intakePendingRows, intakeReviewedRows, intakeConvertedRows, intakeTotalRows] = await Promise.all([
    sql(`SELECT COUNT(*) as count FROM "IntakeSubmission" WHERE "reviewedAt" IS NULL AND "projectId" IS NULL`),
    sql(`SELECT COUNT(*) as count FROM "IntakeSubmission" WHERE "reviewedAt" IS NOT NULL AND "projectId" IS NULL`),
    sql(`SELECT COUNT(*) as count FROM "IntakeSubmission" WHERE "projectId" IS NOT NULL`),
    sql(`SELECT COUNT(*) as count FROM "IntakeSubmission"`),
  ]) as Array<Array<{ count: string }>>;

  const intake: WholesailIntakeFunnel = {
    pending: parseInt(intakePendingRows[0]?.count ?? "0", 10),
    reviewed: parseInt(intakeReviewedRows[0]?.count ?? "0", 10),
    converted: parseInt(intakeConvertedRows[0]?.count ?? "0", 10),
    total: parseInt(intakeTotalRows[0]?.count ?? "0", 10),
  };

  // Costs MTD + all time
  const costRows = await sql(
    `SELECT service, COALESCE(SUM("amountCents"), 0) as total FROM "ProjectCost"
     WHERE date > DATE_TRUNC('month', NOW()) GROUP BY service`
  ) as Array<{ service: string; total: string }>;
  const buildCostsByService: Record<string, number> = {};
  let buildCostsMtdCents = 0;
  for (const r of costRows) {
    const amt = parseInt(r.total, 10);
    buildCostsByService[r.service] = amt;
    buildCostsMtdCents += amt;
  }

  const [allTimeCostRow] = await sql(
    `SELECT COALESCE(SUM("amountCents"), 0) as total FROM "ProjectCost"`
  ) as Array<{ total: string }>;
  const buildCostsAllTimeCents = parseInt(allTimeCostRow?.total ?? "0", 10);

  // Project costs map
  const projectCosts = await sql(
    `SELECT "projectId", COALESCE(SUM("amountCents"), 0) as total FROM "ProjectCost" GROUP BY "projectId"`
  ) as Array<{ projectId: string; total: string }>;
  const costMap = new Map(projectCosts.map((r) => [r.projectId, parseInt(r.total, 10)]));

  // Last activity per project
  const lastNotes = await sql(
    `SELECT "projectId", MAX("createdAt") as last_at FROM "ProjectNote" GROUP BY "projectId"`
  ) as Array<{ projectId: string; last_at: string }>;
  const lastActivityMap = new Map(lastNotes.map((r) => [r.projectId, r.last_at]));

  const now = Date.now();
  const today = new Date().toISOString().split("T")[0];
  const buildsByStatus: Record<string, number> = {};
  let activeBuilds = 0;
  let liveClients = 0;
  let pipelineValue = 0;
  let mrrFromRetainers = 0;
  let monthlyRevenue = 0;
  let stuckProjects = 0;
  let overdueProjects = 0;

  const projectSnapshots: WholesailProjectSnapshot[] = projects.map((p) => {
    buildsByStatus[p.status] = (buildsByStatus[p.status] ?? 0) + 1;
    if (p.status !== "CHURNED" && p.status !== "LIVE") activeBuilds++;
    if (p.status === "LIVE") {
      liveClients++;
      mrrFromRetainers += p.retainer;
      monthlyRevenue += p.monthlyRevenue;
    }
    if (p.status !== "CHURNED") pipelineValue += p.contractValue;

    const totalCostCents = costMap.get(p.id) ?? 0;
    const contractCents = p.contractValue * 100;
    const marginPct = contractCents > 0 ? Math.round(((contractCents - totalCostCents) / contractCents) * 100) : 0;
    const daysInStatus = Math.floor((now - new Date(p.updatedAt).getTime()) / (1000 * 60 * 60 * 24));
    if (daysInStatus > 14 && p.status !== "LIVE" && p.status !== "CHURNED") stuckProjects++;

    const launchDate = p.targetLaunchDate ? new Date(p.targetLaunchDate).toISOString().split("T")[0] : null;
    const isOverdue = !!(launchDate && launchDate < today && p.status !== "LIVE" && p.status !== "CHURNED");
    if (isOverdue) overdueProjects++;

    return {
      id: p.id, company: p.company, status: p.status, currentPhase: p.currentPhase,
      contractValue: p.contractValue, retainer: p.retainer, totalCostCents, marginPct,
      daysInStatus, targetLaunchDate: launchDate, isOverdue,
      lastActivityAt: lastActivityMap.get(p.id) ?? null,
    };
  });

  return {
    buildsByStatus, activeBuilds, liveClients, newIntakesMonth, pipelineValue,
    mrrFromRetainers, monthlyRevenue, buildCostsMtdCents, buildCostsByService,
    buildCostsAllTimeCents, stuckProjects, overdueProjects, intake,
    unreadMessages: 0, recentActivity: [], source: "db",
    projects: projectSnapshots,
  };
}

// ─── Public API ───────────────────────────────────────────────────────────────

export async function getSnapshot(): Promise<ConnectorResult<WholesailSnapshot>> {
  if (!isConfigured()) {
    return { success: false, error: "Neither WHOLESAIL_CONNECTOR_SECRET nor WHOLESAIL_DATABASE_URL is set", fetchedAt: new Date() };
  }

  return cached("wholesail:snapshot", () =>
    safeCall(async () => {
      // Prefer HTTP endpoint when secret is available
      if (process.env.WHOLESAIL_CONNECTOR_SECRET) {
        return fetchFromHttp();
      }
      return fetchFromDb();
    })
  );
}
