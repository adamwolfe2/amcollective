/**
 * Inngest Job — Sync Vercel Costs
 *
 * Runs nightly. Pulls Vercel project usage and writes to ToolCost table.
 * Adapted from Cursive's multi-step job pattern.
 */

import { inngest } from "../client";
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

    // Step 2: Fetch projects from Vercel
    const projectsResult = await step.run("fetch-vercel-projects", async () => {
      return vercelConnector.getProjects();
    });

    if (!projectsResult.success || !projectsResult.data) {
      return { success: false, error: projectsResult.error };
    }

    // Step 3: For each project, match to portfolio project and record cost
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

        // Record the cost entry (even without a portfolio match)
        await db.insert(schema.toolCosts).values({
          toolAccountId: toolAccount.id,
          projectId: portfolio?.id || null,
          amount: 0, // Vercel doesn't expose per-project costs easily; usage is tracked instead
          period: "monthly",
          periodStart: periodStart,
          periodEnd: periodEnd,
          metadata: {
            vercelProjectId: vProject.id,
            vercelProjectName: vProject.name,
            framework: vProject.framework,
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
