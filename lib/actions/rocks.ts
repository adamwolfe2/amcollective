"use server";

import { auth } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import * as rocksRepo from "@/lib/db/repositories/rocks";

const createRockSchema = z.object({
  title: z.string().min(1, "Title is required"),
  description: z.string().optional(),
  ownerId: z.string().uuid().optional(),
  projectId: z.string().uuid().optional(),
  quarter: z.string().min(1),
  dueDate: z.string().optional(),
});

const updateRockSchema = z.object({
  title: z.string().optional(),
  description: z.string().optional(),
  status: z.enum(["on_track", "at_risk", "off_track", "done"]).optional(),
  progress: z.number().int().min(0).max(100).optional(),
  ownerId: z.string().uuid().optional(),
  dueDate: z.string().optional(),
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

export async function getRocks(filters?: {
  quarter?: string;
  ownerId?: string;
  status?: string;
}): Promise<ActionResult> {
  const userId = await getUserId();
  if (!userId) return { success: false, error: "Unauthorized" };

  const data = await rocksRepo.getRocks(filters);
  return { success: true, data };
}

export async function createRock(
  formData: z.infer<typeof createRockSchema>
): Promise<ActionResult> {
  const userId = await getUserId();
  if (!userId) return { success: false, error: "Unauthorized" };

  const parsed = createRockSchema.safeParse(formData);
  if (!parsed.success) {
    return { success: false, error: parsed.error.errors[0]?.message };
  }

  const rock = await rocksRepo.createRock(
    {
      ...parsed.data,
      dueDate: parsed.data.dueDate ? new Date(parsed.data.dueDate) : undefined,
    },
    userId
  );

  revalidatePath("/rocks");
  return { success: true, data: rock };
}

export async function updateRock(
  id: string,
  formData: z.infer<typeof updateRockSchema>
): Promise<ActionResult> {
  const userId = await getUserId();
  if (!userId) return { success: false, error: "Unauthorized" };

  const parsed = updateRockSchema.safeParse(formData);
  if (!parsed.success) {
    return { success: false, error: parsed.error.errors[0]?.message };
  }

  const updateData = {
    ...parsed.data,
    dueDate: parsed.data.dueDate ? new Date(parsed.data.dueDate) : undefined,
  };

  const rock = await rocksRepo.updateRock(id, updateData, userId);
  if (!rock) return { success: false, error: "Rock not found" };

  revalidatePath("/rocks");
  return { success: true, data: rock };
}
