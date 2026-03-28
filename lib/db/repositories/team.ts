import { db } from "@/lib/db";
import {
  teamMembers,
  teamAssignments,
  teamInvitations,
  portfolioProjects,
} from "@/lib/db/schema";
import { eq, desc, count, and, gt } from "drizzle-orm";
import { createAuditLog } from "./audit";

export type TeamMember = typeof teamMembers.$inferSelect;
export type NewTeamMember = typeof teamMembers.$inferInsert;

export async function getTeam() {
  return db.select().from(teamMembers).orderBy(desc(teamMembers.createdAt));
}

export async function getTeamCount() {
  const result = await db
    .select({ value: count() })
    .from(teamMembers)
    .where(eq(teamMembers.isActive, true));
  return result[0]?.value ?? 0;
}

export async function getTeamMember(id: string) {
  const result = await db
    .select()
    .from(teamMembers)
    .where(eq(teamMembers.id, id));
  return result[0] ?? null;
}

export async function createTeamMember(data: NewTeamMember, actorId: string) {
  const result = await db.insert(teamMembers).values(data).returning();
  const member = result[0];
  await createAuditLog({
    actorId,
    actorType: "user",
    action: "create",
    entityType: "team_member",
    entityId: member.id,
    metadata: { name: member.name, email: member.email },
  });
  return member;
}

export async function updateTeamMember(
  id: string,
  data: Partial<NewTeamMember>,
  actorId: string
) {
  const result = await db
    .update(teamMembers)
    .set(data)
    .where(eq(teamMembers.id, id))
    .returning();
  const member = result[0];
  if (member) {
    await createAuditLog({
      actorId,
      actorType: "user",
      action: "update",
      entityType: "team_member",
      entityId: member.id,
      metadata: { fields: Object.keys(data) },
    });
  }
  return member ?? null;
}

export async function removeTeamMember(id: string, actorId: string) {
  await createAuditLog({
    actorId,
    actorType: "user",
    action: "deactivate",
    entityType: "team_member",
    entityId: id,
  });
  return db
    .update(teamMembers)
    .set({ isActive: false })
    .where(eq(teamMembers.id, id))
    .returning();
}

export async function getMemberAssignments(memberId: string) {
  return db
    .select({
      assignment: teamAssignments,
      project: portfolioProjects,
    })
    .from(teamAssignments)
    .innerJoin(
      portfolioProjects,
      eq(teamAssignments.projectId, portfolioProjects.id)
    )
    .where(eq(teamAssignments.teamMemberId, memberId));
}

export async function assignToProject(
  data: typeof teamAssignments.$inferInsert,
  actorId: string
) {
  const result = await db.insert(teamAssignments).values(data).returning();
  await createAuditLog({
    actorId,
    actorType: "user",
    action: "assign_project",
    entityType: "team_assignment",
    entityId: result[0].id,
    metadata: {
      teamMemberId: data.teamMemberId,
      projectId: data.projectId,
    },
  });
  return result[0];
}

export async function removeFromProject(
  assignmentId: string,
  actorId: string
) {
  await createAuditLog({
    actorId,
    actorType: "user",
    action: "unassign_project",
    entityType: "team_assignment",
    entityId: assignmentId,
  });
  await db
    .delete(teamAssignments)
    .where(eq(teamAssignments.id, assignmentId));
}

// ─── Invitations ─────────────────────────────────────────────────────────────

export type TeamInvitation = typeof teamInvitations.$inferSelect;

export async function getPendingInvitations() {
  return db
    .select()
    .from(teamInvitations)
    .where(
      and(
        eq(teamInvitations.status, "pending"),
        gt(teamInvitations.expiresAt, new Date())
      )
    )
    .orderBy(desc(teamInvitations.createdAt));
}

export async function getInvitationByToken(token: string) {
  const result = await db
    .select()
    .from(teamInvitations)
    .where(eq(teamInvitations.token, token));
  return result[0] ?? null;
}

export async function createInvitation(
  data: {
    email: string;
    role: "owner" | "admin" | "member";
    token: string;
    invitedById: string;
    clerkInvitationId?: string;
  },
  actorId: string
) {
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + 7);

  const result = await db
    .insert(teamInvitations)
    .values({
      email: data.email,
      role: data.role,
      token: data.token,
      status: "pending",
      invitedById: data.invitedById,
      clerkInvitationId: data.clerkInvitationId ?? null,
      expiresAt,
    })
    .returning();

  const invitation = result[0];
  await createAuditLog({
    actorId,
    actorType: "user",
    action: "invite_sent",
    entityType: "team_invitation",
    entityId: invitation.id,
    metadata: { email: invitation.email, role: invitation.role },
  });

  return invitation;
}

export async function revokeInvitation(id: string, actorId: string) {
  const result = await db
    .update(teamInvitations)
    .set({ status: "revoked", revokedAt: new Date() })
    .where(eq(teamInvitations.id, id))
    .returning();

  const invitation = result[0];
  if (invitation) {
    await createAuditLog({
      actorId,
      actorType: "user",
      action: "invite_revoked",
      entityType: "team_invitation",
      entityId: invitation.id,
      metadata: { email: invitation.email },
    });
  }

  return invitation ?? null;
}

export async function markInvitationAccepted(id: string) {
  const result = await db
    .update(teamInvitations)
    .set({ status: "accepted", acceptedAt: new Date() })
    .where(eq(teamInvitations.id, id))
    .returning();
  return result[0] ?? null;
}
