/**
 * Inngest Job — Sync TaskSpace Metrics
 *
 * Runs every 30 minutes. Queries TaskSpace's Neon DB and upserts a snapshot
 * into project_metric_snapshots for the AM Collective master dashboard.
 *
 * Uses TASKSPACE_DATABASE_URL env var — read-only SELECT queries only.
 *
 * Optimized: 2 steps (fetch + upsert) to minimize Inngest execution costs.
 */

import { inngest } from "../client";
import { captureError } from "@/lib/errors";
import { getSnapshot, isConfigured } from "@/lib/connectors/taskspace";
import { db } from "@/lib/db";
import { projectMetricSnapshots, syncRuns } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

export const syncTaskspace = inngest.createFunction(
  {
    id: "sync-taskspace",
    name: "Sync TaskSpace Metrics",
    retries: 2,
    onFailure: async ({ error }) => {
      captureError(error, {
        tags: { source: "inngest", job: "sync-taskspace" },
        level: "warning",
      });
    },
  },
  { cron: "*/30 * * * *" },
  async ({ step }) => {
    if (!isConfigured()) {
      return { skipped: true, reason: "TASKSPACE_DATABASE_URL not set" };
    }

    // Step 1: Fetch snapshot from TaskSpace DB
    const result = await step.run("fetch-taskspace-snapshot", async () => {
      return getSnapshot();
    });

    // Step 2: Record sync run + upsert snapshot (combined to save executions)
    await step.run("upsert-and-record", async () => {
      const [syncRun] = await db.insert(syncRuns).values({
        service: "taskspace",
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
          projectSlug: "taskspace",
          mrrCents: 0,
          activeUsers: 0,
          newUsersWeek: 0,
          activeSubscriptions: 0,
          primaryMetricLabel: "EOD Rate (7d)",
          primaryMetricValue: 0,
          secondaryMetricLabel: "Open Escalations",
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
      if (snap.eodRate7Day < 50) healthScore -= 25;
      if (snap.openEscalations > 5) healthScore -= 15;
      if (snap.rocksBlocked > 2) healthScore -= 10;
      healthScore = Math.max(0, healthScore);

      await db.insert(projectMetricSnapshots).values({
        projectSlug: "taskspace",
        mrrCents: 0,
        activeUsers: snap.totalMembers,
        newUsersWeek: 0,
        activeSubscriptions: snap.totalOrgs,
        primaryMetricLabel: "EOD Rate (7d)",
        primaryMetricValue: Math.round(snap.eodRate7Day),
        secondaryMetricLabel: "Open Escalations",
        secondaryMetricValue: snap.openEscalations,
        healthScore,
        syncStatus: "ok",
        errorMessage: null,
        rawMetrics: snap as unknown as Record<string, unknown>,
        syncedAt: new Date(),
      }).onConflictDoUpdate({
        target: projectMetricSnapshots.projectSlug,
        set: {
          mrrCents: 0,
          activeUsers: snap.totalMembers,
          newUsersWeek: 0,
          activeSubscriptions: snap.totalOrgs,
          primaryMetricLabel: "EOD Rate (7d)",
          primaryMetricValue: Math.round(snap.eodRate7Day),
          secondaryMetricLabel: "Open Escalations",
          secondaryMetricValue: snap.openEscalations,
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

    return { success: true, projectSlug: "taskspace" };
  }
);
