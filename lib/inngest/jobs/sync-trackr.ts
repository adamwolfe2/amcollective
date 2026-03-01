/**
 * Inngest Job — Sync Trackr Metrics
 *
 * Runs every 15 minutes. Queries Trackr's Neon DB and upserts a snapshot
 * into project_metric_snapshots for the AM Collective master dashboard.
 *
 * Uses TRACKR_DATABASE_URL env var — read-only SELECT queries only.
 */

import { inngest } from "../client";
import { captureError } from "@/lib/errors";
import { getSnapshot, isConfigured } from "@/lib/connectors/trackr";
import { db } from "@/lib/db";
import { projectMetricSnapshots, syncRuns } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

export const syncTrackr = inngest.createFunction(
  {
    id: "sync-trackr",
    name: "Sync Trackr Metrics",
    retries: 2,
    onFailure: async ({ error }) => {
      captureError(error, {
        tags: { source: "inngest", job: "sync-trackr" },
        level: "warning",
      });
    },
  },
  { cron: "*/15 * * * *" }, // every 15 minutes
  async ({ step }) => {
    if (!isConfigured()) {
      return { skipped: true, reason: "TRACKR_DATABASE_URL not set" };
    }

    // Step 1: Record sync start
    const [syncRun] = await step.run("start-sync-run", async () => {
      return db.insert(syncRuns).values({
        service: "trackr",
        status: "running",
        triggeredBy: "system",
      }).returning();
    });

    // Step 2: Fetch snapshot from Trackr DB
    const result = await step.run("fetch-trackr-snapshot", async () => {
      return getSnapshot();
    });

    // Step 3: Upsert into project_metric_snapshots
    await step.run("upsert-snapshot", async () => {
      if (!result.success || !result.data) {
        await db.update(syncRuns).set({
          status: "error",
          errorMessage: result.error ?? "Unknown error",
          completedAt: new Date(),
        }).where(eq(syncRuns.id, syncRun.id));

        // Still upsert an error state so the dashboard shows it
        await db.insert(projectMetricSnapshots).values({
          projectSlug: "trackr",
          mrrCents: 0,
          activeUsers: 0,
          newUsersWeek: 0,
          activeSubscriptions: 0,
          primaryMetricLabel: "Audit submissions (7d)",
          primaryMetricValue: 0,
          secondaryMetricLabel: "Active subscriptions",
          secondaryMetricValue: 0,
          healthScore: 0,
          syncStatus: "error",
          errorMessage: result.error?.slice(0, 500) ?? "Sync failed",
          rawMetrics: null,
          syncedAt: new Date(),
        }).onConflictDoUpdate({
          target: projectMetricSnapshots.projectSlug,
          set: {
            syncStatus: "error",
            errorMessage: result.error?.slice(0, 500) ?? "Sync failed",
            healthScore: 0,
            syncedAt: new Date(),
          },
        });
        return;
      }

      const snap = result.data;

      // Health score: starts at 100, penalize for issues
      let healthScore = 100;
      if (snap.activeSubscriptions === 0) healthScore -= 30;
      if (snap.auditPipelinePending > 10) healthScore -= 15; // backlog
      if (snap.newWorkspacesWeek === 0) healthScore -= 10;
      if (snap.apiCostsMtdCents > 5000 * 100) healthScore -= 10; // >$5k API spend
      healthScore = Math.max(0, healthScore);

      await db.insert(projectMetricSnapshots).values({
        projectSlug: "trackr",
        mrrCents: snap.mrrCents,
        activeUsers: snap.totalWorkspaces,
        newUsersWeek: snap.newWorkspacesWeek,
        activeSubscriptions: snap.activeSubscriptions,
        primaryMetricLabel: "Audit submissions (7d)",
        primaryMetricValue: snap.auditSubmissionsLastWeek,
        secondaryMetricLabel: "Tools researched",
        secondaryMetricValue: snap.totalToolsResearched,
        healthScore,
        syncStatus: "ok",
        errorMessage: null,
        rawMetrics: snap as unknown as Record<string, unknown>,
        syncedAt: new Date(),
      }).onConflictDoUpdate({
        target: projectMetricSnapshots.projectSlug,
        set: {
          mrrCents: snap.mrrCents,
          activeUsers: snap.totalWorkspaces,
          newUsersWeek: snap.newWorkspacesWeek,
          activeSubscriptions: snap.activeSubscriptions,
          primaryMetricLabel: "Audit submissions (7d)",
          primaryMetricValue: snap.auditSubmissionsLastWeek,
          secondaryMetricLabel: "Tools researched",
          secondaryMetricValue: snap.totalToolsResearched,
          healthScore,
          syncStatus: "ok",
          errorMessage: null,
          rawMetrics: snap as unknown as Record<string, unknown>,
          syncedAt: new Date(),
        },
      });
    });

    // Step 4: Mark sync complete
    await step.run("complete-sync-run", async () => {
      await db.update(syncRuns).set({
        status: "success",
        recordsProcessed: 1,
        completedAt: new Date(),
      }).where(eq(syncRuns.id, syncRun.id));
    });

    return { success: true, projectSlug: "trackr" };
  }
);
