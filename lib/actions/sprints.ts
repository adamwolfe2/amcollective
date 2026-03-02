"use server";

import { auth } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import {
  weeklySprints,
  sprintSections,
  sprintTasks,
} from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { getAnthropicClient, MODEL_HAIKU, trackAIUsage } from "@/lib/ai/client";

type ActionResult<T = unknown> = {
  success: boolean;
  data?: T;
  error?: string;
};

async function getUserId() {
  if (!process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY) return "dev-admin";
  const { userId } = await auth();
  return userId;
}

// ─── Sprint CRUD ──────────────────────────────────────────────────────────────

export async function createSprint(formData: FormData): Promise<void> {
  const userId = await getUserId();
  if (!userId) redirect("/sign-in");

  const title = (formData.get("title") as string) || getDefaultTitle();
  const weeklyFocus = (formData.get("weeklyFocus") as string) || "";
  const weekOfStr = formData.get("weekOf") as string;
  const weekOf = weekOfStr ? new Date(weekOfStr) : getMondayOfCurrentWeek();

  const [sprint] = await db
    .insert(weeklySprints)
    .values({ title, weeklyFocus: weeklyFocus || null, weekOf })
    .returning({ id: weeklySprints.id });

  redirect(`/sprints/${sprint.id}`);
}

export async function updateSprint(
  id: string,
  data: {
    title?: string;
    weeklyFocus?: string;
    topOfMind?: string;
  }
): Promise<ActionResult> {
  const userId = await getUserId();
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

    revalidatePath(`/sprints/${id}`);
    revalidatePath("/sprints");
    return { success: true };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Failed" };
  }
}

// ─── Section CRUD ─────────────────────────────────────────────────────────────

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
  const userId = await getUserId();
  if (!userId) return { success: false, error: "Unauthorized" };

  try {
    const [section] = await db
      .insert(sprintSections)
      .values({
        sprintId,
        projectName: data.projectName,
        projectId: data.projectId || null,
        assigneeName: data.assigneeName || null,
        assigneeId: data.assigneeId || null,
        goal: data.goal || null,
        sortOrder: data.sortOrder ?? 0,
      })
      .returning({ id: sprintSections.id });

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
  const userId = await getUserId();
  if (!userId) return { success: false, error: "Unauthorized" };

  try {
    await db
      .update(sprintSections)
      .set({
        ...(data.projectName !== undefined && {
          projectName: data.projectName,
        }),
        ...(data.assigneeName !== undefined && {
          assigneeName: data.assigneeName,
        }),
        ...(data.goal !== undefined && { goal: data.goal }),
      })
      .where(eq(sprintSections.id, id));

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
  const userId = await getUserId();
  if (!userId) return { success: false, error: "Unauthorized" };

  try {
    await db.delete(sprintSections).where(eq(sprintSections.id, id));
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
  const userId = await getUserId();
  if (!userId) return { success: false, error: "Unauthorized" };

  try {
    const [task] = await db
      .insert(sprintTasks)
      .values({ sectionId, content, sortOrder })
      .returning({ id: sprintTasks.id });

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
  const userId = await getUserId();
  if (!userId) return { success: false, error: "Unauthorized" };

  try {
    await db
      .update(sprintTasks)
      .set({ isCompleted })
      .where(eq(sprintTasks.id, id));

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
  const userId = await getUserId();
  if (!userId) return { success: false, error: "Unauthorized" };

  try {
    await db
      .update(sprintTasks)
      .set({ content })
      .where(eq(sprintTasks.id, id));

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
  const userId = await getUserId();
  if (!userId) return { success: false, error: "Unauthorized" };

  try {
    await db.delete(sprintTasks).where(eq(sprintTasks.id, id));
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
  tasks: string[];
};

export async function parseSprintText(
  rawText: string,
  knownProjects: string[],
  knownTeamMembers: string[]
): Promise<ActionResult<ParsedSprintSection[]>> {
  const userId = await getUserId();
  if (!userId) return { success: false, error: "Unauthorized" };

  const ai = getAnthropicClient();
  if (!ai) {
    // Fallback: treat each line as a task in a single "General" section
    const tasks = rawText
      .split("\n")
      .map((l) => l.replace(/^[-•*]\s*/, "").trim())
      .filter(Boolean);
    return {
      success: true,
      data: [{ projectName: "General", goal: null, tasks }],
    };
  }

  const systemPrompt = `You are a sprint planning assistant for AM Collective, an agency. Parse raw notes and extract a structured sprint plan.

Known projects/clients: ${knownProjects.length ? knownProjects.join(", ") : "none listed yet"}
Team members: ${knownTeamMembers.length ? knownTeamMembers.join(", ") : "Adam, Maggie"}

Rules:
- Group tasks by project/client. Look for @mentions, headers, bold text, or context clues.
- Match project names to the known projects list when possible (fuzzy match).
- Extract one goal/objective per section if the text mentions what needs to happen for that project this week.
- Keep task descriptions concise and in imperative form (e.g. "Update homepage copy", not "I need to update the homepage copy").
- Tasks with no clear project attribution go into a section called "AM Collective".
- Remove bullet symbols, dashes, numbers from task text.
- Do not invent tasks not in the text.
- Return valid JSON only — no markdown, no explanation.`;

  const userPrompt = `Parse these notes into sprint sections:

${rawText}

Return JSON with this exact shape:
{
  "sections": [
    {
      "projectName": "string",
      "goal": "string or null",
      "tasks": ["task 1", "task 2"]
    }
  ]
}`;

  try {
    const response = await ai.messages.create({
      model: MODEL_HAIKU,
      max_tokens: 1024,
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

    // Extract JSON from possible markdown fences
    const jsonMatch = rawJson.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("No JSON in response");

    const parsed = JSON.parse(jsonMatch[0]);
    const sections: ParsedSprintSection[] = (parsed.sections ?? []).map(
      (s: { projectName?: string; goal?: string | null; tasks?: string[] }) => ({
        projectName: String(s.projectName ?? "General"),
        goal: s.goal ? String(s.goal) : null,
        tasks: Array.isArray(s.tasks)
          ? s.tasks.map(String).filter(Boolean)
          : [],
      })
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
  const userId = await getUserId();
  if (!userId) return { success: false, error: "Unauthorized" };

  try {
    for (let i = 0; i < sections.length; i++) {
      const sec = sections[i];
      const [newSection] = await db
        .insert(sprintSections)
        .values({
          sprintId,
          projectName: sec.projectName,
          assigneeName: sec.assigneeName || null,
          goal: sec.goal || null,
          sortOrder: startSortOrder + i,
        })
        .returning({ id: sprintSections.id });

      if (sec.tasks.length > 0) {
        await db.insert(sprintTasks).values(
          sec.tasks.map((content, idx) => ({
            sectionId: newSection.id,
            content,
            sortOrder: idx,
          }))
        );
      }
    }

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
