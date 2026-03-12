"use server";

import { auth } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import * as scorecardRepo from "@/lib/db/repositories/scorecard";

const createMetricSchema = z.object({
  name: z.string().min(1, "Name is required"),
  description: z.string().optional(),
  ownerId: z.string().uuid().optional(),
  targetValue: z.string().optional(),
  targetDirection: z.enum(["above", "below", "exact"]).optional(),
  unit: z.string().optional(),
  displayOrder: z.number().int().optional(),
});

const recordValueSchema = z.object({
  metricId: z.string().uuid(),
  weekStart: z.string(),
  value: z.string(),
  notes: z.string().optional(),
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

export async function createMetric(
  formData: z.infer<typeof createMetricSchema>
): Promise<ActionResult> {
  const userId = await getUserId();
  if (!userId) return { success: false, error: "Unauthorized" };

  const parsed = createMetricSchema.safeParse(formData);
  if (!parsed.success) {
    return { success: false, error: parsed.error.errors[0]?.message };
  }

  const metric = await scorecardRepo.createMetric(parsed.data, userId);
  revalidatePath("/scorecard");
  return { success: true, data: metric };
}

export async function recordValue(
  formData: z.infer<typeof recordValueSchema>
): Promise<ActionResult> {
  const userId = await getUserId();
  if (!userId) return { success: false, error: "Unauthorized" };

  const parsed = recordValueSchema.safeParse(formData);
  if (!parsed.success) {
    return { success: false, error: parsed.error.errors[0]?.message };
  }

  const entry = await scorecardRepo.upsertEntry(
    {
      ...parsed.data,
      weekStart: new Date(parsed.data.weekStart),
    },
    userId
  );

  revalidatePath("/scorecard");
  return { success: true, data: entry };
}
