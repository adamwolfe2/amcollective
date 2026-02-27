/**
 * Inngest Job — Sync PostHog Analytics
 *
 * Daily at 2 AM PT (10:00 UTC). Pulls DAU/WAU/MAU, top pages, top events,
 * and signups for each project that has PostHog configured.
 */

import { inngest } from "../client";
import * as posthogConnector from "@/lib/connectors/posthog";
import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { and, isNotNull } from "drizzle-orm";
import { createAuditLog } from "@/lib/db/repositories/audit";

export const syncPosthogAnalytics = inngest.createFunction(
  {
    id: "sync-posthog-analytics",
    name: "Sync PostHog Analytics",
    retries: 3,
  },
  { cron: "0 10 * * *" },
  async ({ step }) => {
    // Step 1: Find projects with PostHog configured
    const projects = await step.run("find-posthog-projects", async () => {
      return db
        .select()
        .from(schema.portfolioProjects)
        .where(
          and(
            isNotNull(schema.portfolioProjects.posthogProjectId),
            isNotNull(schema.portfolioProjects.posthogApiKey)
          )
        );
    });

    if (projects.length === 0) {
      return { success: true, synced: 0, message: "No projects with PostHog configured" };
    }

    const today = new Date();
    const snapshotDate = new Date(
      today.getFullYear(),
      today.getMonth(),
      today.getDate()
    );

    let synced = 0;

    // Step 2: For each project, fetch analytics and store snapshot
    for (const project of projects) {
      await step.run(`sync-posthog-${project.id}`, async () => {
        const apiKey = project.posthogApiKey!;
        const phProjectId = project.posthogProjectId!;

        const [activeUsers, topPages, topEvents, signups, pageviews] =
          await Promise.all([
            posthogConnector.getActiveUsersForProject(apiKey, phProjectId),
            posthogConnector.getTopPagesForProject(apiKey, phProjectId, 10),
            posthogConnector.getTopEventsForProject(apiKey, phProjectId, 10),
            posthogConnector.getSignupCountForProject(apiKey, phProjectId, 30),
            posthogConnector.getPageviewsForProject(apiKey, phProjectId, 1),
          ]);

        const dau = activeUsers.success ? activeUsers.data?.dau ?? 0 : 0;
        const wau = activeUsers.success ? activeUsers.data?.wau ?? 0 : 0;
        const mau = activeUsers.success ? activeUsers.data?.mau ?? 0 : 0;

        // Sum today's pageviews
        const totalPageviews =
          pageviews.success && pageviews.data
            ? pageviews.data.reduce((sum, p) => sum + p.count, 0)
            : 0;

        await db.insert(schema.posthogSnapshots).values({
          projectId: project.id,
          dau,
          wau,
          mau,
          totalPageviews,
          topPages: topPages.success ? topPages.data : null,
          topEvents: topEvents.success ? topEvents.data : null,
          signupCount: signups.success ? signups.data ?? 0 : 0,
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
        action: "sync_posthog_analytics",
        entityType: "posthog_snapshots",
        entityId: "batch",
        metadata: { projectCount: synced },
      });
    });

    return { success: true, synced };
  }
);
