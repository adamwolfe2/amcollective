/**
 * CEO Tools — memory, Slack, SMS, delegation, sprints, vault
 */

import { tool } from "ai";
import { z } from "zod";
import { readMemory, writeMemory, listMemory, searchMemory } from "../memory";
import { sendMessage as blooSendMessage } from "@/lib/integrations/blooio";
import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { eq, desc, and, sql, count, or, ilike } from "drizzle-orm";

export const ceoTools = {
  write_memory: tool({
    description: "Write or update a file in the persistent knowledge base. Use to remember decisions, preferences, key context, or facts from this conversation.",
    inputSchema: z.object({
      path: z.string().describe("File path e.g. 'decisions/2026-03-async.md', 'notes/tbgc-context.md'"),
      content: z.string().describe("Full markdown content"),
      summary: z.string().describe("One-line commit message"),
    }),
    execute: async ({ path, content, summary }) => {
      const success = await writeMemory(path, content, summary);
      return { success, path };
    },
  }),

  read_memory: tool({
    description: "Read a specific file from the persistent knowledge base.",
    inputSchema: z.object({
      path: z.string().describe("File path e.g. 'people/adam.md'"),
    }),
    execute: async ({ path }) => {
      const content = await readMemory(path);
      return content ? { path, content } : { error: "File not found", path };
    },
  }),

  list_memories: tool({
    description: "List files in the knowledge base to discover what has been remembered.",
    inputSchema: z.object({
      prefix: z.string().optional().describe("Directory prefix e.g. 'decisions/', 'notes/'"),
    }),
    execute: async ({ prefix }) => {
      const files = await listMemory(prefix ?? "");
      return { files };
    },
  }),

  search_memory: tool({
    description: "Semantically search the knowledge base for relevant memories.",
    inputSchema: z.object({
      query: z.string().describe("Search query"),
      limit: z.number().optional().describe("Max results (default 5)"),
    }),
    execute: async ({ query, limit }) => {
      const results = await searchMemory(query, limit ?? 5);
      return { results };
    },
  }),

  send_to_slack: tool({
    description: "Send a proactive Slack message to a channel or user.",
    inputSchema: z.object({
      channel: z.string().describe("Slack channel ID (C...) or user ID (U...) for DM"),
      message: z.string().describe("Message text (markdown supported)"),
      thread_ts: z.string().optional().describe("Thread timestamp to reply in a thread"),
    }),
    execute: async ({ channel, message, thread_ts }) => {
      const token = process.env.SLACK_BOT_TOKEN;
      if (!token) return { error: "SLACK_BOT_TOKEN not configured" };
      const body: Record<string, unknown> = { channel, text: message };
      if (thread_ts) body.thread_ts = thread_ts;
      const res = await fetch("https://slack.com/api/chat.postMessage", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      return { ok: data.ok, ts: data.ts, error: data.error };
    },
  }),

  send_sms: tool({
    description: "Send an SMS/iMessage to Adam or Maggie via Bloo.io.",
    inputSchema: z.object({
      to: z.enum(["adam", "maggie"]).describe("Recipient"),
      message: z.string().describe("Message text"),
    }),
    execute: async ({ to, message }) => {
      const phone = to === "adam" ? process.env.ADAM_PHONE : process.env.MAGGIE_PHONE;
      if (!phone) return { error: `Phone not configured for ${to}` };
      return blooSendMessage({ to: phone, message });
    },
  }),

  create_delegation: tool({
    description: "Create a task assigned to a team member with optional Slack notification.",
    inputSchema: z.object({
      assignee: z.string().describe("Name of person to assign to"),
      title: z.string().describe("Task title"),
      description: z.string().optional().describe("Task description"),
      priority: z.enum(["low", "medium", "high", "urgent"]).optional(),
      dueDate: z.string().optional().describe("Due date YYYY-MM-DD"),
    }),
    execute: async ({ assignee, title, description, priority, dueDate }) => {
      const allMembers = await db.select({ id: schema.teamMembers.id, name: schema.teamMembers.name })
        .from(schema.teamMembers).where(eq(schema.teamMembers.isActive, true));
      const member = allMembers.find((m) => m.name.toLowerCase().includes(assignee.toLowerCase()));
      const [task] = await db.insert(schema.tasks).values({
        title,
        description: description ?? null,
        status: "todo",
        priority: (priority ?? "medium") as "low" | "medium" | "high" | "urgent",
        assigneeId: member?.id ?? null,
        dueDate: dueDate ? new Date(dueDate) : null,
      }).returning();
      if (member) {
        const slackId = member.name.toLowerCase().includes("maggie") ? process.env.MAGGIE_SLACK_ID : process.env.ADAM_SLACK_ID;
        if (slackId && process.env.SLACK_BOT_TOKEN) {
          await fetch("https://slack.com/api/chat.postMessage", {
            method: "POST",
            headers: { Authorization: `Bearer ${process.env.SLACK_BOT_TOKEN}`, "Content-Type": "application/json" },
            body: JSON.stringify({ channel: slackId, text: `*New task:* ${title}${description ? `\n${description}` : ""}` }),
          }).catch(() => {});
        }
      }
      return { created: true, taskId: task.id, assignee: member?.name ?? "Unassigned" };
    },
  }),

  get_company_snapshot: tool({
    description: "Real-time company snapshot: MRR, cash, sprint status, leads, alerts, tasks.",
    inputSchema: z.object({}),
    execute: async () => {
      const [mrrRes, sprint, leads, alerts, tasks] = await Promise.all([
        db.select({ total: sql<number>`COALESCE(SUM(${schema.subscriptions.amount}), 0)` })
          .from(schema.subscriptions).where(eq(schema.subscriptions.status, "active")),
        db.select({ id: schema.weeklySprints.id, title: schema.weeklySprints.title, weekOf: schema.weeklySprints.weekOf, weeklyFocus: schema.weeklySprints.weeklyFocus })
          .from(schema.weeklySprints).orderBy(desc(schema.weeklySprints.weekOf)).limit(1),
        db.select({ count: count() }).from(schema.leads)
          .where(and(eq(schema.leads.isArchived, false), sql`${schema.leads.stage} NOT IN ('closed_won', 'closed_lost')`)),
        db.select({ count: count() }).from(schema.alerts).where(eq(schema.alerts.isResolved, false)),
        db.select({ count: count() }).from(schema.tasks)
          .where(and(eq(schema.tasks.isArchived, false), sql`${schema.tasks.status} NOT IN ('done', 'cancelled')`)),
      ]);
      return {
        mrr: `$${(Number(mrrRes[0]?.total ?? 0) / 100).toLocaleString()}`,
        activeLeads: leads[0]?.count ?? 0,
        unresolvedAlerts: alerts[0]?.count ?? 0,
        openTasks: tasks[0]?.count ?? 0,
        currentSprint: sprint[0] ?? null,
      };
    },
  }),

  get_current_sprint: tool({
    description: "Get the current week's sprint with all sections and tasks.",
    inputSchema: z.object({}),
    execute: async () => {
      const [sprint] = await db.select().from(schema.weeklySprints)
        .orderBy(desc(schema.weeklySprints.weekOf)).limit(1);
      if (!sprint) return { error: "No sprints found" };
      const sections = await db.select().from(schema.sprintSections)
        .where(eq(schema.sprintSections.sprintId, sprint.id));
      const tasks = await db.select({ id: schema.tasks.id, title: schema.tasks.title, status: schema.tasks.status, sectionId: schema.taskSprintAssignments.sectionId })
        .from(schema.taskSprintAssignments)
        .innerJoin(schema.tasks, eq(schema.taskSprintAssignments.taskId, schema.tasks.id))
        .where(eq(schema.taskSprintAssignments.sprintId, sprint.id));
      return { ...sprint, sections: sections.map((s) => ({ ...s, tasks: tasks.filter((t) => t.sectionId === s.id) })) };
    },
  }),

  update_sprint_note: tool({
    description: "Update the top-of-mind note on the current sprint.",
    inputSchema: z.object({
      sprintId: z.string().describe("Sprint ID"),
      note: z.string().describe("Note to append"),
    }),
    execute: async ({ sprintId, note }) => {
      const [existing] = await db.select({ topOfMind: schema.weeklySprints.topOfMind })
        .from(schema.weeklySprints).where(eq(schema.weeklySprints.id, sprintId)).limit(1);
      const ts = new Date().toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
      const newNote = existing?.topOfMind ? `${existing.topOfMind}\n\n[${ts}] ${note}` : `[${ts}] ${note}`;
      await db.update(schema.weeklySprints).set({ topOfMind: newNote }).where(eq(schema.weeklySprints.id, sprintId));
      return { updated: true };
    },
  }),

  search_vault: tool({
    description:
      "Search the credentials vault by service name, label, or keyword. Returns metadata only — label, service, username, URL, notes. Never returns passwords. Instruct the user to use the Reveal button in the vault UI to access passwords.",
    inputSchema: z.object({
      query: z.string().describe("Service name, label, or keyword to search for (e.g. 'stripe', 'mercury', 'github')"),
    }),
    execute: async ({ query }) => {
      const results = await db
        .select({
          id: schema.credentials.id,
          label: schema.credentials.label,
          service: schema.credentials.service,
          username: schema.credentials.username,
          url: schema.credentials.url,
          notes: schema.credentials.notes,
          hasPassword: schema.credentials.passwordEncrypted,
        })
        .from(schema.credentials)
        .where(
          or(
            ilike(schema.credentials.label, `%${query}%`),
            ilike(schema.credentials.service, `%${query}%`),
            ilike(schema.credentials.notes, `%${query}%`)
          )
        )
        .limit(10);

      if (results.length === 0) {
        return { found: 0, message: `No credentials found matching "${query}"` };
      }

      return {
        found: results.length,
        credentials: results.map((r) => ({
          id: r.id,
          label: r.label,
          service: r.service,
          username: r.username ?? null,
          url: r.url ?? null,
          notes: r.notes ?? null,
          hasPassword: !!r.hasPassword,
        })),
        note: "Passwords are not returned for security. Use the Reveal button at /vault to access them.",
      };
    },
  }),
};
