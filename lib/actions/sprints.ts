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
