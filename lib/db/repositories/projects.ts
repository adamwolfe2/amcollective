import { db } from "@/lib/db";
import {
  portfolioProjects,
  teamAssignments,
  teamMembers,
  clientProjects,
  clients,
} from "@/lib/db/schema";
import { eq, desc, count } from "drizzle-orm";
import { createAuditLog } from "./audit";

export type PortfolioProject = typeof portfolioProjects.$inferSelect;
export type NewPortfolioProject = typeof portfolioProjects.$inferInsert;

export async function getProjects() {
  return db
    .select()
    .from(portfolioProjects)
    .orderBy(desc(portfolioProjects.createdAt))
    .limit(100);
}

export async function getProjectCount() {
  const result = await db
    .select({ value: count() })
    .from(portfolioProjects);
  return result[0]?.value ?? 0;
}

export async function getActiveProjectCount() {
  const result = await db
    .select({ value: count() })
    .from(portfolioProjects)
    .where(eq(portfolioProjects.status, "active"));
  return result[0]?.value ?? 0;
}

export async function getProject(id: string) {
  const result = await db
    .select()
    .from(portfolioProjects)
    .where(eq(portfolioProjects.id, id));
  return result[0] ?? null;
}

export async function createProject(
  data: NewPortfolioProject,
  actorId: string
) {
  const result = await db.insert(portfolioProjects).values(data).returning();
  const project = result[0];
  await createAuditLog({
    actorId,
    actorType: "user",
    action: "create",
    entityType: "project",
    entityId: project.id,
    metadata: { name: project.name, slug: project.slug },
  });
  return project;
}

export async function updateProject(
  id: string,
  data: Partial<NewPortfolioProject>,
  actorId: string
) {
  const result = await db
    .update(portfolioProjects)
    .set(data)
    .where(eq(portfolioProjects.id, id))
    .returning();
  const project = result[0];
  if (project) {
    await createAuditLog({
      actorId,
      actorType: "user",
      action: "update",
      entityType: "project",
      entityId: project.id,
      metadata: { fields: Object.keys(data) },
    });
  }
  return project ?? null;
}

export async function getProjectTeamMembers(projectId: string) {
  return db
    .select({
      assignment: teamAssignments,
      member: teamMembers,
    })
    .from(teamAssignments)
    .innerJoin(teamMembers, eq(teamAssignments.teamMemberId, teamMembers.id))
    .where(eq(teamAssignments.projectId, projectId));
}

export async function getProjectClients(projectId: string) {
  return db
    .select({
      link: clientProjects,
      client: clients,
    })
    .from(clientProjects)
    .innerJoin(clients, eq(clientProjects.clientId, clients.id))
    .where(eq(clientProjects.projectId, projectId));
}

export async function getProjectStats(projectId: string) {
  const [teamCount] = await db
    .select({ value: count() })
    .from(teamAssignments)
    .where(eq(teamAssignments.projectId, projectId));
  const [clientCount] = await db
    .select({ value: count() })
    .from(clientProjects)
    .where(eq(clientProjects.projectId, projectId));
  return {
    teamCount: teamCount?.value ?? 0,
    clientCount: clientCount?.value ?? 0,
  };
}
