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
import { eq } from "drizzle-orm";

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
