"use server";

import { auth } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { tasks } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import type { SubtaskItem } from "@/lib/db/schema";

type ActionResult<T = unknown> = {
  success: boolean;
  data?: T;
  error?: string;
};

async function getUserId() {
  const { userId } = await auth();
  if (!userId) {
    if (process.env.NODE_ENV === "development") return "dev-admin";
    throw new Error("Not authenticated");
  }
  return userId;
}

/**
 * Update the subtasks JSONB array for a task.
 * Called from TaskRow's debounced subtask editor.
 */
export async function updateSubtasks(
  taskId: string,
  sprintId: string,
  subtasks: SubtaskItem[]
): Promise<ActionResult> {
  const userId = await getUserId();
  if (!userId) return { success: false, error: "Unauthorized" };

  try {
    await db
      .update(tasks)
      .set({ subtasks })
      .where(eq(tasks.id, taskId));

    revalidatePath(`/sprints/${sprintId}`);
    return { success: true };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Failed" };
  }
}
