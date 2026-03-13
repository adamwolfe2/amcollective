/**
 * System domain tools — create_alert, resolve_alert, force_sync, dismiss_recommendation
 */

import type Anthropic from "@anthropic-ai/sdk";
import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { eq, desc, and, ilike } from "drizzle-orm";

export const definitions: Anthropic.Tool[] = [
  {
    name: "create_alert",
    description:
      "Create a new alert or flag for the team. Use when Adam says 'flag this', 'add an alert about X', or 'remind me about Y'. Good for surfacing things that need attention without a specific due date.",
    input_schema: {
      type: "object" as const,
      properties: {
        title: { type: "string", description: "Short alert title" },
        message: { type: "string", description: "Detail / context" },
        severity: { type: "string", enum: ["info", "warning", "critical"], description: "Default: info" },
        projectName: { type: "string", description: "Optional: link to a portfolio project" },
      },
      required: ["title"],
    },
  },
  {
    name: "resolve_alert",
    description:
      "Mark an alert as resolved. Use when Adam says 'that's fixed', 'close that alert', or 'mark [issue] resolved'. Searches by partial title. Can also snooze instead of resolving.",
    input_schema: {
      type: "object" as const,
      properties: {
        alertTitle: { type: "string", description: "Partial alert title to search for" },
        alertId: { type: "string", description: "Exact alert UUID (use if you have it)" },
        snoozeHours: { type: "number", description: "If set, snooze the alert for this many hours instead of resolving it" },
        resolvedBy: { type: "string", description: "Who resolved it. Defaults to 'adam'." },
      },
      required: [],
    },
  },
  {
    name: "force_sync",
    description:
      "Force-sync a specific connector or product data right now. Use when data seems stale or when asked to 'refresh [product]', 'sync stripe', 'update vercel data', etc.",
    input_schema: {
      type: "object" as const,
      properties: {
        service: {
          type: "string",
          enum: ["stripe", "vercel", "neon", "mercury", "posthog", "trackr", "taskspace", "wholesail", "cursive", "tbgc", "hook", "emailbison", "all"],
          description: "Which service or product to force-sync",
        },
      },
      required: ["service"],
    },
  },
  {
    name: "dismiss_recommendation",
    description:
      "Dismiss or update the status of an AI strategy recommendation. Use when Adam says 'dismiss that', 'we already handled that recommendation', 'mark that in progress', or 'that one is done'. Searches by partial title.",
    input_schema: {
      type: "object" as const,
      properties: {
        title: { type: "string", description: "Partial recommendation title to search for" },
        recommendationId: { type: "string", description: "Exact recommendation UUID if you have it" },
        status: {
          type: "string",
          enum: ["in_progress", "done", "dismissed"],
          description: "New status. Default: dismissed.",
        },
        note: { type: "string", description: "Optional note explaining the action taken" },
      },
      required: [],
    },
  },
];

export async function handler(
  name: string,
  input: Record<string, unknown>
): Promise<string | undefined> {
  switch (name) {
    case "create_alert": {
      let projectId: string | null = null;
      if (input.projectName) {
        const [proj] = await db
          .select({ id: schema.portfolioProjects.id })
          .from(schema.portfolioProjects)
          .where(ilike(schema.portfolioProjects.name, `%${input.projectName}%`))
          .limit(1);
        projectId = proj?.id ?? null;
      }

      const [alert] = await db.insert(schema.alerts).values({
        title: input.title as string,
        message: (input.message as string) ?? null,
        severity: ((input.severity as string) || "info") as "info" | "warning" | "critical",
        type: "health_drop", // manual flags use this type
        projectId,
        isResolved: false,
      }).returning();

      return JSON.stringify({ created: true, alertId: alert.id, title: alert.title, severity: alert.severity });
    }

    case "resolve_alert": {
      let alert: { id: string; title: string } | undefined;
      if (input.alertId) {
        const [a] = await db.select({ id: schema.alerts.id, title: schema.alerts.title }).from(schema.alerts).where(eq(schema.alerts.id, input.alertId as string)).limit(1);
        alert = a;
      } else if (input.alertTitle) {
        const [a] = await db
          .select({ id: schema.alerts.id, title: schema.alerts.title })
          .from(schema.alerts)
          .where(and(ilike(schema.alerts.title, `%${input.alertTitle}%`), eq(schema.alerts.isResolved, false)))
          .orderBy(desc(schema.alerts.createdAt))
          .limit(1);
        alert = a;
      }
      if (!alert) return JSON.stringify({ error: "Alert not found. Try a different title." });

      if (input.snoozeHours) {
        const snoozeUntil = new Date();
        snoozeUntil.setHours(snoozeUntil.getHours() + (input.snoozeHours as number));
        await db.update(schema.alerts).set({ snoozedUntil: snoozeUntil }).where(eq(schema.alerts.id, alert.id));
        return JSON.stringify({ snoozed: true, alertId: alert.id, title: alert.title, until: snoozeUntil.toISOString() });
      }

      await db.update(schema.alerts).set({
        isResolved: true,
        resolvedAt: new Date(),
        resolvedBy: (input.resolvedBy as string) || "adam",
      }).where(eq(schema.alerts.id, alert.id));

      return JSON.stringify({ resolved: true, alertId: alert.id, title: alert.title });
    }

    case "force_sync": {
      const { inngest } = await import("@/lib/inngest/client");
      const service = input.service as string;

      const serviceToEvent: Record<string, string> = {
        stripe: "stripe/sync-full",
        vercel: "vercel/sync-full",
        trackr: "trackr/sync",
        taskspace: "taskspace/sync",
        wholesail: "wholesail/sync",
        cursive: "cursive/sync",
        tbgc: "tbgc/sync",
        hook: "hook/sync",
        emailbison: "emailbison/sync-inbox",
      };

      if (service === "all") {
        const events = Object.entries(serviceToEvent).map(([, eventName]) => ({
          name: eventName,
          data: { manual: true },
        }));
        await inngest.send(events);
        return JSON.stringify({
          triggered: true,
          service: "all",
          eventNames: Object.values(serviceToEvent),
          count: events.length,
        });
      }

      const eventName = serviceToEvent[service];
      if (!eventName) {
        return JSON.stringify({ error: `No sync event mapped for service: ${service}` });
      }

      await inngest.send({ name: eventName, data: { manual: true } });
      return JSON.stringify({ triggered: true, service, eventName });
    }

    case "dismiss_recommendation": {
      let rec: { id: string; title: string } | undefined;

      if (input.recommendationId) {
        const [r] = await db
          .select({ id: schema.strategyRecommendations.id, title: schema.strategyRecommendations.title })
          .from(schema.strategyRecommendations)
          .where(eq(schema.strategyRecommendations.id, input.recommendationId as string))
          .limit(1);
        rec = r ?? undefined;
      } else if (input.title) {
        const [r] = await db
          .select({ id: schema.strategyRecommendations.id, title: schema.strategyRecommendations.title })
          .from(schema.strategyRecommendations)
          .where(and(ilike(schema.strategyRecommendations.title, `%${input.title}%`), eq(schema.strategyRecommendations.status, "active")))
          .orderBy(desc(schema.strategyRecommendations.createdAt))
          .limit(1);
        rec = r ?? undefined;
      }
      if (!rec) return JSON.stringify({ error: "Recommendation not found. Try a partial title match." });

      const newStatus = (input.status as string) || "dismissed";
      await db.update(schema.strategyRecommendations).set({
        status: newStatus as "in_progress" | "done" | "dismissed",
        actedOnAt: new Date(),
        actedOnNote: (input.note as string) ?? null,
      }).where(eq(schema.strategyRecommendations.id, rec.id));

      return JSON.stringify({ updated: true, recommendationId: rec.id, title: rec.title, newStatus });
    }

    default:
      return undefined;
  }
}
