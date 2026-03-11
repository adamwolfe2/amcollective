/**
 * Inngest Job — Sync Vercel Costs
 *
 * Runs nightly. Pulls Vercel project usage and writes to ToolCost table.
 * Adapted from Cursive's multi-step job pattern.
 */

import { inngest } from "../client";
import { captureError } from "@/lib/errors";
import * as vercelConnector from "@/lib/connectors/vercel";
import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { createAuditLog } from "@/lib/db/repositories/audit";

export const syncVercelCosts = inngest.createFunction(
  {
    id: "sync-vercel-costs",
    name: "Sync Vercel Costs",
    retries: 3,
    onFailure: async ({ error }) => {
      captureError(error, {
        tags: { source: "inngest", job: "sync-vercel-costs" },
        level: "error",
      });
    },
  },
  // Run nightly at midnight PT (08:00 UTC)
  { cron: "0 8 * * *" },
  async ({ step }) => {
    // Step 1: Ensure Vercel tool account exists
    const toolAccount = await step.run("ensure-tool-account", async () => {
      const existing = await db
        .select()
        .from(schema.toolAccounts)
        .where(eq(schema.toolAccounts.name, "Vercel"))
        .limit(1);

      if (existing.length > 0) return existing[0];

      const [created] = await db
        .insert(schema.toolAccounts)
        .values({
          name: "Vercel",
          accountId: process.env.VERCEL_TEAM_ID || null,
        })
        .returning();
      return created;
    });

    // Step 2: Fetch projects + team usage in parallel
    const [projectsResult, usageResult, activityResult] = await step.run(
      "fetch-vercel-data",
      async () =>
        Promise.all([
          vercelConnector.getProjects(),
          vercelConnector.getUsage(),
          vercelConnector.getPortfolioActivity(),
        ])
    );

    if (!projectsResult.success || !projectsResult.data) {
      return { success: false, error: projectsResult.error };
    }

    // Calculate team-level overage costs (Vercel Pro plan inclusions)
    // Pro includes: 1 TB bandwidth, 6000 build minutes, 1M function invocations/month
    const usage = usageResult.data;
    const BANDWIDTH_INCLUDED_BYTES = 1_000_000_000_000; // 1 TB
    const BUILD_MINS_INCLUDED = 6_000;
    const INVOCATIONS_INCLUDED = 1_000_000;

    const bandwidthOverageBytes = Math.max(
      0,
      (usage?.bandwidthBytes ?? 0) - BANDWIDTH_INCLUDED_BYTES
    );
    const buildMinsOverage = Math.max(
      0,
      (usage?.buildMinutes ?? 0) - BUILD_MINS_INCLUDED
    );
    const invocationsOverage = Math.max(
      0,
      (usage?.functionInvocations ?? 0) - INVOCATIONS_INCLUDED
    );

    // Overage pricing: $0.15/GB bandwidth, $0.40/hr build, $0.60/1M invocations
    const totalOverageCents = Math.round(
      (bandwidthOverageBytes / 1e9) * 15 +
        (buildMinsOverage / 60) * 40 +
        (invocationsOverage / 1_000_000) * 60
    );

    // Distribute costs proportionally by deploy count across known projects
    const activities = activityResult.data?.projects ?? [];
    const totalDeploys = activities.reduce((s, a) => s + a.totalDeploys, 0);

    const now = new Date();
    const periodStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const periodEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);

    let synced = 0;

    for (const vProject of projectsResult.data) {
      await step.run(`sync-project-${vProject.id}`, async () => {
        // Find matching portfolio project by vercelProjectId
        const [portfolio] = await db
          .select()
          .from(schema.portfolioProjects)
          .where(eq(schema.portfolioProjects.vercelProjectId, vProject.id))
          .limit(1);

        // Proportional overage cost based on this project's deploy share
        const projectActivity = activities.find((a) => a.projectId === vProject.id);
        const deployShare =
          totalDeploys > 0 && projectActivity
            ? projectActivity.totalDeploys / totalDeploys
            : 1 / Math.max(projectsResult.data!.length, 1);
        const projectCostCents = Math.round(totalOverageCents * deployShare);

        await db.insert(schema.toolCosts).values({
          toolAccountId: toolAccount.id,
          projectId: portfolio?.id || null,
          amount: projectCostCents,
          period: "monthly",
          periodStart: periodStart,
          periodEnd: periodEnd,
          metadata: {
            vercelProjectId: vProject.id,
            vercelProjectName: vProject.name,
            framework: vProject.framework,
            teamBandwidthBytes: usage?.bandwidthBytes ?? 0,
            teamBuildMinutes: usage?.buildMinutes ?? 0,
            teamInvocations: usage?.functionInvocations ?? 0,
            teamOverageCents: totalOverageCents,
            projectDeployShare: Math.round(deployShare * 100) / 100,
            projectDeploys: projectActivity?.totalDeploys ?? 0,
          },
        });

        synced++;
      });
    }

    // Step 4: Audit log
    await step.run("audit-log", async () => {
      await createAuditLog({
        actorId: "system",
        actorType: "system",
        action: "sync_vercel_costs",
        entityType: "tool_costs",
        entityId: toolAccount.id,
        metadata: { projectCount: synced },
      });
    });

    return { success: true, synced };
  }
);
