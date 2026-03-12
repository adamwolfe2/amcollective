"use server";

import { auth } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import * as teamRepo from "@/lib/db/repositories/team";

const createMemberSchema = z.object({
  name: z.string().min(1, "Name is required"),
  email: z.string().email("Invalid email"),
  role: z.enum(["owner", "admin", "member"]).optional(),
  title: z.string().optional(),
});

const updateMemberSchema = createMemberSchema.partial();

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

export async function getTeam(): Promise<ActionResult> {
  const userId = await getUserId();
  if (!userId) return { success: false, error: "Unauthorized" };

  const data = await teamRepo.getTeam();
  return { success: true, data };
}

export async function getTeamMember(id: string): Promise<ActionResult> {
  const userId = await getUserId();
  if (!userId) return { success: false, error: "Unauthorized" };

  const data = await teamRepo.getTeamMember(id);
  if (!data) return { success: false, error: "Member not found" };
  return { success: true, data };
}

export async function inviteMember(
  formData: z.infer<typeof createMemberSchema>
): Promise<ActionResult> {
  const userId = await getUserId();
  if (!userId) return { success: false, error: "Unauthorized" };

  const parsed = createMemberSchema.safeParse(formData);
  if (!parsed.success) {
    return { success: false, error: parsed.error.errors[0]?.message };
  }

  const member = await teamRepo.createTeamMember(
    {
      name: parsed.data.name,
      email: parsed.data.email,
      role: parsed.data.role ?? "member",
      title: parsed.data.title || null,
    },
    userId
  );

  revalidatePath("/team");
  return { success: true, data: member };
}

export async function updateMember(
  id: string,
  formData: z.infer<typeof updateMemberSchema>
): Promise<ActionResult> {
  const userId = await getUserId();
  if (!userId) return { success: false, error: "Unauthorized" };

  const parsed = updateMemberSchema.safeParse(formData);
  if (!parsed.success) {
    return { success: false, error: parsed.error.errors[0]?.message };
  }

  const member = await teamRepo.updateTeamMember(id, parsed.data, userId);
  if (!member) return { success: false, error: "Member not found" };

  revalidatePath("/team");
  revalidatePath(`/team/${id}`);
  return { success: true, data: member };
}

export async function removeMember(id: string): Promise<ActionResult> {
  const userId = await getUserId();
  if (!userId) return { success: false, error: "Unauthorized" };

  await teamRepo.removeTeamMember(id, userId);
  revalidatePath("/team");
  return { success: true };
}
