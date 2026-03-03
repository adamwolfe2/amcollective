/**
 * CEO Agent Tools — ClaudeBot-specific extensions
 *
 * Extends the base TOOL_DEFINITIONS with CEO-only capabilities:
 * memory management, proactive messaging, delegation, and company snapshots.
 *
 * Uses the Anthropic SDK tool format (not Vercel AI SDK).
 */

import type Anthropic from "@anthropic-ai/sdk";
import { readMemory, writeMemory, listMemory, searchMemory } from "./memory";
import { sendMessage as blooSendMessage } from "@/lib/integrations/blooio";
import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { eq, desc, and } from "drizzle-orm";
import { sql, count } from "drizzle-orm";

// ─── Tool Definitions ────────────────────────────────────────────────────────

export const CEO_TOOL_DEFINITIONS: Anthropic.Tool[] = [
  {
    name: "write_memory",
    description:
      "Write or update a file in the persistent knowledge base. Use this to remember important decisions, preferences, context, or facts from conversations. Good candidates: architectural decisions, user preferences, company priorities, client context, recurring patterns.",
    input_schema: {
      type: "object" as const,
      properties: {
        path: {
          type: "string",
          description:
            "File path in the knowledge repo. Use descriptive paths like 'decisions/2026-03-async-preference.md', 'notes/tbgc-renewal-context.md', 'people/adam.md'",
        },
        content: {
          type: "string",
          description: "Full markdown content to write to the file",
        },
        summary: {
          type: "string",
          description: "One-line commit message summarizing what was remembered",
        },
      },
      required: ["path", "content", "summary"],
    },
  },
  {
    name: "read_memory",
    description:
      "Read a specific file from the persistent knowledge base. Use this to recall previously stored context, decisions, or notes.",
    input_schema: {
      type: "object" as const,
      properties: {
        path: {
          type: "string",
          description: "File path to read, e.g. 'people/adam.md' or 'company/strategy.md'",
        },
      },
      required: ["path"],
    },
  },
  {
    name: "list_memories",
    description:
      "List files in the knowledge base. Use to discover what has been remembered previously.",
    input_schema: {
      type: "object" as const,
      properties: {
        prefix: {
          type: "string",
          description:
            "Optional directory prefix to list, e.g. 'decisions/', 'notes/', 'people/'",
        },
      },
      required: [],
    },
  },
  {
    name: "search_memory",
    description:
      "Semantically search the knowledge base for relevant memories. Use this at the start of complex conversations to recall relevant context.",
    input_schema: {
      type: "object" as const,
      properties: {
        query: { type: "string", description: "Search query" },
        limit: { type: "number", description: "Max results (default 5)" },
      },
      required: ["query"],
    },
  },
  {
    name: "send_to_slack",
    description:
      "Send a proactive Slack message to a channel or user. Use for notifications, alerts, or updates that should be shared in Slack.",
    input_schema: {
      type: "object" as const,
      properties: {
        channel: {
          type: "string",
          description: "Slack channel ID (C...) or user ID (U...) for DM",
        },
        message: { type: "string", description: "Message text (markdown supported)" },
        thread_ts: {
          type: "string",
          description: "Optional thread timestamp to reply in a thread",
        },
      },
      required: ["channel", "message"],
    },
  },
  {
    name: "send_sms",
    description:
      "Send an SMS/iMessage to Adam or Maggie via Bloo.io. Use for urgent notifications or when explicitly asked to send a text message.",
    input_schema: {
      type: "object" as const,
      properties: {
        to: {
          type: "string",
          enum: ["adam", "maggie"],
          description: "Recipient: 'adam' or 'maggie'",
        },
        message: { type: "string", description: "Message text to send" },
      },
      required: ["to", "message"],
    },
  },
  {
    name: "create_delegation",
    description:
      "Create a task and assign it to a team member, with optional Slack notification. Use when asked to delegate work to someone.",
    input_schema: {
      type: "object" as const,
      properties: {
        assignee: {
          type: "string",
          description: "Name of the person to assign to (e.g. 'Maggie', 'Adam')",
        },
        title: { type: "string", description: "Task title" },
        description: { type: "string", description: "Detailed task description" },
        priority: {
          type: "string",
          enum: ["low", "medium", "high", "urgent"],
          description: "Task priority (default: medium)",
        },
        dueDate: {
          type: "string",
          description: "Due date in YYYY-MM-DD format (optional)",
        },
        notifySlack: {
          type: "boolean",
          description: "Whether to send a Slack notification (default: true)",
        },
      },
      required: ["assignee", "title"],
    },
  },
  {
    name: "get_company_snapshot",
    description:
      "Get a comprehensive real-time snapshot of the company: MRR, cash, sprint status, active leads, overdue items, alerts. Call this first when answering broad company status questions.",
    input_schema: {
      type: "object" as const,
      properties: {},
      required: [],
    },
  },
  {
    name: "get_current_sprint",
    description:
      "Get the current week's sprint in full detail — title, focus, sections, and all tasks with completion status.",
    input_schema: {
      type: "object" as const,
      properties: {},
      required: [],
    },
  },
  {
    name: "update_sprint_note",
    description:
      "Update the top-of-mind note on the current sprint. Use when asked to jot something down or update the sprint focus.",
    input_schema: {
      type: "object" as const,
      properties: {
        sprintId: { type: "string", description: "Sprint ID to update" },
        note: {
          type: "string",
          description: "New top-of-mind content (appends, does not replace)",
        },
      },
      required: ["sprintId", "note"],
    },
  },
];

// ─── Tool Executor ────────────────────────────────────────────────────────────

export async function executeCeoTool(
  name: string,
  input: Record<string, unknown>
): Promise<string> {
  try {
    switch (name) {
      case "write_memory": {
        const success = await writeMemory(
          input.path as string,
          input.content as string,
          (input.summary as string) || "ClaudeBot memory update"
        );
        return JSON.stringify({ success, path: input.path });
      }

      case "read_memory": {
        const content = await readMemory(input.path as string);
        if (!content) return JSON.stringify({ error: "File not found", path: input.path });
        return JSON.stringify({ path: input.path, content });
      }

      case "list_memories": {
        const files = await listMemory((input.prefix as string) || "");
        return JSON.stringify({ files });
      }

      case "search_memory": {
        const results = await searchMemory(
          input.query as string,
          (input.limit as number) || 5
        );
        return JSON.stringify({ results });
      }

      case "send_to_slack": {
        const token = process.env.SLACK_BOT_TOKEN;
        if (!token) return JSON.stringify({ error: "SLACK_BOT_TOKEN not configured" });

        const body: Record<string, unknown> = {
          channel: input.channel as string,
          text: input.message as string,
        };
        if (input.thread_ts) body.thread_ts = input.thread_ts;

        const res = await fetch("https://slack.com/api/chat.postMessage", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(body),
        });
        const data = await res.json();
        return JSON.stringify({ ok: data.ok, ts: data.ts, error: data.error });
      }

      case "send_sms": {
        const recipient = input.to as "adam" | "maggie";
        const phoneEnv =
          recipient === "adam" ? process.env.ADAM_PHONE : process.env.MAGGIE_PHONE;
        if (!phoneEnv)
          return JSON.stringify({ error: `Phone not configured for ${recipient}` });

        const result = await blooSendMessage({
          to: phoneEnv,
          message: input.message as string,
        });
        return JSON.stringify(result);
      }

      case "create_delegation": {
        // Find team member by name
        const allMembers = await db
          .select({ id: schema.teamMembers.id, name: schema.teamMembers.name })
          .from(schema.teamMembers)
          .where(eq(schema.teamMembers.isActive, true));

        const assigneeName = (input.assignee as string).toLowerCase();
        const member = allMembers.find((m) =>
          m.name.toLowerCase().includes(assigneeName)
        );

        const dueDate = input.dueDate
          ? new Date(input.dueDate as string)
          : null;

        const [task] = await db
          .insert(schema.tasks)
          .values({
            title: input.title as string,
            description: (input.description as string) || null,
            status: "todo",
            priority: ((input.priority as string) || "medium") as
              | "low"
              | "medium"
              | "high"
              | "urgent",
            assigneeId: member?.id || null,
            dueDate,
          })
          .returning();

        // Optionally notify Slack
        if (input.notifySlack !== false && member && process.env.SLACK_BOT_TOKEN) {
          const slackId =
            member.name.toLowerCase().includes("maggie")
              ? process.env.MAGGIE_SLACK_ID
              : process.env.ADAM_SLACK_ID;

          if (slackId) {
            await fetch("https://slack.com/api/chat.postMessage", {
              method: "POST",
              headers: {
                Authorization: `Bearer ${process.env.SLACK_BOT_TOKEN}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                channel: slackId,
                text: `*New task delegated to you:*\n*${task.title}*${task.description ? `\n${task.description}` : ""}${dueDate ? `\n_Due: ${dueDate.toLocaleDateString()}_` : ""}`,
              }),
            }).catch(() => {});
          }
        }

        return JSON.stringify({
          created: true,
          taskId: task.id,
          title: task.title,
          assignee: member?.name || "Unassigned",
        });
      }

      case "get_company_snapshot": {
        const [mrrResult, cashResult, sprintResult, leadResult, alertResult, taskResult] =
          await Promise.all([
            db
              .select({
                total: sql<number>`COALESCE(SUM(${schema.subscriptions.amount}), 0)`,
              })
              .from(schema.subscriptions)
              .where(eq(schema.subscriptions.status, "active")),

            db.select().from(schema.mercuryAccounts),

            db
              .select({
                id: schema.weeklySprints.id,
                title: schema.weeklySprints.title,
                weekOf: schema.weeklySprints.weekOf,
                weeklyFocus: schema.weeklySprints.weeklyFocus,
              })
              .from(schema.weeklySprints)
              .orderBy(desc(schema.weeklySprints.weekOf))
              .limit(1),

            db
              .select({ count: count() })
              .from(schema.leads)
              .where(
                and(
                  eq(schema.leads.isArchived, false),
                  sql`${schema.leads.stage} NOT IN ('closed_won', 'closed_lost')`
                )
              ),

            db
              .select({ count: count() })
              .from(schema.alerts)
              .where(eq(schema.alerts.isResolved, false)),

            db
              .select({ count: count() })
              .from(schema.tasks)
              .where(
                and(
                  eq(schema.tasks.isArchived, false),
                  sql`${schema.tasks.status} NOT IN ('done', 'cancelled')`
                )
              ),
          ]);

        const mrr = Number(mrrResult[0]?.total ?? 0) / 100;
        const cash = cashResult.reduce((s, a) => s + Number(a.balance), 0) / 100;
        const currentSprint = sprintResult[0] || null;

        return JSON.stringify({
          mrr: `$${mrr.toLocaleString()}`,
          cash: `$${cash.toLocaleString()}`,
          activeLeads: leadResult[0]?.count ?? 0,
          unresolvedAlerts: alertResult[0]?.count ?? 0,
          openTasks: taskResult[0]?.count ?? 0,
          currentSprint: currentSprint
            ? {
                id: currentSprint.id,
                title: currentSprint.title,
                weekOf: currentSprint.weekOf,
                focus: currentSprint.weeklyFocus,
              }
            : null,
        });
      }

      case "get_current_sprint": {
        const [sprint] = await db
          .select()
          .from(schema.weeklySprints)
          .orderBy(desc(schema.weeklySprints.weekOf))
          .limit(1);

        if (!sprint) return JSON.stringify({ error: "No sprints found" });

        const sections = await db
          .select({
            id: schema.sprintSections.id,
            projectName: schema.sprintSections.projectName,
            assigneeName: schema.sprintSections.assigneeName,
            goal: schema.sprintSections.goal,
          })
          .from(schema.sprintSections)
          .where(eq(schema.sprintSections.sprintId, sprint.id));

        const tasks = await db
          .select({
            id: schema.tasks.id,
            title: schema.tasks.title,
            status: schema.tasks.status,
            priority: schema.tasks.priority,
            sectionId: schema.taskSprintAssignments.sectionId,
          })
          .from(schema.taskSprintAssignments)
          .innerJoin(
            schema.tasks,
            eq(schema.taskSprintAssignments.taskId, schema.tasks.id)
          )
          .where(eq(schema.taskSprintAssignments.sprintId, sprint.id));

        return JSON.stringify({
          id: sprint.id,
          title: sprint.title,
          weekOf: sprint.weekOf,
          weeklyFocus: sprint.weeklyFocus,
          topOfMind: sprint.topOfMind,
          sections: sections.map((s) => ({
            ...s,
            tasks: tasks.filter((t) => t.sectionId === s.id),
          })),
        });
      }

      case "update_sprint_note": {
        const existing = await db
          .select({ topOfMind: schema.weeklySprints.topOfMind })
          .from(schema.weeklySprints)
          .where(eq(schema.weeklySprints.id, input.sprintId as string))
          .limit(1);

        const current = existing[0]?.topOfMind || "";
        const timestamp = new Date().toLocaleString("en-US", {
          month: "short",
          day: "numeric",
          hour: "numeric",
          minute: "2-digit",
        });
        const newNote = current
          ? `${current}\n\n[${timestamp}] ${input.note}`
          : `[${timestamp}] ${input.note}`;

        await db
          .update(schema.weeklySprints)
          .set({ topOfMind: newNote })
          .where(eq(schema.weeklySprints.id, input.sprintId as string));

        return JSON.stringify({ updated: true, sprintId: input.sprintId });
      }

      default:
        return JSON.stringify({ error: `Unknown CEO tool: ${name}` });
    }
  } catch (error) {
    return JSON.stringify({
      error: `CEO tool ${name} failed: ${error instanceof Error ? error.message : "unknown"}`,
    });
  }
}
