"use server";

import { randomUUID } from "crypto";
import { revalidatePath } from "next/cache";
import { requireAuth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { db } from "@/lib/db";
import {
  weeklySprints,
  sprintSections,
  tasks,
  taskSprintAssignments,
  portfolioProjects,
  teamMembers,
} from "@/lib/db/schema";
import { eq, isNull, and } from "drizzle-orm";
import { getAnthropicClient, MODEL_HAIKU, trackAIUsage } from "@/lib/ai/client";
import { inngest } from "@/lib/inngest/client";
import { createAuditLog } from "@/lib/db/repositories/audit";

type ActionResult<T = unknown> = {
  success: boolean;
  data?: T;
  error?: string;
};


// ─── Sprint CRUD ──────────────────────────────────────────────────────────────

export async function createSprint(formData: FormData): Promise<void> {
  const userId = await requireAuth();
  if (!userId) redirect("/sign-in");

  const title = (formData.get("title") as string) || getDefaultTitle();
  const weeklyFocus = (formData.get("weeklyFocus") as string) || "";
  const weekOfStr = formData.get("weekOf") as string;
  const weekOf = weekOfStr ? new Date(weekOfStr) : getMondayOfCurrentWeek();

  const [sprint] = await db
    .insert(weeklySprints)
    .values({ title, weeklyFocus: weeklyFocus || null, weekOf })
    .returning({ id: weeklySprints.id });

  after(async () => {
    await createAuditLog({
      actorId: userId,
      actorType: "user",
      action: "create",
      entityType: "sprint",
      entityId: sprint.id,
      metadata: { title, weekOf: weekOf.toISOString() },
    });
  });

  redirect(`/sprints/${sprint.id}`);
}

export async function toggleSprintShare(
  id: string,
  currentToken: string | null
): Promise<ActionResult<{ shareToken: string | null }>> {
  const userId = await requireAuth();
  if (!userId) return { success: false, error: "Unauthorized" };

  try {
    const newToken = currentToken ? null : randomUUID();

    await db
      .update(weeklySprints)
      .set({ shareToken: newToken })
      .where(eq(weeklySprints.id, id));

    revalidatePath(`/sprints/${id}`);
    return { success: true, data: { shareToken: newToken } };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Failed" };
  }
}

export async function deleteSprint(id: string): Promise<ActionResult> {
  const userId = await requireAuth();
  if (!userId) return { success: false, error: "Unauthorized" };

  try {
    await db.delete(weeklySprints).where(eq(weeklySprints.id, id));
    after(async () => {
      await createAuditLog({
        actorId: userId,
        actorType: "user",
        action: "delete",
        entityType: "sprint",
        entityId: id,
      });
    });
    revalidatePath("/sprints");
    return { success: true };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Failed" };
  }
}

export async function updateSprint(
  id: string,
  data: {
    title?: string;
    weeklyFocus?: string;
    topOfMind?: string;
  }
): Promise<ActionResult> {
  const userId = await requireAuth();
  if (!userId) return { success: false, error: "Unauthorized" };

  try {
    await db
      .update(weeklySprints)
      .set({
        ...(data.title !== undefined && { title: data.title }),
        ...(data.weeklyFocus !== undefined && {
          weeklyFocus: data.weeklyFocus || null,
        }),
        ...(data.topOfMind !== undefined && {
          topOfMind: data.topOfMind || null,
        }),
      })
      .where(eq(weeklySprints.id, id));

    after(async () => {
      await createAuditLog({
        actorId: userId,
        actorType: "user",
        action: "update",
        entityType: "sprint",
        entityId: id,
        metadata: { fields: Object.keys(data) },
      });
    });

    revalidatePath(`/sprints/${id}`);
    revalidatePath("/sprints");
    return { success: true };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Failed" };
  }
}

export async function closeSprint(id: string): Promise<ActionResult> {
  const userId = await requireAuth();
  if (!userId) return { success: false, error: "Unauthorized" };

  try {
    await db
      .update(weeklySprints)
      .set({ closedAt: new Date() })
      .where(eq(weeklySprints.id, id));

    await inngest.send({
      name: "sprint/snapshot.requested",
      data: { sprintId: id },
    });

    after(async () => {
      await createAuditLog({
        actorId: userId,
        actorType: "user",
        action: "close",
        entityType: "sprint",
        entityId: id,
      });
    });

    revalidatePath(`/sprints/${id}`);
    return { success: true };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Failed" };
  }
}

// ─── Section CRUD ─────────────────────────────────────────────────────────────

/** Fuzzy-resolve a project name to its DB id. Case-insensitive, partial match. */
async function resolveProjectId(name: string): Promise<string | null> {
  if (!name) return null;
  const rows = await db
    .select({ id: portfolioProjects.id, name: portfolioProjects.name })
    .from(portfolioProjects);
  const lower = name.toLowerCase();
  const match = rows.find(
    (r) =>
      r.name.toLowerCase() === lower ||
      r.name.toLowerCase().includes(lower) ||
      lower.includes(r.name.toLowerCase())
  );
  return match?.id ?? null;
}

/** Fuzzy-resolve an assignee name to their teamMembers id. */
async function resolveAssigneeId(name: string): Promise<string | null> {
  if (!name) return null;
  const rows = await db
    .select({ id: teamMembers.id, name: teamMembers.name })
    .from(teamMembers);
  const lower = name.toLowerCase();
  const match = rows.find(
    (r) =>
      r.name.toLowerCase() === lower ||
      r.name.toLowerCase().startsWith(lower) ||
      lower.startsWith(r.name.toLowerCase().split(" ")[0])
  );
  return match?.id ?? null;
}

export async function createSection(
  sprintId: string,
  data: {
    projectName: string;
    projectId?: string | null;
    assigneeName?: string | null;
    assigneeId?: string | null;
    goal?: string | null;
    sortOrder?: number;
  }
): Promise<ActionResult<{ id: string }>> {
  const userId = await requireAuth();
  if (!userId) return { success: false, error: "Unauthorized" };

  try {
    const projectId =
      data.projectId ?? (await resolveProjectId(data.projectName));
    const assigneeId =
      data.assigneeId ??
      (data.assigneeName ? await resolveAssigneeId(data.assigneeName) : null);

    const [section] = await db
      .insert(sprintSections)
      .values({
        sprintId,
        projectName: data.projectName,
        projectId,
        assigneeName: data.assigneeName || null,
        assigneeId,
        goal: data.goal || null,
        sortOrder: data.sortOrder ?? 0,
      })
      .returning({ id: sprintSections.id });

    after(async () => {
      await createAuditLog({
        actorId: userId,
        actorType: "user",
        action: "create",
        entityType: "sprint_section",
        entityId: section.id,
        metadata: { sprintId, projectName: data.projectName },
      });
    });

    revalidatePath(`/sprints/${sprintId}`);
    return { success: true, data: { id: section.id } };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Failed" };
  }
}

export async function updateSection(
  id: string,
  sprintId: string,
  data: {
    projectName?: string;
    assigneeName?: string | null;
    goal?: string | null;
  }
): Promise<ActionResult> {
  const userId = await requireAuth();
  if (!userId) return { success: false, error: "Unauthorized" };

  try {
    const projectId =
      data.projectName !== undefined
        ? await resolveProjectId(data.projectName)
        : undefined;
    const assigneeId =
      data.assigneeName !== undefined
        ? data.assigneeName
          ? await resolveAssigneeId(data.assigneeName)
          : null
        : undefined;

    await db
      .update(sprintSections)
      .set({
        ...(data.projectName !== undefined && { projectName: data.projectName }),
        ...(projectId !== undefined && { projectId }),
        ...(data.assigneeName !== undefined && { assigneeName: data.assigneeName }),
        ...(assigneeId !== undefined && { assigneeId }),
        ...(data.goal !== undefined && { goal: data.goal }),
      })
      .where(eq(sprintSections.id, id));

    after(async () => {
      await createAuditLog({
        actorId: userId,
        actorType: "user",
        action: "update",
        entityType: "sprint_section",
        entityId: id,
        metadata: { sprintId, fields: Object.keys(data) },
      });
    });

    revalidatePath(`/sprints/${sprintId}`);
    return { success: true };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Failed" };
  }
}

export async function deleteSection(
  id: string,
  sprintId: string
): Promise<ActionResult> {
  const userId = await requireAuth();
  if (!userId) return { success: false, error: "Unauthorized" };

  try {
    await db.delete(sprintSections).where(eq(sprintSections.id, id));
    after(async () => {
      await createAuditLog({
        actorId: userId,
        actorType: "user",
        action: "delete",
        entityType: "sprint_section",
        entityId: id,
        metadata: { sprintId },
      });
    });
    revalidatePath(`/sprints/${sprintId}`);
    return { success: true };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Failed" };
  }
}

// ─── Task CRUD ────────────────────────────────────────────────────────────────

export async function createTask(
  sectionId: string,
  sprintId: string,
  content: string,
  sortOrder = 0
): Promise<ActionResult<{ id: string }>> {
  const userId = await requireAuth();
  if (!userId) return { success: false, error: "Unauthorized" };

  try {
    // Resolve projectId and assigneeId from section
    const [section] = await db
      .select({
        projectId: sprintSections.projectId,
        assigneeId: sprintSections.assigneeId,
      })
      .from(sprintSections)
      .where(eq(sprintSections.id, sectionId));

    // Insert canonical task
    const [task] = await db
      .insert(tasks)
      .values({
        title: content,
        status: "todo",
        source: "sprint",
        projectId: section?.projectId ?? null,
        assigneeId: section?.assigneeId ?? null,
        position: sortOrder,
        subtasks: [],
      })
      .returning({ id: tasks.id });

    // Link task to sprint+section
    await db.insert(taskSprintAssignments).values({
      taskId: task.id,
      sprintId,
      sectionId,
      sortOrder,
    });

    // Trigger metrics sync
    await inngest.send({
      name: "sprint/task.changed",
      data: { taskId: task.id, sprintId },
    });

    after(async () => {
      await createAuditLog({
        actorId: userId,
        actorType: "user",
        action: "create",
        entityType: "task",
        entityId: task.id,
        metadata: { sprintId, sectionId, content },
      });
    });

    revalidatePath(`/sprints/${sprintId}`);
    return { success: true, data: { id: task.id } };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Failed" };
  }
}

export async function toggleTask(
  id: string,
  sprintId: string,
  isCompleted: boolean
): Promise<ActionResult> {
  const userId = await requireAuth();
  if (!userId) return { success: false, error: "Unauthorized" };

  try {
    await db
      .update(tasks)
      .set({
        status: isCompleted ? "done" : "todo",
        completedAt: isCompleted ? new Date() : null,
      })
      .where(eq(tasks.id, id));

    await inngest.send({
      name: "sprint/task.changed",
      data: { taskId: id, sprintId },
    });

    after(async () => {
      await createAuditLog({
        actorId: userId,
        actorType: "user",
        action: isCompleted ? "complete" : "reopen",
        entityType: "task",
        entityId: id,
        metadata: { sprintId },
      });
    });

    revalidatePath(`/sprints/${sprintId}`);
    revalidatePath("/dashboard");
    return { success: true };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Failed" };
  }
}

export async function updateTask(
  id: string,
  sprintId: string,
  content: string
): Promise<ActionResult> {
  const userId = await requireAuth();
  if (!userId) return { success: false, error: "Unauthorized" };

  try {
    await db
      .update(tasks)
      .set({ title: content })
      .where(eq(tasks.id, id));

    after(async () => {
      await createAuditLog({
        actorId: userId,
        actorType: "user",
        action: "update",
        entityType: "task",
        entityId: id,
        metadata: { sprintId, content },
      });
    });

    revalidatePath(`/sprints/${sprintId}`);
    return { success: true };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Failed" };
  }
}

export async function deleteTask(
  id: string,
  sprintId: string
): Promise<ActionResult> {
  const userId = await requireAuth();
  if (!userId) return { success: false, error: "Unauthorized" };

  try {
    // Soft-delete: mark assignment as removed
    await db
      .update(taskSprintAssignments)
      .set({ removedAt: new Date() })
      .where(
        and(
          eq(taskSprintAssignments.taskId, id),
          eq(taskSprintAssignments.sprintId, sprintId)
        )
      );

    // Check if any active assignments remain; if not, archive the task
    const remaining = await db
      .select({ taskId: taskSprintAssignments.taskId })
      .from(taskSprintAssignments)
      .where(
        and(
          eq(taskSprintAssignments.taskId, id),
          isNull(taskSprintAssignments.removedAt)
        )
      );

    if (remaining.length === 0) {
      await db
        .update(tasks)
        .set({ isArchived: true })
        .where(eq(tasks.id, id));
    }

    after(async () => {
      await createAuditLog({
        actorId: userId,
        actorType: "user",
        action: "delete",
        entityType: "task",
        entityId: id,
        metadata: { sprintId },
      });
    });

    revalidatePath(`/sprints/${sprintId}`);
    return { success: true };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Failed" };
  }
}

// ─── AI Parse ─────────────────────────────────────────────────────────────────

export type ParsedSprintSection = {
  projectName: string;
  goal: string | null;
  assigneeName?: string | null;
  tasks: string[];
};

export async function parseSprintText(
  rawText: string,
  knownProjects: string[],
  knownTeamMembers: string[]
): Promise<ActionResult<ParsedSprintSection[]>> {
  const userId = await requireAuth();
  if (!userId) return { success: false, error: "Unauthorized" };

  const ai = getAnthropicClient();
  if (!ai) {
    const tasks = rawText
      .split("\n")
      .map((l) => l.replace(/^[-•*]\s*/, "").trim())
      .filter(Boolean);
    return {
      success: true,
      data: [{ projectName: "General", goal: null, tasks }],
    };
  }

  const systemPrompt = `You are a sprint planning assistant for AM Collective, an agency. Parse raw notes into a structured sprint plan.

Known projects/clients: ${knownProjects.length ? knownProjects.join(", ") : "none listed yet"}
Team members: ${knownTeamMembers.length ? knownTeamMembers.join(", ") : "Adam, Maggie"}

CRITICAL RULES — follow exactly:
1. EACH task must be its own separate string in the tasks array. NEVER combine multiple tasks into one string.
2. A task starts with "- ", "• ", a number like "1.", or was preceded by "[ ]" or "[x]". Split them ALL into individual items.
3. Group tasks by project/client. Look for section headers (standalone line before tasks), @mentions like "@adam" or "— @maggie", or context clues.
4. Detect assignee from @mentions near the project header (e.g. "Trackr — @adam" → assigneeName: "adam", then match to full name from team members list).
5. Extract one short goal per section if mentioned (e.g. "goal: ...", or a line describing the objective).
6. Keep task descriptions concise, imperative form ("Fix webhook bug" not "I need to fix the webhook bug").
7. Strip checkbox markers [ ], [x], -, •, numbers from task text — just the task content.
8. Tasks with no clear project attribution go into a section named "AM Collective".
9. Do NOT invent tasks. Only use what's in the text.
10. Return ONLY valid JSON — no markdown fences, no explanation.
11. CRITICAL: Every string value must be on a single line. Never use literal newlines or line breaks inside JSON string values.`;

  const userPrompt = `Parse these notes. Remember: every individual task must be its own array element — never combine tasks.

${rawText}

Return JSON:
{
  "sections": [
    {
      "projectName": "string",
      "goal": "string or null",
      "assigneeName": "first name only, or null if not mentioned",
      "tasks": ["task 1", "task 2", "task 3"]
    }
  ]
}`;

  try {
    const response = await ai.messages.create({
      model: MODEL_HAIKU,
      max_tokens: 4096,
      messages: [{ role: "user", content: userPrompt }],
      system: systemPrompt,
    });

    await trackAIUsage({
      model: MODEL_HAIKU,
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
      agent: "sprint-parse",
    });

    const rawJson =
      response.content[0].type === "text" ? response.content[0].text : "";

    const jsonMatch = rawJson.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("No JSON in response");

    const repaired = jsonMatch[0].replace(
      /"((?:[^"\\]|\\.)*)"/g,
      (_, content: string) =>
        `"${content.replace(/[\r\n\t]+/g, " ").replace(/ {2,}/g, " ").trim()}"`
    );

    const parsed = JSON.parse(repaired);
    const sections: ParsedSprintSection[] = (parsed.sections ?? []).map(
      (s: {
        projectName?: string;
        goal?: string | null;
        assigneeName?: string | null;
        tasks?: string[];
      }) => {
        const rawAssignee = s.assigneeName
          ? String(s.assigneeName).toLowerCase()
          : null;
        const matchedAssignee = rawAssignee
          ? knownTeamMembers.find(
              (m) =>
                m.toLowerCase().startsWith(rawAssignee) ||
                rawAssignee.startsWith(m.toLowerCase().split(" ")[0])
            ) ?? null
          : null;

        return {
          projectName: String(s.projectName ?? "General"),
          goal: s.goal ? String(s.goal) : null,
          assigneeName: matchedAssignee,
          tasks: Array.isArray(s.tasks)
            ? s.tasks.map(String).filter(Boolean)
            : [],
        };
      }
    );

    return { success: true, data: sections };
  } catch (e) {
    return {
      success: false,
      error: e instanceof Error ? e.message : "Parse failed",
    };
  }
}

export async function importParsedSections(
  sprintId: string,
  sections: Array<{
    projectName: string;
    goal: string | null;
    assigneeName: string | null;
    tasks: string[];
  }>,
  startSortOrder: number
): Promise<ActionResult> {
  const userId = await requireAuth();
  if (!userId) return { success: false, error: "Unauthorized" };

  try {
    const [allProjects, allMembers] = await Promise.all([
      db
        .select({ id: portfolioProjects.id, name: portfolioProjects.name })
        .from(portfolioProjects),
      db
        .select({ id: teamMembers.id, name: teamMembers.name })
        .from(teamMembers),
    ]);

    function matchProject(name: string): string | null {
      const lower = name.toLowerCase();
      return (
        allProjects.find(
          (p) =>
            p.name.toLowerCase() === lower ||
            p.name.toLowerCase().includes(lower) ||
            lower.includes(p.name.toLowerCase())
        )?.id ?? null
      );
    }

    function matchMember(name: string | null): string | null {
      if (!name) return null;
      const lower = name.toLowerCase();
      return (
        allMembers.find(
          (m) =>
            m.name.toLowerCase() === lower ||
            m.name.toLowerCase().startsWith(lower) ||
            lower.startsWith(m.name.toLowerCase().split(" ")[0])
        )?.id ?? null
      );
    }

    // Resolve all project/assignee IDs upfront — no per-row queries
    const resolved = sections.map((sec, i) => ({
      sec,
      index: i,
      projectId: matchProject(sec.projectName),
      assigneeId: matchMember(sec.assigneeName),
    }));

    // Batch insert all sections in one round-trip
    const insertedSections = await db
      .insert(sprintSections)
      .values(
        resolved.map(({ sec, index, projectId, assigneeId }) => ({
          sprintId,
          projectName: sec.projectName,
          projectId,
          assigneeName: sec.assigneeName || null,
          assigneeId,
          goal: sec.goal || null,
          sortOrder: startSortOrder + index,
        }))
      )
      .returning({ id: sprintSections.id });

    // Build all task rows, tracking which section index each task belongs to
    type TaskMeta = { sectionIdx: number; sortOrder: number };
    const taskMeta: TaskMeta[] = [];
    const taskValues: {
      title: string;
      status: "todo";
      source: "sprint";
      projectId: string | null;
      assigneeId: string | null;
      position: number;
      subtasks: never[];
    }[] = [];

    for (let i = 0; i < resolved.length; i++) {
      const { sec, projectId, assigneeId } = resolved[i];
      for (let j = 0; j < sec.tasks.length; j++) {
        taskValues.push({
          title: sec.tasks[j],
          status: "todo",
          source: "sprint",
          projectId,
          assigneeId,
          position: j,
          subtasks: [],
        });
        taskMeta.push({ sectionIdx: i, sortOrder: j });
      }
    }

    if (taskValues.length > 0) {
      // Batch insert all tasks in one round-trip
      const insertedTasks = await db
        .insert(tasks)
        .values(taskValues)
        .returning({ id: tasks.id });

      // Batch insert all task-sprint assignments in one round-trip
      await db.insert(taskSprintAssignments).values(
        insertedTasks.map((t, idx) => ({
          taskId: t.id,
          sprintId,
          sectionId: insertedSections[taskMeta[idx].sectionIdx].id,
          sortOrder: taskMeta[idx].sortOrder,
        }))
      );
    }

    after(async () => {
      await createAuditLog({
        actorId: userId,
        actorType: "user",
        action: "import",
        entityType: "sprint",
        entityId: sprintId,
        metadata: {
          sectionCount: sections.length,
          taskCount: taskValues.length,
        },
      });
    });

    revalidatePath(`/sprints/${sprintId}`);
    revalidatePath("/dashboard");
    return { success: true };
  } catch (e) {
    return {
      success: false,
      error: e instanceof Error ? e.message : "Import failed",
    };
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getMondayOfCurrentWeek(): Date {
  const d = new Date();
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  return new Date(d.setDate(diff));
}

function getDefaultTitle(): string {
  const monday = getMondayOfCurrentWeek();
  return `${monday.getMonth() + 1}/${monday.getDate()} Week Sprint`;
}
