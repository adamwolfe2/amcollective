/**
 * Inngest Job — Sync Hook Metrics
 *
 * Runs every 30 minutes. Queries Hook's Stripe account and upserts a snapshot
 * into project_metric_snapshots for the AM Collective master dashboard.
 *
 * Uses shared STRIPE_SECRET_KEY with Hook connected account ID.
 *
 * Optimized: 2 steps (fetch + upsert) to minimize Inngest execution costs.
 */

import { inngest } from "../client";
import { captureError } from "@/lib/errors";
import { getSnapshot, isConfigured } from "@/lib/connectors/hook";
import { db } from "@/lib/db";
import { projectMetricSnapshots, syncRuns } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

export const syncHook = inngest.createFunction(
  {
    id: "sync-hook",
    name: "Sync Hook Metrics",
    retries: 2,
    onFailure: async ({ error }) => {
      captureError(error, {
        tags: { source: "inngest", job: "sync-hook" },
        level: "warning",
      });
    },
  },
  { cron: "*/30 * * * *" },
  async ({ step }) => {
    if (!isConfigured()) {
      return { skipped: true, reason: "Hook Stripe account not configured" };
    }

    // Step 1: Fetch snapshot from Hook Stripe account
    const result = await step.run("fetch-hook-snapshot", async () => {
      return getSnapshot();
    });

    // Step 2: Record sync run + upsert snapshot (combined to save executions)
    await step.run("upsert-and-record", async () => {
      const [syncRun] = await db.insert(syncRuns).values({
        service: "hook",
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
          projectSlug: "hook",
          mrrCents: 0,
          activeUsers: 0,
          newUsersWeek: 0,
          activeSubscriptions: 0,
          primaryMetricLabel: "Active subscriptions",
          primaryMetricValue: 0,
          secondaryMetricLabel: "Trialing users",
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
      // Hook is in beta — health based on trial/subscription activity
      if (snap.activeSubscriptions === 0 && snap.trialingSubscriptions === 0) healthScore = 60;
      else if (snap.activeSubscriptions === 0) healthScore = 75; // trials but no paying
      if (snap.mrrCents === 0) healthScore -= 10;
      healthScore = Math.max(0, healthScore);

      await db.insert(projectMetricSnapshots).values({
        projectSlug: "hook",
        mrrCents: snap.mrrCents,
        activeUsers: 0,
        newUsersWeek: 0,
        activeSubscriptions: snap.activeSubscriptions,
        primaryMetricLabel: "Active subscriptions",
        primaryMetricValue: snap.activeSubscriptions,
        secondaryMetricLabel: "Trialing users",
        secondaryMetricValue: snap.trialingSubscriptions,
        healthScore,
        syncStatus: "ok",
        errorMessage: null,
        rawMetrics: snap as unknown as Record<string, unknown>,
        syncedAt: new Date(),
      }).onConflictDoUpdate({
        target: projectMetricSnapshots.projectSlug,
        set: {
          mrrCents: snap.mrrCents,
          activeUsers: 0,
          newUsersWeek: 0,
          activeSubscriptions: snap.activeSubscriptions,
          primaryMetricLabel: "Active subscriptions",
          primaryMetricValue: snap.activeSubscriptions,
          secondaryMetricLabel: "Trialing users",
          secondaryMetricValue: snap.trialingSubscriptions,
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

    return { success: true, projectSlug: "hook" };
  }
);
