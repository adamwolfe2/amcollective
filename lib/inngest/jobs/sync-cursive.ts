/**
 * Inngest Job — Sync Cursive Metrics
 *
 * Runs every 30 minutes. Queries Cursive's Supabase DB via REST API and upserts
 * a snapshot into project_metric_snapshots for the AM Collective master dashboard.
 *
 * Uses CURSIVE_ANON_KEY (Supabase anon key) or CURSIVE_DATABASE_URL.
 *
 * Optimized: 2 steps (fetch + upsert) to minimize Inngest execution costs.
 */

import { inngest } from "../client";
import { captureError } from "@/lib/errors";
import { getSnapshot, isConfigured } from "@/lib/connectors/cursive";
import { db } from "@/lib/db";
import { projectMetricSnapshots, syncRuns } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

export const syncCursive = inngest.createFunction(
  {
    id: "sync-cursive",
    name: "Sync Cursive Metrics",
    retries: 2,
    onFailure: async ({ error }) => {
      captureError(error, {
        tags: { source: "inngest", job: "sync-cursive" },
        level: "warning",
      });
    },
  },
  { cron: "*/30 * * * *" },
  async ({ step }) => {
    if (!isConfigured()) {
      return { skipped: true, reason: "CURSIVE_ANON_KEY / CURSIVE_DATABASE_URL not set" };
    }

    // Step 1: Fetch snapshot from Cursive DB
    const result = await step.run("fetch-cursive-snapshot", async () => {
      return getSnapshot();
    });

    // Step 2: Record sync run + upsert snapshot (combined to save executions)
    await step.run("upsert-and-record", async () => {
      const [syncRun] = await db.insert(syncRuns).values({
        service: "cursive",
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
          projectSlug: "cursive",
          mrrCents: 0,
          activeUsers: 0,
          newUsersWeek: 0,
          activeSubscriptions: 0,
          primaryMetricLabel: "Managed workspaces",
          primaryMetricValue: 0,
          secondaryMetricLabel: "Active pixel installs",
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
      if (snap.totalWorkspaces === 0) healthScore -= 30;
      if (snap.pixels.activeTrials === 0 && snap.pixels.totalInstalls === 0) healthScore -= 20;
      if (snap.bookings.noShowThisMonth > 3) healthScore -= 15;
      if (snap.pipeline.at_risk > 2) healthScore -= 10;
      healthScore = Math.max(0, healthScore);

      await db.insert(projectMetricSnapshots).values({
        projectSlug: "cursive",
        mrrCents: 0, // Cursive revenue tracked separately via ops pipeline
        activeUsers: snap.totalWorkspaces,
        newUsersWeek: snap.leads.createdThisWeek,
        activeSubscriptions: snap.pipeline.active,
        primaryMetricLabel: "Managed workspaces",
        primaryMetricValue: snap.managedByOps,
        secondaryMetricLabel: "Active pixel installs",
        secondaryMetricValue: snap.pixels.totalInstalls,
        healthScore,
        syncStatus: "ok",
        errorMessage: null,
        rawMetrics: snap as unknown as Record<string, unknown>,
        syncedAt: new Date(),
      }).onConflictDoUpdate({
        target: projectMetricSnapshots.projectSlug,
        set: {
          mrrCents: 0,
          activeUsers: snap.totalWorkspaces,
          newUsersWeek: snap.leads.createdThisWeek,
          activeSubscriptions: snap.pipeline.active,
          primaryMetricLabel: "Managed workspaces",
          primaryMetricValue: snap.managedByOps,
          secondaryMetricLabel: "Active pixel installs",
          secondaryMetricValue: snap.pixels.totalInstalls,
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

    return { success: true, projectSlug: "cursive" };
  }
);
