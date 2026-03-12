"use server";

import { auth } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import * as reportsRepo from "@/lib/db/repositories/reports";

const createReportSchema = z.object({
  authorId: z.string().uuid(),
  date: z.string(),
  tasksCompleted: z
    .array(z.object({ text: z.string(), projectId: z.string().optional() }))
    .optional(),
  blockers: z.string().optional(),
  tomorrowPlan: z.array(z.object({ text: z.string() })).optional(),
  needsEscalation: z.boolean().optional(),
  escalationNote: z.string().optional(),
});

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

export async function getReports(filters?: {
  authorId?: string;
  startDate?: string;
  endDate?: string;
}): Promise<ActionResult> {
  const userId = await getUserId();
  if (!userId) return { success: false, error: "Unauthorized" };

  const data = await reportsRepo.getReports({
    authorId: filters?.authorId,
    startDate: filters?.startDate ? new Date(filters.startDate) : undefined,
    endDate: filters?.endDate ? new Date(filters.endDate) : undefined,
  });
  return { success: true, data };
}

export async function createReport(
  formData: z.infer<typeof createReportSchema>
): Promise<ActionResult> {
  const userId = await getUserId();
  if (!userId) return { success: false, error: "Unauthorized" };

  const parsed = createReportSchema.safeParse(formData);
  if (!parsed.success) {
    return { success: false, error: parsed.error.errors[0]?.message };
  }

  const report = await reportsRepo.createReport(
    {
      ...parsed.data,
      date: new Date(parsed.data.date),
    },
    userId
  );

  revalidatePath("/activity");
  return { success: true, data: report };
}
