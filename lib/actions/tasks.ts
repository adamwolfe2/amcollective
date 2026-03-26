"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { tasks } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import type { SubtaskItem } from "@/lib/db/schema";
import { requireAuth } from "@/lib/auth";

type ActionResult<T = unknown> = {
  success: boolean;
  data?: T;
  error?: string;
};


/**
 * Update the subtasks JSONB array for a task.
 * Called from TaskRow's debounced subtask editor.
 */
export async function updateSubtasks(
  taskId: string,
  sprintId: string,
  subtasks: SubtaskItem[]
): Promise<ActionResult> {
  const userId = await requireAuth();
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
