/**
 * Inngest Job — Sync Neon Usage
 *
 * Runs nightly. Pulls Neon compute hours + storage per project.
 * Adapted from Cursive's multi-step job pattern.
 */

import { inngest } from "../client";
import * as neonConnector from "@/lib/connectors/neon";
import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { createAuditLog } from "@/lib/db/repositories/audit";

export const syncNeonUsage = inngest.createFunction(
  {
    id: "sync-neon-usage",
    name: "Sync Neon Usage",
    retries: 3,
  },
  { cron: "30 8 * * *" }, // Nightly at 00:30 PT (08:30 UTC), after Vercel sync
  async ({ step }) => {
    // Step 1: Ensure Neon tool account exists
    const toolAccount = await step.run("ensure-tool-account", async () => {
      const existing = await db
        .select()
        .from(schema.toolAccounts)
        .where(eq(schema.toolAccounts.name, "Neon"))
        .limit(1);

      if (existing.length > 0) return existing[0];

      const [created] = await db
        .insert(schema.toolAccounts)
        .values({ name: "Neon" })
        .returning();
      return created;
    });

    // Step 2: Fetch Neon projects
    const projectsResult = await step.run("fetch-neon-projects", async () => {
      return neonConnector.getProjects();
    });

    if (!projectsResult.success || !projectsResult.data) {
      return { success: false, error: projectsResult.error };
    }

    const now = new Date();
    const periodStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const periodEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    let synced = 0;

    // Step 3: Fetch usage + size for each project
    for (const nProject of projectsResult.data) {
      await step.run(`sync-neon-${nProject.id}`, async () => {
        const [usageResult, sizeResult] = await Promise.all([
          neonConnector.getProjectUsage(nProject.id),
          neonConnector.getDatabaseSize(nProject.id),
        ]);

        await db.insert(schema.toolCosts).values({
          toolAccountId: toolAccount.id,
          amount: 0, // Neon pricing is compute-hour based; tracked in metadata
          period: "monthly",
          periodStart: periodStart,
          periodEnd: periodEnd,
          metadata: {
            neonProjectId: nProject.id,
            neonProjectName: nProject.name,
            usage: usageResult.data ?? null,
            sizeMB: sizeResult.data?.sizeMB ?? null,
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
        action: "sync_neon_usage",
        entityType: "tool_costs",
        entityId: toolAccount.id,
        metadata: { projectCount: synced },
      });
    });

    return { success: true, synced };
  }
);
