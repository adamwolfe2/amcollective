import { db } from "@/lib/db";
import {
  teamMembers,
  teamAssignments,
  portfolioProjects,
} from "@/lib/db/schema";
import { eq, desc, count } from "drizzle-orm";
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
