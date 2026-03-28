"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { randomBytes } from "crypto";
import { z } from "zod";
import * as teamRepo from "@/lib/db/repositories/team";
import { requireAuth } from "@/lib/auth";
import { sendTeamInviteEmail } from "@/lib/email/team";
import { getSiteUrl } from "@/lib/get-site-url";

const createMemberSchema = z.object({
  name: z.string().min(1, "Name is required"),
  email: z.string().email("Invalid email"),
  role: z.enum(["owner", "admin", "member"]).optional(),
  title: z.string().optional(),
});

const updateMemberSchema = createMemberSchema.partial();

const inviteSchema = z.object({
  email: z.string().email("Invalid email"),
  role: z.enum(["admin", "member"]).default("member"),
});

type ActionResult<T = unknown> = {
  success: boolean;
  data?: T;
  error?: string;
};


export async function getTeam(): Promise<ActionResult> {
  const userId = await requireAuth();
  if (!userId) return { success: false, error: "Unauthorized" };

  const data = await teamRepo.getTeam();
  return { success: true, data };
}

export async function getTeamMember(id: string): Promise<ActionResult> {
  const userId = await requireAuth();
  if (!userId) return { success: false, error: "Unauthorized" };

  const data = await teamRepo.getTeamMember(id);
  if (!data) return { success: false, error: "Member not found" };
  return { success: true, data };
}

export async function inviteMember(
  formData: z.infer<typeof createMemberSchema>
): Promise<ActionResult> {
  const userId = await requireAuth();
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
  const userId = await requireAuth();
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
  const userId = await requireAuth();
  if (!userId) return { success: false, error: "Unauthorized" };

  await teamRepo.removeTeamMember(id, userId);
  revalidatePath("/settings/team");
  return { success: true };
}

export async function getPendingInvitations(): Promise<ActionResult> {
  const userId = await requireAuth();
  if (!userId) return { success: false, error: "Unauthorized" };

  const data = await teamRepo.getPendingInvitations();
  return { success: true, data };
}

export async function sendInvitation(
  formData: z.infer<typeof inviteSchema>
): Promise<ActionResult> {
  const userId = await requireAuth();
  if (!userId) return { success: false, error: "Unauthorized" };

  const parsed = inviteSchema.safeParse(formData);
  if (!parsed.success) {
    return { success: false, error: parsed.error.errors[0]?.message };
  }

  const { email, role } = parsed.data;
  const token = randomBytes(32).toString("hex");
  const appUrl = getSiteUrl();
  const inviteUrl = `${appUrl}/accept-invite?token=${token}`;

  const invitation = await teamRepo.createInvitation(
    { email, role, token, invitedById: userId },
    userId
  );

  after(async () => {
    await sendTeamInviteEmail({ inviteeEmail: email, role, inviteUrl });
  });

  revalidatePath("/settings/team");
  return { success: true, data: invitation };
}

export async function resendInvitation(id: string): Promise<ActionResult> {
  const userId = await requireAuth();
  if (!userId) return { success: false, error: "Unauthorized" };

  const invitation = await teamRepo.getInvitationByToken(id);
  if (!invitation) {
    // id may be the invitation id, not token — fetch by id via raw query
    return { success: false, error: "Invitation not found" };
  }

  const appUrl = getSiteUrl();
  const inviteUrl = `${appUrl}/accept-invite?token=${invitation.token}`;

  after(async () => {
    await sendTeamInviteEmail({
      inviteeEmail: invitation.email,
      role: invitation.role,
      inviteUrl,
    });
  });

  return { success: true };
}

export async function resendInvitationById(invitationId: string): Promise<ActionResult> {
  const userId = await requireAuth();
  if (!userId) return { success: false, error: "Unauthorized" };

  const { db } = await import("@/lib/db");
  const { teamInvitations } = await import("@/lib/db/schema");
  const { eq } = await import("drizzle-orm");

  const result = await db
    .select()
    .from(teamInvitations)
    .where(eq(teamInvitations.id, invitationId));

  const invitation = result[0];
  if (!invitation) return { success: false, error: "Invitation not found" };

  const appUrl = getSiteUrl();
  const inviteUrl = `${appUrl}/accept-invite?token=${invitation.token}`;

  after(async () => {
    await sendTeamInviteEmail({
      inviteeEmail: invitation.email,
      role: invitation.role,
      inviteUrl,
    });
  });

  return { success: true };
}

export async function revokeInvitation(invitationId: string): Promise<ActionResult> {
  const userId = await requireAuth();
  if (!userId) return { success: false, error: "Unauthorized" };

  const invitation = await teamRepo.revokeInvitation(invitationId, userId);
  if (!invitation) return { success: false, error: "Invitation not found" };

  revalidatePath("/settings/team");
  return { success: true };
}
