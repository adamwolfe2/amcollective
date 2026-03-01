/**
 * AM Collective — Wholesail Connector (READ-ONLY)
 *
 * Queries Wholesail's Neon DB directly for portfolio dashboard metrics.
 * Env: WHOLESAIL_DATABASE_URL
 *
 * Key metrics: pipeline, builds, retainer MRR, costs, at-risk projects
 *
 * NOTE: Wholesail uses Prisma with PascalCase table names (quoted in SQL).
 */

import { neon } from "@neondatabase/serverless";
import { safeCall, type ConnectorResult } from "./base";

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

export interface WholesailSnapshot {
  buildsByStatus: Record<string, number>;
  activeBuilds: number;
  liveClients: number;
  newIntakesMonth: number;
  pipelineValue: number;
  mrrFromRetainers: number;
  monthlyRevenue: number;
  buildCostsMtdCents: number;
  buildCostsByService: Record<string, number>;
  stuckProjects: number;
  overdueProjects: number;
  projects: WholesailProjectSnapshot[];
}

// ─── Internals ────────────────────────────────────────────────────────────────

export function isConfigured(): boolean {
  return !!process.env.WHOLESAIL_DATABASE_URL;
}

// ─── Public API ───────────────────────────────────────────────────────────────

export async function getSnapshot(): Promise<ConnectorResult<WholesailSnapshot>> {
  if (!isConfigured()) {
    return { success: false, error: "WHOLESAIL_DATABASE_URL not set", fetchedAt: new Date() };
  }

  return safeCall(async () => {
    const sql = neon(process.env.WHOLESAIL_DATABASE_URL!);

    // Fetch all projects with key fields
    const projects = await sql(
      `SELECT id, company, status, "currentPhase", "contractValue", retainer,
              "monthlyRevenue", "targetLaunchDate", "updatedAt", "createdAt"
       FROM "Project"`
    ) as Array<{
      id: string;
      company: string;
      status: string;
      currentPhase: number;
      contractValue: number;
      retainer: number;
      monthlyRevenue: number;
      targetLaunchDate: string | null;
      updatedAt: string;
      createdAt: string;
    }>;

    // Intake submissions this month
    const intakeRows = await sql(
      `SELECT COUNT(*) as count FROM "IntakeSubmission"
       WHERE "createdAt" > DATE_TRUNC('month', NOW())`
    ) as Array<{ count: string }>;
    const newIntakesMonth = parseInt(intakeRows[0]?.count ?? "0", 10);

    // Costs MTD grouped by service
    const costRows = await sql(
      `SELECT service, COALESCE(SUM("amountCents"), 0) as total
       FROM "ProjectCost"
       WHERE date > DATE_TRUNC('month', NOW())
       GROUP BY service`
    ) as Array<{ service: string; total: string }>;
    const buildCostsByService: Record<string, number> = {};
    let buildCostsMtdCents = 0;
    for (const r of costRows) {
      const amt = parseInt(r.total, 10);
      buildCostsByService[r.service] = amt;
      buildCostsMtdCents += amt;
    }

    // Total costs per project (all time)
    const projectCosts = await sql(
      `SELECT "projectId", COALESCE(SUM("amountCents"), 0) as total
       FROM "ProjectCost"
       GROUP BY "projectId"`
    ) as Array<{ projectId: string; total: string }>;
    const costMap = new Map(projectCosts.map((r) => [r.projectId, parseInt(r.total, 10)]));

    // Last activity per project (most recent note)
    const lastNotes = await sql(
      `SELECT "projectId", MAX("createdAt") as last_at
       FROM "ProjectNote"
       GROUP BY "projectId"`
    ) as Array<{ projectId: string; last_at: string }>;
    const lastActivityMap = new Map(lastNotes.map((r) => [r.projectId, r.last_at]));

    const now = Date.now();
    const today = new Date().toISOString().split("T")[0];

    // Build per-project snapshots and aggregates
    const buildsByStatus: Record<string, number> = {};
    let activeBuilds = 0;
    let liveClients = 0;
    let pipelineValue = 0;
    let mrrFromRetainers = 0;
    let monthlyRevenue = 0;
    let stuckProjects = 0;
    let overdueProjects = 0;

    const projectSnapshots: WholesailProjectSnapshot[] = projects.map((p) => {
      // Status counts
      buildsByStatus[p.status] = (buildsByStatus[p.status] ?? 0) + 1;

      if (p.status !== "CHURNED" && p.status !== "LIVE") {
        activeBuilds++;
      }
      if (p.status === "LIVE") {
        liveClients++;
        mrrFromRetainers += p.retainer;
        monthlyRevenue += p.monthlyRevenue;
      }
      if (p.status !== "CHURNED") {
        pipelineValue += p.contractValue;
      }

      const totalCostCents = costMap.get(p.id) ?? 0;
      const contractCents = p.contractValue * 100;
      const marginPct = contractCents > 0
        ? Math.round(((contractCents - totalCostCents) / contractCents) * 100)
        : 0;

      const daysInStatus = Math.floor((now - new Date(p.updatedAt).getTime()) / (1000 * 60 * 60 * 24));
      if (daysInStatus > 14 && p.status !== "LIVE" && p.status !== "CHURNED") {
        stuckProjects++;
      }

      const launchDate = p.targetLaunchDate
        ? new Date(p.targetLaunchDate).toISOString().split("T")[0]
        : null;
      const isOverdue = !!(
        launchDate &&
        launchDate < today &&
        p.status !== "LIVE" &&
        p.status !== "CHURNED"
      );
      if (isOverdue) overdueProjects++;

      const lastActivity = lastActivityMap.get(p.id) ?? null;

      return {
        id: p.id,
        company: p.company,
        status: p.status,
        currentPhase: p.currentPhase,
        contractValue: p.contractValue,
        retainer: p.retainer,
        totalCostCents,
        marginPct,
        daysInStatus,
        targetLaunchDate: launchDate,
        isOverdue,
        lastActivityAt: lastActivity,
      };
    });

    return {
      buildsByStatus,
      activeBuilds,
      liveClients,
      newIntakesMonth,
      pipelineValue,
      mrrFromRetainers,
      monthlyRevenue,
      buildCostsMtdCents,
      buildCostsByService,
      stuckProjects,
      overdueProjects,
      projects: projectSnapshots,
    };
  });
}
