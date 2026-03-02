/**
 * Inngest Job — Handle Composio Trigger
 *
 * Fires on every composio/trigger.received event from the webhook at
 * /api/webhooks/composio.
 *
 * Routes by appName:
 *   github          → log commit / PR / issue activity to audit_logs
 *   linearapp       → fire linear/issue.triage for new issues
 *   googlecalendar  → log today's events to audit_logs for morning briefing
 *   slack           → log mentions / DMs as alerts
 */

import { inngest } from "../client";
import { captureError } from "@/lib/errors";
import { createAuditLog } from "@/lib/db/repositories/audit";

interface ComposioTriggerData {
  appName: string;
  triggerName: string;
  connectionId?: string;
  payload: Record<string, unknown>;
}

// Normalise app name — Composio sends varying casings
function normaliseApp(raw: string): string {
  return raw?.toLowerCase().replace(/[-_ ]/g, "") ?? "unknown";
}

export const handleComposioTrigger = inngest.createFunction(
  {
    id: "handle-composio-trigger",
    name: "Handle Composio Trigger",
    retries: 2,
    concurrency: { limit: 10 },
    onFailure: async ({ error }) => {
      captureError(error, {
        tags: { source: "inngest", job: "handle-composio-trigger" },
        level: "warning",
      });
    },
  },
  { event: "composio/trigger.received" },
  async ({ event, step }) => {
    const data = event.data as ComposioTriggerData;
    const app = normaliseApp(data.appName);
    const trigger = data.triggerName ?? "unknown";
    const payload = data.payload ?? {};

    // ── GitHub ─────────────────────────────────────────────────────────────
    if (app === "github") {
      await step.run("log-github-activity", async () => {
        // Commits
        if (trigger.includes("COMMIT") || trigger.includes("PUSH")) {
          const commits = (payload.commits as Array<{ message: string; id: string }> | undefined) ?? [];
          const repo = (payload.repository as Record<string, unknown>)?.name ?? "unknown";
          const pusher = (payload.pusher as Record<string, unknown>)?.name ?? "unknown";

          await createAuditLog({
            actorId: `composio:github:${pusher}`,
            actorType: "system",
            action: "composio.github.push",
            entityType: "github_repo",
            entityId: String(repo),
            metadata: {
              repo,
              pusher,
              commitCount: commits.length,
              messages: commits.slice(0, 5).map((c) => c.message),
              triggerName: trigger,
            },
          });
        }

        // Pull Requests
        if (trigger.includes("PULL_REQUEST") || trigger.includes("PR")) {
          const pr = (payload.pull_request ?? payload.pullRequest) as Record<string, unknown> | undefined;
          const repo = (payload.repository as Record<string, unknown>)?.name ?? "unknown";

          await createAuditLog({
            actorId: `composio:github:pr`,
            actorType: "system",
            action: "composio.github.pull_request",
            entityType: "github_pr",
            entityId: String(pr?.number ?? pr?.id ?? "unknown"),
            metadata: {
              repo,
              title: pr?.title,
              state: pr?.state,
              url: pr?.html_url ?? pr?.url,
              triggerName: trigger,
            },
          });
        }

        // Issues
        if (trigger.includes("ISSUE")) {
          const issue = payload.issue as Record<string, unknown> | undefined;
          const repo = (payload.repository as Record<string, unknown>)?.name ?? "unknown";

          await createAuditLog({
            actorId: "composio:github:issue",
            actorType: "system",
            action: "composio.github.issue",
            entityType: "github_issue",
            entityId: String(issue?.number ?? issue?.id ?? "unknown"),
            metadata: {
              repo,
              title: issue?.title,
              state: issue?.state,
              url: issue?.html_url ?? issue?.url,
              triggerName: trigger,
            },
          });
        }
      });
    }

    // ── Linear ─────────────────────────────────────────────────────────────
    if (app === "linearapp" || app === "linear") {
      await step.run("route-linear-issue", async () => {
        const isNew =
          trigger.includes("CREATED") ||
          trigger.includes("NEW") ||
          trigger.includes("CREATE");

        const issue = (payload.issue ?? payload.data ?? payload) as Record<string, unknown>;

        // Log to audit trail regardless
        await createAuditLog({
          actorId: "composio:linear",
          actorType: "system",
          action: isNew ? "composio.linear.issue.created" : "composio.linear.issue.updated",
          entityType: "linear_issue",
          entityId: String(issue?.id ?? "unknown"),
          metadata: {
            title: issue?.title,
            state: (issue?.state as Record<string, unknown>)?.name ?? issue?.stateType,
            priority: issue?.priority,
            triggerName: trigger,
          },
        });

        // Fire AI triage for brand-new issues
        if (isNew && issue?.id) {
          const state = issue.state as Record<string, unknown> | undefined;
          const team = issue.team as Record<string, unknown> | undefined;
          const labels = issue.labels as Array<{ id: string; name: string }> | undefined;

          await inngest.send({
            name: "linear/issue.triage",
            data: {
              issueId: String(issue.id),
              identifier: String(issue.identifier ?? ""),
              title: String(issue.title ?? ""),
              description: String(issue.description ?? ""),
              teamId: String(team?.id ?? ""),
              teamKey: String(team?.key ?? ""),
              stateType: String(state?.type ?? state?.name ?? ""),
              url: String(issue.url ?? ""),
              labels: labels ?? [],
            },
          });
        }
      });
    }

    // ── Google Calendar ────────────────────────────────────────────────────
    if (app === "googlecalendar" || app === "google_calendar" || app === "gcal") {
      await step.run("log-calendar-event", async () => {
        const calEvent = (payload.event ?? payload) as Record<string, unknown>;
        const start = calEvent?.start as Record<string, unknown> | undefined;
        const end = calEvent?.end as Record<string, unknown> | undefined;

        await createAuditLog({
          actorId: "composio:googlecalendar",
          actorType: "system",
          action: "composio.calendar.event",
          entityType: "calendar_event",
          entityId: String(calEvent?.id ?? calEvent?.iCalUID ?? "unknown"),
          metadata: {
            summary: calEvent?.summary,
            startTime: start?.dateTime ?? start?.date,
            endTime: end?.dateTime ?? end?.date,
            attendees: (calEvent?.attendees as Array<{ email: string }> | undefined)
              ?.map((a) => a.email)
              ?.slice(0, 10),
            triggerName: trigger,
          },
        });
      });
    }

    // ── Slack ──────────────────────────────────────────────────────────────
    if (app === "slack") {
      await step.run("log-slack-activity", async () => {
        const isDM = trigger.includes("DM") || trigger.includes("DIRECT");
        const isMention = trigger.includes("MENTION") || trigger.includes("APP_MENTION");

        if (isDM || isMention) {
          await createAuditLog({
            actorId: "composio:slack",
            actorType: "system",
            action: isDM ? "composio.slack.dm" : "composio.slack.mention",
            entityType: "slack_message",
            entityId: String(payload?.ts ?? payload?.message_ts ?? "unknown"),
            metadata: {
              channel: payload?.channel,
              user: payload?.user,
              text: String(payload?.text ?? "").slice(0, 500),
              triggerName: trigger,
            },
          });
        }
      });
    }

    return { handled: true, app, trigger };
  }
);

export const handleComposioExpired = inngest.createFunction(
  {
    id: "handle-composio-expired",
    name: "Handle Composio Account Expired",
    retries: 1,
  },
  { event: "composio/account.expired" },
  async ({ event, step }) => {
    const { appName, connectionId } = event.data as {
      appName?: string;
      connectionId?: string;
      payload?: Record<string, unknown>;
    };

    await step.run("notify-admin", async () => {
      const { notifyAdmins } = await import("@/lib/db/repositories/notifications");
      await notifyAdmins({
        type: "system_alert",
        title: `Composio: ${appName ?? "unknown"} connection expired`,
        message: `The ${appName} OAuth token (connection ${connectionId ?? "?"}) needs re-authentication in Composio.`,
        link: "/settings/integrations",
      });

      await createAuditLog({
        actorId: "composio",
        actorType: "system",
        action: "composio.account.expired",
        entityType: "composio_connection",
        entityId: connectionId ?? "unknown",
        metadata: { appName },
      });
    });

    return { notified: true, appName };
  }
);
