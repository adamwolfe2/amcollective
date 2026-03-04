/**
 * Alerts Repository
 *
 * Uses existing alerts table from operations.ts schema.
 */

import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { eq, desc, and, count } from "drizzle-orm";
import { createAuditLog } from "./audit";
import { inngest } from "@/lib/inngest/client";

export async function getAlerts(filters?: {
  severity?: string;
  type?: string;
  isResolved?: boolean;
  limit?: number;
}) {
  const conditions = [];
  if (filters?.severity) {
    conditions.push(
      eq(schema.alerts.severity, filters.severity as "info" | "warning" | "critical")
    );
  }
  if (filters?.type) {
    conditions.push(
      eq(schema.alerts.type, filters.type as "error_spike" | "cost_anomaly" | "build_fail" | "health_drop")
    );
  }
  if (filters?.isResolved !== undefined) {
    conditions.push(eq(schema.alerts.isResolved, filters.isResolved));
  }

  return db
    .select({
      alert: schema.alerts,
      project: {
        id: schema.portfolioProjects.id,
        name: schema.portfolioProjects.name,
      },
    })
    .from(schema.alerts)
    .leftJoin(
      schema.portfolioProjects,
      eq(schema.alerts.projectId, schema.portfolioProjects.id)
    )
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(schema.alerts.createdAt))
    .limit(filters?.limit ?? 50);
}

export async function createAlert(data: {
  type: "error_spike" | "cost_anomaly" | "build_fail" | "health_drop";
  severity: "info" | "warning" | "critical";
  title: string;
  message?: string;
  projectId?: string;
  metadata?: Record<string, unknown>;
}) {
  const [alert] = await db
    .insert(schema.alerts)
    .values({
      type: data.type,
      severity: data.severity,
      title: data.title,
      message: data.message ?? null,
      projectId: data.projectId ?? null,
      metadata: data.metadata ?? null,
    })
    .returning();

  // Fire event for warning/critical so alert-triage job can DM Adam immediately
  if (data.severity === "warning" || data.severity === "critical") {
    inngest
      .send({
        name: "alert/created",
        data: {
          alertId: alert.id,
          type: data.type,
          severity: data.severity,
          title: data.title,
          message: data.message ?? null,
          projectId: data.projectId ?? null,
        },
      })
      .catch(() => {});

    // Also fire directly to OpenClaw Mac mini for instant notification.
    // Bypasses Inngest's queue delay — OpenClaw gets it in under 1 second.
    // OPENCLAW_WEBHOOK_URL = http://mac-mini:18789/hooks/agent (or Tailscale URL)
    const clawWebhookUrl = process.env.OPENCLAW_WEBHOOK_URL;
    if (clawWebhookUrl) {
      fetch(clawWebhookUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-OpenClaw-Source": "am-collective-alerts",
        },
        body: JSON.stringify({
          event: "am_collective_alert",
          severity: data.severity,
          title: data.title,
          message: data.message ?? null,
          type: data.type,
          alertId: alert.id,
          timestamp: new Date().toISOString(),
          // Instruction tells OpenClaw what to do with this webhook
          instruction:
            data.severity === "critical"
              ? "Alert Adam immediately via Slack DM. This is urgent."
              : "Note this alert. Include in the next update to Adam unless it resolves.",
        }),
        signal: AbortSignal.timeout(3000),
      }).catch(() => {});
    }
  }

  return alert;
}

export async function resolveAlert(id: string, actorId: string) {
  const [alert] = await db
    .update(schema.alerts)
    .set({
      isResolved: true,
      resolvedAt: new Date(),
      resolvedBy: actorId,
    })
    .where(eq(schema.alerts.id, id))
    .returning();

  if (alert) {
    await createAuditLog({
      actorId,
      actorType: "user",
      action: "resolve",
      entityType: "alert",
      entityId: id,
    });
  }

  return alert ?? null;
}

/**
 * Snooze an alert — suppresses re-DM until the given time.
 * Prevents alert fatigue when an issue is acknowledged but not yet resolved.
 */
export async function snoozeAlert(id: string, until: Date) {
  await db
    .update(schema.alerts)
    .set({ snoozedUntil: until })
    .where(eq(schema.alerts.id, id));
}

export async function getUnresolvedCount() {
  const [result] = await db
    .select({ count: count() })
    .from(schema.alerts)
    .where(eq(schema.alerts.isResolved, false));
  return result?.count ?? 0;
}
