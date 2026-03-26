/**
 * Operations domain tools — get_company_snapshot, get_current_sprint, update_sprint_note,
 * create_sprint, close_sprint, create_sprint_section, get_portfolio_snapshot,
 * create_task, add_task_to_sprint, update_task_status, create_rock, update_rock_status,
 * update_scorecard_entry, create_delegation
 */

import type Anthropic from "@anthropic-ai/sdk";
import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { eq, desc, and, ilike, inArray } from "drizzle-orm";
import { sql, count } from "drizzle-orm";

export const definitions: Anthropic.Tool[] = [
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
    name: "create_sprint_section",
    description:
      "Add a new project section to the current sprint. Use when Adam says 'add a [ProjectName] section to the sprint' or 'start tracking [project] in this sprint'.",
    input_schema: {
      type: "object" as const,
      properties: {
        projectName: { type: "string", description: "Portfolio project name (TBGC, Trackr, Cursive, etc.) or any free-text section name" },
        goal: { type: "string", description: "Optional goal / focus sentence for this section" },
        assigneeName: { type: "string", description: "Assignee for this section (Adam or Maggie). Optional." },
      },
      required: ["projectName"],
    },
  },
  {
    name: "get_portfolio_snapshot",
    description:
      "Get a unified snapshot across all 6 portfolio products: Wholesail, Trackr, Cursive, TaskSpace, TBGC, Hook. Returns MRR, user counts, pipeline, and health per product in one call. Use when asked about 'all products', 'portfolio', 'across platforms', or any multi-product question.",
    input_schema: {
      type: "object" as const,
      properties: {
        platform: {
          type: "string",
          enum: ["all", "wholesail", "trackr", "cursive", "taskspace", "tbgc", "hook"],
          description: "Which platform to fetch. 'all' returns all connected platforms in parallel.",
        },
      },
      required: [],
    },
  },
  {
    name: "create_task",
    description:
      "Create a new task and optionally add it to the current sprint. Use when Adam says 'add a task', 'create a ticket', or 'put X on the list'. Can link to a portfolio project by name. Set addToCurrentSprint: true to immediately drop it into this week's sprint.",
    input_schema: {
      type: "object" as const,
      properties: {
        title: { type: "string", description: "Task title" },
        description: { type: "string", description: "Optional detail" },
        priority: { type: "string", enum: ["low", "medium", "high", "urgent"], description: "Default: medium" },
        projectName: { type: "string", description: "Portfolio project to link (TBGC, Trackr, Cursive, TaskSpace, Wholesail, Hook). Fuzzy matched." },
        assigneeName: { type: "string", description: "Team member to assign to (Adam, Maggie). Optional." },
        dueDateDays: { type: "number", description: "Days from today until due. Optional." },
        addToCurrentSprint: { type: "boolean", description: "If true, adds the task to the current week's sprint. Default: false." },
      },
      required: ["title"],
    },
  },
  {
    name: "add_task_to_sprint",
    description:
      "Add an existing task to the current sprint by title (fuzzy match) or ID. Also use this to move a task from backlog into this week's sprint. Optionally creates a sprint section for the project if it doesn't exist.",
    input_schema: {
      type: "object" as const,
      properties: {
        taskTitle: { type: "string", description: "Partial task title to search for" },
        taskId: { type: "string", description: "Exact task UUID (use if you have it)" },
        sectionProjectName: { type: "string", description: "Which project section to add it under. If omitted, adds to first section or creates a General section." },
      },
      required: [],
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
          enum: ["on_track", "at_risk", "off_track", "done"],
          description: "New status",
        },
      },
      required: ["status"],
    },
  },
  {
    name: "update_scorecard_entry",
    description:
      "Log a weekly scorecard metric value. Use when Adam reports numbers like 'TaskSpace had 4 new signups this week' or 'Cursive reply rate was 12%'. Fuzzy-matches the metric name and upserts the entry for the current week.",
    input_schema: {
      type: "object" as const,
      properties: {
        metricName: { type: "string", description: "Partial metric name to search for (e.g. 'new signups', 'reply rate', 'MRR')" },
        value: { type: "number", description: "The numeric value to record" },
        notes: { type: "string", description: "Optional context note" },
        weekOffset: { type: "number", description: "Weeks back from current Monday (0 = this week, 1 = last week). Default: 0." },
      },
      required: ["metricName", "value"],
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
];

export async function handler(
  name: string,
  input: Record<string, unknown>
): Promise<string | undefined> {
  switch (name) {
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
          .where(and(eq(schema.tasks.status, "done"), inArray(schema.tasks.id, taskIds)));
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

    case "create_sprint_section": {
      const [sprint] = await db
        .select({ id: schema.weeklySprints.id, title: schema.weeklySprints.title })
        .from(schema.weeklySprints)
        .orderBy(desc(schema.weeklySprints.weekOf))
        .limit(1);
      if (!sprint) return JSON.stringify({ error: "No current sprint found." });

      // Resolve project ID if a known portfolio project
      let projectId: string | null = null;
      const [proj] = await db
        .select({ id: schema.portfolioProjects.id })
        .from(schema.portfolioProjects)
        .where(ilike(schema.portfolioProjects.name, `%${input.projectName}%`))
        .limit(1);
      projectId = proj?.id ?? null;

      // Resolve assignee
      let assigneeId: string | null = null;
      let assigneeName: string | null = null;
      if (input.assigneeName) {
        const [member] = await db
          .select({ id: schema.teamMembers.id, name: schema.teamMembers.name })
          .from(schema.teamMembers)
          .where(ilike(schema.teamMembers.name, `%${input.assigneeName}%`))
          .limit(1);
        assigneeId = member?.id ?? null;
        assigneeName = member?.name ?? (input.assigneeName as string);
      }

      // Get current max sortOrder
      const [maxSort] = await db
        .select({ max: sql<number>`COALESCE(MAX(${schema.sprintSections.sortOrder}), 0)` })
        .from(schema.sprintSections)
        .where(eq(schema.sprintSections.sprintId, sprint.id));

      const [section] = await db
        .insert(schema.sprintSections)
        .values({
          sprintId: sprint.id,
          projectId,
          projectName: input.projectName as string,
          assigneeId,
          assigneeName,
          goal: (input.goal as string) ?? null,
          sortOrder: (maxSort?.max ?? 0) + 1,
        })
        .returning();

      return JSON.stringify({
        created: true,
        sectionId: section.id,
        projectName: section.projectName,
        sprintTitle: sprint.title,
        goal: section.goal,
      });
    }

    case "get_portfolio_snapshot": {
      const platform = (input.platform as string) || "all";
      const results: Record<string, unknown> = {};

      const fetchAll = platform === "all";

      await Promise.all([
        // Wholesail
        (fetchAll || platform === "wholesail") ? (async () => {
          const { getSnapshot: wsSnap, isConfigured: wsOk } = await import("@/lib/connectors/wholesail");
          if (!wsOk()) { results.wholesail = { error: "Not configured" }; return; }
          const r = await wsSnap();
          if (!r.success) { results.wholesail = { error: r.error }; return; }
          const d = r.data!;
          results.wholesail = {
            liveClients: d.liveClients,
            activeBuilds: d.activeBuilds,
            mrrFromRetainers: d.mrrFromRetainers,
            pipelineValue: d.pipelineValue,
            buildsByStatus: d.buildsByStatus,
            intake: d.intake,
            stuckProjects: d.stuckProjects,
            overdueProjects: d.overdueProjects,
            buildCostsMtdCents: d.buildCostsMtdCents,
          };
        })() : Promise.resolve(),

        // Trackr
        (fetchAll || platform === "trackr") ? (async () => {
          const { getSnapshot: trSnap, isConfigured: trOk } = await import("@/lib/connectors/trackr");
          if (!trOk()) { results.trackr = { error: "Not configured" }; return; }
          const r = await trSnap();
          if (!r.success) { results.trackr = { error: r.error }; return; }
          const d = r.data!;
          results.trackr = {
            totalWorkspaces: d.totalWorkspaces,
            newWorkspacesWeek: d.newWorkspacesWeek,
            activeSubscriptions: d.activeSubscriptions,
            trialingSubscriptions: d.trialingSubscriptions,
            mrrCents: d.mrrCents,
            planBreakdown: d.planBreakdown,
            auditPipelinePending: d.auditPipelinePending,
            auditSubmissionsLastWeek: d.auditSubmissionsLastWeek,
            apiCostsMtdCents: d.apiCostsMtdCents,
            activeArchitects: d.activeArchitects,
            pendingArchitectApplications: d.pendingArchitectApplications,
            pendingCommissionsCents: d.pendingCommissionsCents,
          };
        })() : Promise.resolve(),

        // Cursive
        (fetchAll || platform === "cursive") ? (async () => {
          const { getSnapshot: cuSnap, isConfigured: cuOk } = await import("@/lib/connectors/cursive");
          if (!cuOk()) { results.cursive = { error: "Not configured" }; return; }
          const r = await cuSnap();
          if (!r.success) { results.cursive = { error: r.error }; return; }
          const d = r.data!;
          results.cursive = {
            totalWorkspaces: d.totalWorkspaces,
            managedByOps: d.managedByOps,
            pipeline: d.pipeline,
            bookings: d.bookings,
            pixels: d.pixels,
            leads: d.leads,
            affiliates: d.affiliates,
          };
        })() : Promise.resolve(),

        // TaskSpace
        (fetchAll || platform === "taskspace") ? (async () => {
          const { getSnapshot: tsSnap, isConfigured: tsOk } = await import("@/lib/connectors/taskspace");
          if (!tsOk()) { results.taskspace = { error: "Not configured" }; return; }
          const r = await tsSnap();
          if (!r.success) { results.taskspace = { error: r.error }; return; }
          const d = r.data!;
          results.taskspace = {
            totalOrgs: d.totalOrgs,
            totalMembers: d.totalMembers,
            eodRate7Day: d.eodRate7Day,
            eodsToday: d.eodsToday,
            activeTasks: d.activeTasks,
            openEscalations: d.openEscalations,
            rocksOnTrack: d.rocksOnTrack,
            rocksAtRisk: d.rocksAtRisk,
            planBreakdown: d.planBreakdown,
            payingOrgs: d.payingOrgs,
            mrrCents: d.mrrCents,
            criticalOrgs: d.orgs.filter((o) => o.riskLevel === "critical").map((o) => o.name),
          };
        })() : Promise.resolve(),

        // TBGC
        (fetchAll || platform === "tbgc") ? (async () => {
          const { getSnapshot: tbSnap, isConfigured: tbOk } = await import("@/lib/connectors/tbgc");
          if (!tbOk()) { results.tbgc = { error: "Not configured" }; return; }
          const r = await tbSnap();
          if (!r.success) { results.tbgc = { error: r.error }; return; }
          const d = r.data!;
          results.tbgc = {
            mrrCents: d.mrrCents,
            activeSubscriptions: d.activeSubscriptions,
            stage: d.stage,
            notes: d.notes,
          };
        })() : Promise.resolve(),

        // Hook
        (fetchAll || platform === "hook") ? (async () => {
          const { getSnapshot: hkSnap, isConfigured: hkOk } = await import("@/lib/connectors/hook");
          if (!hkOk()) { results.hook = { error: "Not configured" }; return; }
          const r = await hkSnap();
          if (!r.success) { results.hook = { error: r.error }; return; }
          const d = r.data!;
          results.hook = {
            mrrCents: d.mrrCents,
            activeSubscriptions: d.activeSubscriptions,
            trialingSubscriptions: d.trialingSubscriptions,
            stage: d.stage,
            notes: d.notes,
          };
        })() : Promise.resolve(),
      ]);

      return JSON.stringify({ platform, snapshot: results, fetchedAt: new Date().toISOString() });
    }

    // ─── Tasks & Sprint ──────────────────────────────────────────────────────

    case "create_task": {
      // Resolve project if named
      let projectId: string | null = null;
      if (input.projectName) {
        const [proj] = await db
          .select({ id: schema.portfolioProjects.id })
          .from(schema.portfolioProjects)
          .where(ilike(schema.portfolioProjects.name, `%${input.projectName}%`))
          .limit(1);
        projectId = proj?.id ?? null;
      }

      // Resolve assignee if named
      let assigneeId: string | null = null;
      if (input.assigneeName) {
        const [member] = await db
          .select({ id: schema.teamMembers.id })
          .from(schema.teamMembers)
          .where(ilike(schema.teamMembers.name, `%${input.assigneeName}%`))
          .limit(1);
        assigneeId = member?.id ?? null;
      }

      const dueDate = input.dueDateDays
        ? (() => { const d = new Date(); d.setDate(d.getDate() + (input.dueDateDays as number)); return d; })()
        : null;

      const [task] = await db
        .insert(schema.tasks)
        .values({
          title: input.title as string,
          description: (input.description as string) ?? null,
          status: "todo",
          priority: ((input.priority as string) || "medium") as "low" | "medium" | "high" | "urgent",
          projectId,
          assigneeId,
          dueDate,
          source: "manual",
        })
        .returning();

      // Optionally add to current sprint
      let addedToSprint = false;
      if (input.addToCurrentSprint) {
        const [sprint] = await db
          .select({ id: schema.weeklySprints.id })
          .from(schema.weeklySprints)
          .orderBy(desc(schema.weeklySprints.weekOf))
          .limit(1);

        if (sprint) {
          // Find or use the first section
          const sections = await db
            .select({ id: schema.sprintSections.id })
            .from(schema.sprintSections)
            .where(eq(schema.sprintSections.sprintId, sprint.id))
            .limit(1);

          const sectionId = sections[0]?.id ?? null;
          await db.insert(schema.taskSprintAssignments).values({
            taskId: task.id,
            sprintId: sprint.id,
            sectionId,
          }).onConflictDoNothing();
          addedToSprint = true;
        }
      }

      return JSON.stringify({
        created: true,
        taskId: task.id,
        title: task.title,
        priority: task.priority,
        projectId,
        assigneeId,
        addedToSprint,
      });
    }

    case "add_task_to_sprint": {
      // Find task
      let taskId: string | undefined;
      let taskTitle = "Unknown";
      if (input.taskId) {
        taskId = input.taskId as string;
        const [t] = await db.select({ title: schema.tasks.title }).from(schema.tasks).where(eq(schema.tasks.id, taskId)).limit(1);
        taskTitle = t?.title ?? taskId;
      } else if (input.taskTitle) {
        const [t] = await db
          .select({ id: schema.tasks.id, title: schema.tasks.title })
          .from(schema.tasks)
          .where(ilike(schema.tasks.title, `%${input.taskTitle}%`))
          .orderBy(desc(schema.tasks.updatedAt))
          .limit(1);
        if (!t) return JSON.stringify({ error: `No task matching "${input.taskTitle}"` });
        taskId = t.id;
        taskTitle = t.title;
      } else {
        return JSON.stringify({ error: "Provide taskTitle or taskId." });
      }

      const [sprint] = await db
        .select({ id: schema.weeklySprints.id, title: schema.weeklySprints.title })
        .from(schema.weeklySprints)
        .orderBy(desc(schema.weeklySprints.weekOf))
        .limit(1);
      if (!sprint) return JSON.stringify({ error: "No sprint found." });

      // Find matching section
      let sectionId: string | null = null;
      if (input.sectionProjectName) {
        const [sec] = await db
          .select({ id: schema.sprintSections.id })
          .from(schema.sprintSections)
          .where(and(
            eq(schema.sprintSections.sprintId, sprint.id),
            ilike(schema.sprintSections.projectName, `%${input.sectionProjectName}%`)
          ))
          .limit(1);
        sectionId = sec?.id ?? null;
      }
      if (!sectionId) {
        const [first] = await db
          .select({ id: schema.sprintSections.id })
          .from(schema.sprintSections)
          .where(eq(schema.sprintSections.sprintId, sprint.id))
          .limit(1);
        sectionId = first?.id ?? null;
      }

      await db.insert(schema.taskSprintAssignments).values({
        taskId: taskId!,
        sprintId: sprint.id,
        sectionId,
      }).onConflictDoNothing();

      return JSON.stringify({ added: true, taskTitle, sprintTitle: sprint.title, sectionId });
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
        .set({ status: input.status as "on_track" | "at_risk" | "off_track" | "done" })
        .where(eq(schema.rocks.id, rock.id));
      return JSON.stringify({ updated: true, rockId: rock.id, title: rock.title, newStatus: input.status });
    }

    case "update_scorecard_entry": {
      // Find metric by name
      const [metric] = await db
        .select({ id: schema.scorecardMetrics.id, name: schema.scorecardMetrics.name, unit: schema.scorecardMetrics.unit })
        .from(schema.scorecardMetrics)
        .where(and(ilike(schema.scorecardMetrics.name, `%${input.metricName}%`), eq(schema.scorecardMetrics.isActive, true)))
        .limit(1);

      if (!metric) return JSON.stringify({ error: `No active scorecard metric matching "${input.metricName}". Check /scorecard for metric names.` });

      // Compute week start (Monday)
      const now = new Date();
      const dayOfWeek = now.getDay(); // 0=Sun, 1=Mon...
      const daysToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
      const weekStart = new Date(now);
      weekStart.setDate(now.getDate() + daysToMonday - ((input.weekOffset as number || 0) * 7));
      weekStart.setHours(0, 0, 0, 0);

      await db
        .insert(schema.scorecardEntries)
        .values({
          metricId: metric.id,
          weekStart,
          value: String(input.value),
          notes: (input.notes as string) ?? null,
        })
        .onConflictDoUpdate({
          target: [schema.scorecardEntries.metricId, schema.scorecardEntries.weekStart],
          set: {
            value: String(input.value),
            notes: (input.notes as string) ?? null,
          },
        });

      return JSON.stringify({
        updated: true,
        metric: metric.name,
        value: input.value,
        unit: metric.unit,
        weekOf: weekStart.toISOString().split("T")[0],
      });
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

    default:
      return undefined;
  }
}
