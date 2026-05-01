/**
 * Inngest Job — Alert Triage
 *
 * Event-driven: fires immediately on "alert/created" events.
 * Skips info severity. Sends DM for warnings, DM + SMS for critical.
 */

import { inngest } from "../client";
import { captureError } from "@/lib/errors";
import { sendProactiveMessage } from "@/lib/ai/agents/proactive";
import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { and, count, eq, gte } from "drizzle-orm";

/** Hourly cap on how many alerts of the same (type, projectId) trigger a DM.
 *  Storms (e.g. Vercel-wide outage triggering hundreds of build_fail alerts
 *  in 60s) used to fan out to hundreds of Haiku calls + Slack pings. Now,
 *  after this many similar alerts in an hour, further duplicates skip the
 *  DM but still update the alert state. Override via env. */
const ALERT_HOURLY_DEDUPE_LIMIT = Number(
  process.env.ALERT_HOURLY_DEDUPE_LIMIT ?? "5"
);

export const alertTriage = inngest.createFunction(
  {
    id: "alert-triage",
    name: "Alert Triage",
    retries: 2,
    onFailure: async ({ error }) => {
      captureError(error, {
        tags: { source: "inngest", job: "alert-triage" },
        level: "error",
      });
    },
  },
  { event: "alert/created" },
  async ({ event, step }) => {
    const { severity, type, title, message, projectId } = event.data as {
      alertId: string;
      type: string;
      severity: "info" | "warning" | "critical";
      title: string;
      message: string | null;
      projectId: string | null;
    };

    // Skip info-level alerts — not worth a DM
    if (severity === "info") return { skipped: true, reason: "info" };

    // Skip if the alert is currently snoozed (look up fresh from DB)
    const now = new Date();
    const [freshAlert] = await db
      .select({ snoozedUntil: schema.alerts.snoozedUntil, isResolved: schema.alerts.isResolved })
      .from(schema.alerts)
      .where(eq(schema.alerts.id, event.data.alertId as string))
      .limit(1);

    if (freshAlert?.isResolved) return { skipped: true, reason: "already_resolved" };
    if (freshAlert?.snoozedUntil && freshAlert.snoozedUntil > now) {
      return { skipped: true, reason: "snoozed", until: freshAlert.snoozedUntil };
    }

    // Hourly dedupe — count alerts of the same (type, projectId) created in
    // the last hour. If we're over the limit, skip the DM. Critical alerts
    // get a 2x multiplier so true emergencies always page through.
    const limit =
      severity === "critical"
        ? ALERT_HOURLY_DEDUPE_LIMIT * 2
        : ALERT_HOURLY_DEDUPE_LIMIT;
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
    const dedupeConditions = [
      eq(schema.alerts.type, type as never),
      gte(schema.alerts.createdAt, oneHourAgo),
    ];
    if (projectId) {
      dedupeConditions.push(eq(schema.alerts.projectId, projectId));
    }
    const recentCountRows = await db
      .select({ value: count() })
      .from(schema.alerts)
      .where(and(...dedupeConditions));
    const recentCount = recentCountRows[0]?.value ?? 0;
    if (recentCount > limit) {
      return {
        skipped: true,
        reason: "hourly-dedupe",
        recentCount,
        limit,
      };
    }

    const context = await step.run("build-context", async () => {
      let projectName: string | null = null;

      if (projectId) {
        const [project] = await db
          .select({ name: schema.portfolioProjects.name })
          .from(schema.portfolioProjects)
          .where(eq(schema.portfolioProjects.id, projectId))
          .limit(1);
        projectName = project?.name ?? null;
      }

      const parts = [`[${type}] [${severity}]: ${title}`];
      if (message) parts.push(message);
      if (projectName) parts.push(`project: ${projectName}`);

      return parts.join(" — ");
    });

    await step.run("send-dm", async () => {
      await sendProactiveMessage({
        trigger: "alert",
        context,
        urgency: severity === "critical" ? "urgent" : "normal",
      });
    });

    return { success: true, severity };
  }
);
