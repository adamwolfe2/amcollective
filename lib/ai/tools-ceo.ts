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
import { setMemory, getAllMemory } from "@/lib/db/repositories/bot-memory";
import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { eq, desc, and, ilike, or } from "drizzle-orm";
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
    name: "write_bot_memory",
    description:
      "Write or update a persistent structured fact in bot_memory — injected into EVERY future prompt. Use for short, stable facts that should always be available: preferences, baselines, decisions, project status, recurring patterns. NOT for session-specific context or data that changes daily.",
    input_schema: {
      type: "object" as const,
      properties: {
        key: {
          type: "string",
          description: "Short snake_case key, e.g. 'tbgc_build_issue', 'adam_sprint_preference', 'cursive_mrr_baseline'",
        },
        value: {
          type: "string",
          description: "The fact to remember. Be specific and include dates when relevant.",
        },
        category: {
          type: "string",
          description: "Category for grouping: 'operations', 'finance', 'people', 'preferences', 'portfolio', 'general'",
        },
      },
      required: ["key", "value"],
    },
  },
  {
    name: "read_bot_memory",
    description: "Read all persistent bot_memory facts. Use to review what structured facts are currently stored.",
    input_schema: {
      type: "object" as const,
      properties: {},
      required: [],
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
  {
    name: "update_task_status",
    description:
      "Update the status of a task by title (fuzzy match) or by ID. Use when Adam says a task is done, blocked, or in progress.",
    input_schema: {
      type: "object" as const,
      properties: {
        taskTitle: {
          type: "string",
          description: "Partial title to search for (case-insensitive). Ignored if taskId is provided.",
        },
        taskId: { type: "string", description: "Exact task UUID (use if you have it)" },
        status: {
          type: "string",
          enum: ["backlog", "todo", "in_progress", "in_review", "done", "cancelled"],
          description: "New status",
        },
      },
      required: ["status"],
    },
  },
  {
    name: "update_rock_status",
    description:
      "Update the status of a quarterly rock (goal) by title or ID. Use when Adam says a rock is on track, at risk, or complete.",
    input_schema: {
      type: "object" as const,
      properties: {
        rockTitle: {
          type: "string",
          description: "Partial rock title to search for (case-insensitive). Ignored if rockId is provided.",
        },
        rockId: { type: "string", description: "Exact rock UUID (use if you have it)" },
        status: {
          type: "string",
          enum: ["on_track", "at_risk", "off_track"],
          description: "New status",
        },
      },
      required: ["status"],
    },
  },
  {
    name: "update_lead",
    description:
      "Move a lead to a new pipeline stage and/or schedule the next follow-up. Use when Adam says a lead moved forward or needs a follow-up.",
    input_schema: {
      type: "object" as const,
      properties: {
        leadId: { type: "string", description: "Exact lead UUID (use if you have it)" },
        companyName: {
          type: "string",
          description: "Company name to search for (case-insensitive). Ignored if leadId provided.",
        },
        stage: {
          type: "string",
          enum: ["awareness", "interest", "consideration", "intent", "closed_won", "closed_lost", "nurture"],
          description: "New pipeline stage",
        },
        nextFollowUpDays: {
          type: "number",
          description: "Set next follow-up N days from now (e.g. 3 = 3 days)",
        },
        notes: {
          type: "string",
          description: "Optional note to append to the lead's notes field",
        },
      },
      required: [],
    },
  },
  {
    name: "add_meeting_note",
    description:
      "Append a quick note to a meeting record by meeting title or client name. Use when Adam wants to capture something from a call.",
    input_schema: {
      type: "object" as const,
      properties: {
        meetingTitle: {
          type: "string",
          description: "Partial meeting title to search for",
        },
        note: { type: "string", description: "Note content to append" },
      },
      required: ["note"],
    },
  },
  {
    name: "create_rock",
    description:
      "Create a new quarterly rock (90-day goal). Use when Adam sets a new quarterly objective. Quarter format: 'Q1 2026', 'Q2 2026', etc.",
    input_schema: {
      type: "object" as const,
      properties: {
        title: { type: "string", description: "Rock title / goal statement" },
        description: { type: "string", description: "Optional detail on what success looks like" },
        quarter: { type: "string", description: "Quarter string, e.g. 'Q2 2026'. Default to current quarter if not specified." },
        projectName: { type: "string", description: "Optional portfolio project name to link (TBGC, Trackr, Cursive, TaskSpace, Wholesail, Hook)" },
        dueDateDays: { type: "number", description: "Days from now for the due date (default: end of quarter)" },
      },
      required: ["title"],
    },
  },
  {
    name: "search_leads",
    description:
      "Search and list CRM leads by stage, company name, or contact name. Use to answer questions like 'who are our hot leads?' or 'what's the pipeline look like?'",
    input_schema: {
      type: "object" as const,
      properties: {
        stage: {
          type: "string",
          enum: ["awareness", "interest", "consideration", "intent", "closed_won", "closed_lost", "nurture"],
          description: "Filter by pipeline stage",
        },
        search: { type: "string", description: "Search by company or contact name" },
        limit: { type: "number", description: "Max results (default 10)" },
      },
      required: [],
    },
  },
  {
    name: "close_sprint",
    description:
      "Mark the current sprint as complete and take a snapshot for velocity tracking. Call this at end of week before creating a new sprint. This enables Phase 3 sprint velocity intelligence.",
    input_schema: {
      type: "object" as const,
      properties: {
        sprintId: { type: "string", description: "Sprint ID to close. If not provided, closes the most recent sprint." },
        retrospective: { type: "string", description: "Optional brief retro note to store on the sprint" },
      },
      required: [],
    },
  },
  {
    name: "create_sprint",
    description:
      "Create a new weekly sprint. Call after closing the previous one. Focus should be 1 sentence max — what is this week actually about?",
    input_schema: {
      type: "object" as const,
      properties: {
        title: { type: "string", description: "Sprint title, e.g. '3/10 Week Sprint'" },
        weeklyFocus: { type: "string", description: "1-sentence focus for the week" },
        weekOf: { type: "string", description: "Monday's date in YYYY-MM-DD format" },
      },
      required: ["title"],
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

      case "write_bot_memory": {
        await setMemory(
          input.key as string,
          input.value as string,
          (input.category as string) || "general",
          "ai"
        );
        return JSON.stringify({ success: true, key: input.key });
      }

      case "read_bot_memory": {
        const rows = await getAllMemory();
        return JSON.stringify({ count: rows.length, memory: rows });
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

      case "update_task_status": {
        let task;
        if (input.taskId) {
          const [row] = await db
            .select({ id: schema.tasks.id, title: schema.tasks.title })
            .from(schema.tasks)
            .where(eq(schema.tasks.id, input.taskId as string))
            .limit(1);
          task = row;
        } else if (input.taskTitle) {
          const [row] = await db
            .select({ id: schema.tasks.id, title: schema.tasks.title })
            .from(schema.tasks)
            .where(ilike(schema.tasks.title, `%${input.taskTitle}%`))
            .orderBy(desc(schema.tasks.updatedAt))
            .limit(1);
          task = row;
        }
        if (!task) return JSON.stringify({ error: "Task not found. Try a different title." });
        await db
          .update(schema.tasks)
          .set({ status: input.status as "backlog" | "todo" | "in_progress" | "in_review" | "done" | "cancelled" })
          .where(eq(schema.tasks.id, task.id));
        return JSON.stringify({ updated: true, taskId: task.id, title: task.title, newStatus: input.status });
      }

      case "update_rock_status": {
        let rock;
        if (input.rockId) {
          const [row] = await db
            .select({ id: schema.rocks.id, title: schema.rocks.title })
            .from(schema.rocks)
            .where(eq(schema.rocks.id, input.rockId as string))
            .limit(1);
          rock = row;
        } else if (input.rockTitle) {
          const [row] = await db
            .select({ id: schema.rocks.id, title: schema.rocks.title })
            .from(schema.rocks)
            .where(ilike(schema.rocks.title, `%${input.rockTitle}%`))
            .orderBy(desc(schema.rocks.updatedAt))
            .limit(1);
          rock = row;
        }
        if (!rock) return JSON.stringify({ error: "Rock not found. Try a different title." });
        await db
          .update(schema.rocks)
          .set({ status: input.status as "on_track" | "at_risk" | "off_track" })
          .where(eq(schema.rocks.id, rock.id));
        return JSON.stringify({ updated: true, rockId: rock.id, title: rock.title, newStatus: input.status });
      }

      case "update_lead": {
        let lead;
        if (input.leadId) {
          const [row] = await db
            .select({ id: schema.leads.id, contactName: schema.leads.contactName, companyName: schema.leads.companyName, notes: schema.leads.notes })
            .from(schema.leads)
            .where(eq(schema.leads.id, input.leadId as string))
            .limit(1);
          lead = row;
        } else if (input.companyName) {
          const [row] = await db
            .select({ id: schema.leads.id, contactName: schema.leads.contactName, companyName: schema.leads.companyName, notes: schema.leads.notes })
            .from(schema.leads)
            .where(
              or(
                ilike(schema.leads.companyName, `%${input.companyName}%`),
                ilike(schema.leads.contactName, `%${input.companyName}%`)
              )
            )
            .orderBy(desc(schema.leads.updatedAt))
            .limit(1);
          lead = row;
        }
        if (!lead) return JSON.stringify({ error: "Lead not found." });

        const updates: Record<string, unknown> = {};
        if (input.stage) updates.stage = input.stage;
        if (input.nextFollowUpDays) {
          const d = new Date();
          d.setDate(d.getDate() + (input.nextFollowUpDays as number));
          updates.nextFollowUpAt = d;
        }
        if (input.notes) {
          const existing = lead.notes as string | null;
          const ts = new Date().toISOString().split("T")[0];
          updates.notes = existing ? `${existing}\n[${ts}] ${input.notes}` : `[${ts}] ${input.notes}`;
        }

        if (Object.keys(updates).length === 0) return JSON.stringify({ error: "Nothing to update — provide stage, nextFollowUpDays, or notes." });

        await db.update(schema.leads).set(updates).where(eq(schema.leads.id, lead.id));
        return JSON.stringify({ updated: true, leadId: lead.id, contact: lead.contactName, company: lead.companyName, changes: Object.keys(updates) });
      }

      case "add_meeting_note": {
        const [meeting] = await db
          .select({ id: schema.meetings.id, title: schema.meetings.title, notes: schema.meetings.notes })
          .from(schema.meetings)
          .where(
            input.meetingTitle
              ? ilike(schema.meetings.title, `%${input.meetingTitle}%`)
              : undefined
          )
          .orderBy(desc(schema.meetings.scheduledAt))
          .limit(1);
        if (!meeting) return JSON.stringify({ error: "Meeting not found." });

        const existing = meeting.notes as string | null;
        const ts = new Date().toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
        const newNotes = existing ? `${existing}\n\n[${ts}] ${input.note}` : `[${ts}] ${input.note}`;
        await db.update(schema.meetings).set({ notes: newNotes }).where(eq(schema.meetings.id, meeting.id));
        return JSON.stringify({ updated: true, meetingId: meeting.id, title: meeting.title });
      }

      case "create_rock": {
        // Determine quarter: current if not specified
        const now = new Date();
        const qNum = Math.ceil((now.getMonth() + 1) / 3);
        const defaultQuarter = `Q${qNum} ${now.getFullYear()}`;

        // Resolve project ID from name if provided
        let projectId: string | null = null;
        if (input.projectName) {
          const [proj] = await db
            .select({ id: schema.portfolioProjects.id })
            .from(schema.portfolioProjects)
            .where(ilike(schema.portfolioProjects.name, `%${input.projectName}%`))
            .limit(1);
          projectId = proj?.id ?? null;
        }

        // Compute due date
        let dueDate: Date | null = null;
        if (input.dueDateDays) {
          dueDate = new Date();
          dueDate.setDate(dueDate.getDate() + (input.dueDateDays as number));
        } else {
          // Default: end of specified quarter
          const qStr = (input.quarter as string) || defaultQuarter;
          const qMatch = qStr.match(/Q(\d)\s+(\d{4})/);
          if (qMatch) {
            const q = parseInt(qMatch[1]);
            const y = parseInt(qMatch[2]);
            dueDate = new Date(y, q * 3, 0); // last day of quarter
          }
        }

        const [rock] = await db
          .insert(schema.rocks)
          .values({
            title: input.title as string,
            description: (input.description as string) ?? null,
            quarter: (input.quarter as string) || defaultQuarter,
            projectId,
            status: "on_track",
            dueDate,
          })
          .returning();

        return JSON.stringify({ created: true, rockId: rock.id, title: rock.title, quarter: rock.quarter });
      }

      case "search_leads": {
        const conditions = [eq(schema.leads.isArchived, false)];
        if (input.stage) {
          conditions.push(eq(schema.leads.stage, input.stage as "awareness" | "interest" | "consideration" | "intent" | "closed_won" | "closed_lost" | "nurture"));
        }

        const baseQuery = db
          .select({
            id: schema.leads.id,
            contactName: schema.leads.contactName,
            companyName: schema.leads.companyName,
            stage: schema.leads.stage,
            nextFollowUpAt: schema.leads.nextFollowUpAt,
          })
          .from(schema.leads)
          .where(and(...conditions))
          .orderBy(desc(schema.leads.updatedAt))
          .limit((input.limit as number) || 10);

        const leads = input.search
          ? await db
              .select({
                id: schema.leads.id,
                contactName: schema.leads.contactName,
                companyName: schema.leads.companyName,
                stage: schema.leads.stage,
                nextFollowUpAt: schema.leads.nextFollowUpAt,
              })
              .from(schema.leads)
              .where(
                and(
                  eq(schema.leads.isArchived, false),
                  or(
                    ilike(schema.leads.companyName, `%${input.search}%`),
                    ilike(schema.leads.contactName, `%${input.search}%`)
                  )
                )
              )
              .orderBy(desc(schema.leads.updatedAt))
              .limit((input.limit as number) || 10)
          : await baseQuery;

        return JSON.stringify({ count: leads.length, leads });
      }

      case "close_sprint": {
        // Find the sprint to close
        const [sprint] = input.sprintId
          ? await db.select().from(schema.weeklySprints).where(eq(schema.weeklySprints.id, input.sprintId as string)).limit(1)
          : await db.select().from(schema.weeklySprints).orderBy(desc(schema.weeklySprints.weekOf)).limit(1);

        if (!sprint) return JSON.stringify({ error: "No sprint found to close." });

        // Get task stats for this sprint
        const assignedTasks = await db
          .select({ taskId: schema.taskSprintAssignments.taskId })
          .from(schema.taskSprintAssignments)
          .where(eq(schema.taskSprintAssignments.sprintId, sprint.id));

        let doneCount = 0;
        if (assignedTasks.length > 0) {
          const taskIds = assignedTasks.map((t) => t.taskId);
          const doneTasks = await db
            .select({ id: schema.tasks.id })
            .from(schema.tasks)
            .where(and(eq(schema.tasks.status, "done"), sql`${schema.tasks.id} = ANY(ARRAY[${sql.raw(taskIds.map(id => `'${id}'::uuid`).join(","))}])`));
          doneCount = doneTasks.length;
        }

        // Store retrospective note if provided
        if (input.retrospective) {
          const ts = new Date().toLocaleString("en-US", { month: "short", day: "numeric" });
          const existingNote = sprint.topOfMind as string | null;
          const newNote = existingNote
            ? `${existingNote}\n\n[Retro ${ts}] ${input.retrospective}`
            : `[Retro ${ts}] ${input.retrospective}`;
          await db.update(schema.weeklySprints).set({ topOfMind: newNote }).where(eq(schema.weeklySprints.id, sprint.id));
        }

        // Write sprint snapshot for velocity tracking
        const completionRate = assignedTasks.length > 0 ? Math.round((doneCount / assignedTasks.length) * 100) : 0;
        await db.insert(schema.sprintSnapshots).values({
          sprintId: sprint.id,
          totalTasks: assignedTasks.length,
          completedTasks: doneCount,
          completionRate,
          velocityLabel: completionRate >= 80 ? "high" : completionRate >= 50 ? "medium" : "low",
        }).onConflictDoNothing();

        return JSON.stringify({
          closed: true,
          sprintId: sprint.id,
          title: sprint.title,
          totalTasks: assignedTasks.length,
          completedTasks: doneCount,
          completionRate: assignedTasks.length > 0 ? `${Math.round((doneCount / assignedTasks.length) * 100)}%` : "no tasks tracked",
        });
      }

      case "create_sprint": {
        // Determine week_of: next Monday if not provided
        const weekOfStr = input.weekOf as string | undefined;
        let weekOf: Date;
        if (weekOfStr) {
          weekOf = new Date(weekOfStr + "T12:00:00Z");
        } else {
          weekOf = new Date();
          const day = weekOf.getDay();
          const daysToMonday = day === 0 ? 1 : 8 - day;
          weekOf.setDate(weekOf.getDate() + daysToMonday);
          weekOf.setHours(12, 0, 0, 0);
        }

        const [sprint] = await db
          .insert(schema.weeklySprints)
          .values({
            title: input.title as string,
            weeklyFocus: (input.weeklyFocus as string) ?? null,
            weekOf,
          })
          .returning();

        return JSON.stringify({ created: true, sprintId: sprint.id, title: sprint.title, weekOf: sprint.weekOf });
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
