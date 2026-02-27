"use server";

import { auth } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import * as meetingsRepo from "@/lib/db/repositories/meetings";

const createMeetingSchema = z.object({
  title: z.string().optional(),
  scheduledAt: z.string().optional(),
});

const updateMeetingSchema = z.object({
  title: z.string().optional(),
  status: z.enum(["scheduled", "in_progress", "completed", "cancelled"]).optional(),
  notes: z.string().optional(),
  actionItems: z
    .array(
      z.object({
        text: z.string(),
        assigneeId: z.string().optional(),
        done: z.boolean(),
      })
    )
    .optional(),
  rating: z.number().int().min(1).max(10).optional(),
});

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

export async function createMeeting(
  formData: z.infer<typeof createMeetingSchema>
): Promise<ActionResult> {
  const userId = await getUserId();
  if (!userId) return { success: false, error: "Unauthorized" };

  const parsed = createMeetingSchema.safeParse(formData);
  if (!parsed.success) {
    return { success: false, error: parsed.error.errors[0]?.message };
  }

  const meeting = await meetingsRepo.createMeeting(
    {
      title: parsed.data.title,
      scheduledAt: parsed.data.scheduledAt
        ? new Date(parsed.data.scheduledAt)
        : undefined,
    },
    userId
  );

  revalidatePath("/meetings");
  return { success: true, data: meeting };
}

export async function updateMeeting(
  id: string,
  formData: z.infer<typeof updateMeetingSchema>
): Promise<ActionResult> {
  const userId = await getUserId();
  if (!userId) return { success: false, error: "Unauthorized" };

  const parsed = updateMeetingSchema.safeParse(formData);
  if (!parsed.success) {
    return { success: false, error: parsed.error.errors[0]?.message };
  }

  const meeting = await meetingsRepo.updateMeeting(id, parsed.data, userId);
  if (!meeting) return { success: false, error: "Meeting not found" };

  revalidatePath("/meetings");
  revalidatePath(`/meetings/${id}`);
  return { success: true, data: meeting };
}
