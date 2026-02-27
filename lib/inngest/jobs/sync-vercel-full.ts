/**
 * Inngest Job — Sync Vercel Full
 *
 * Daily at 1 AM PT (09:00 UTC). Pulls full project details, domains,
 * and env var counts from Vercel and stores snapshots.
 */

import { inngest } from "../client";
import * as vercelConnector from "@/lib/connectors/vercel";
import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { createAuditLog } from "@/lib/db/repositories/audit";

export const syncVercelFull = inngest.createFunction(
  {
    id: "sync-vercel-full",
    name: "Sync Vercel Full Details",
    retries: 3,
  },
  { cron: "0 9 * * *" },
  async ({ step }) => {
    // Step 1: Fetch all Vercel projects
    const projectsResult = await step.run("fetch-vercel-projects", async () => {
      return vercelConnector.getProjects();
    });

    if (!projectsResult.success || !projectsResult.data) {
      return { success: false, error: projectsResult.error };
    }

    const today = new Date();
    const snapshotDate = new Date(
      today.getFullYear(),
      today.getMonth(),
      today.getDate()
    );

    let synced = 0;

    // Step 2: For each project, get detail + domains + env count + latest deploy
    for (const vProject of projectsResult.data) {
      await step.run(`snapshot-${vProject.id}`, async () => {
        // Parallel fetch detail, domains, env count, latest deploy
        const [detailResult, domainsResult, envCountResult, deploysResult] =
          await Promise.all([
            vercelConnector.getProjectDetail(vProject.id),
            vercelConnector.getProjectDomains(vProject.id),
            vercelConnector.getProjectEnvVarCount(vProject.id),
            vercelConnector.getDeployments(vProject.id, 1),
          ]);

        // Find matching portfolio project
        const [portfolio] = await db
          .select()
          .from(schema.portfolioProjects)
          .where(eq(schema.portfolioProjects.vercelProjectId, vProject.id))
          .limit(1);

        const latestDeploy =
          deploysResult.success && deploysResult.data?.length
            ? deploysResult.data[0]
            : null;

        await db.insert(schema.vercelProjectSnapshots).values({
          projectId: portfolio?.id || null,
          vercelProjectId: vProject.id,
          framework: detailResult.success
            ? detailResult.data?.framework ?? vProject.framework
            : vProject.framework,
          envVarCount: envCountResult.success ? envCountResult.data ?? 0 : null,
          domains: domainsResult.success
            ? (domainsResult.data as unknown as Record<string, unknown>[])
            : null,
          latestDeployState: latestDeploy?.state ?? null,
          latestDeployAt: latestDeploy
            ? new Date(latestDeploy.created)
            : null,
          snapshotDate,
        });

        synced++;
      });
    }

    // Step 3: Audit log
    await step.run("audit-log", async () => {
      await createAuditLog({
        actorId: "system",
        actorType: "system",
        action: "sync_vercel_full",
        entityType: "vercel_project_snapshots",
        entityId: "batch",
        metadata: { projectCount: synced },
      });
    });

    return { success: true, synced };
  }
);
