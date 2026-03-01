/**
 * Inngest Job — Sync Wholesail Metrics
 *
 * Runs every 30 minutes. Queries Wholesail's Neon DB and upserts a snapshot
 * into project_metric_snapshots for the AM Collective master dashboard.
 *
 * Uses WHOLESAIL_DATABASE_URL env var — read-only SELECT queries only.
 *
 * Optimized: 2 steps (fetch + upsert) to minimize Inngest execution costs.
 */

import { inngest } from "../client";
import { captureError } from "@/lib/errors";
import { getSnapshot, isConfigured } from "@/lib/connectors/wholesail";
import { db } from "@/lib/db";
import { projectMetricSnapshots, syncRuns } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

export const syncWholesail = inngest.createFunction(
  {
    id: "sync-wholesail",
    name: "Sync Wholesail Metrics",
    retries: 2,
    onFailure: async ({ error }) => {
      captureError(error, {
        tags: { source: "inngest", job: "sync-wholesail" },
        level: "warning",
      });
    },
  },
  { cron: "*/30 * * * *" },
  async ({ step }) => {
    if (!isConfigured()) {
      return { skipped: true, reason: "WHOLESAIL_DATABASE_URL not set" };
    }

    // Step 1: Fetch snapshot from Wholesail DB
    const result = await step.run("fetch-wholesail-snapshot", async () => {
      return getSnapshot();
    });

    // Step 2: Record sync run + upsert snapshot (combined to save executions)
    await step.run("upsert-and-record", async () => {
      const [syncRun] = await db.insert(syncRuns).values({
        service: "wholesail",
        status: "running",
        triggeredBy: "system",
      }).returning();

      if (!result.success || !result.data) {
        await db.update(syncRuns).set({
          status: "error",
          errorMessage: result.error ?? "Unknown error",
          completedAt: new Date(),
        }).where(eq(syncRuns.id, syncRun.id));

        await db.insert(projectMetricSnapshots).values({
          projectSlug: "wholesail",
          mrrCents: 0,
          activeUsers: 0,
          newUsersWeek: 0,
          activeSubscriptions: 0,
          primaryMetricLabel: "Pipeline Value",
          primaryMetricValue: 0,
          secondaryMetricLabel: "Active Builds",
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

      let healthScore = 100;
      if (snap.stuckProjects > 0) healthScore -= 20;
      if (snap.overdueProjects > 0) healthScore -= 15;
      healthScore = Math.max(0, healthScore);

      await db.insert(projectMetricSnapshots).values({
        projectSlug: "wholesail",
        mrrCents: snap.mrrFromRetainers * 100,
        activeUsers: snap.liveClients,
        newUsersWeek: snap.newIntakesMonth,
        activeSubscriptions: snap.liveClients,
        primaryMetricLabel: "Pipeline Value",
        primaryMetricValue: snap.pipelineValue * 100,
        secondaryMetricLabel: "Active Builds",
        secondaryMetricValue: snap.activeBuilds,
        healthScore,
        syncStatus: "ok",
        errorMessage: null,
        rawMetrics: snap as unknown as Record<string, unknown>,
        syncedAt: new Date(),
      }).onConflictDoUpdate({
        target: projectMetricSnapshots.projectSlug,
        set: {
          mrrCents: snap.mrrFromRetainers * 100,
          activeUsers: snap.liveClients,
          newUsersWeek: snap.newIntakesMonth,
          activeSubscriptions: snap.liveClients,
          primaryMetricLabel: "Pipeline Value",
          primaryMetricValue: snap.pipelineValue * 100,
          secondaryMetricLabel: "Active Builds",
          secondaryMetricValue: snap.activeBuilds,
          healthScore,
          syncStatus: "ok",
          errorMessage: null,
          rawMetrics: snap as unknown as Record<string, unknown>,
          syncedAt: new Date(),
        },
      });

      await db.update(syncRuns).set({
        status: "success",
        recordsProcessed: 1,
        completedAt: new Date(),
      }).where(eq(syncRuns.id, syncRun.id));
    });

    return { success: true, projectSlug: "wholesail" };
  }
);
