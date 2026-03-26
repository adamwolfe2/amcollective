"use server";

import { revalidatePath, revalidateTag } from "next/cache";
import { z } from "zod";
import * as projectsRepo from "@/lib/db/repositories/projects";
import * as teamRepo from "@/lib/db/repositories/team";
import { requireAuth } from "@/lib/auth";

const createProjectSchema = z.object({
  name: z.string().min(1, "Name is required"),
  slug: z.string().min(1, "Slug is required"),
  domain: z.string().optional(),
  vercelProjectId: z.string().optional(),
  githubRepo: z.string().optional(),
  status: z.enum(["active", "paused", "archived"]).optional(),
  healthScore: z.number().int().min(0).max(100).optional(),
});

const updateProjectSchema = createProjectSchema.partial();

type ActionResult<T = unknown> = {
  success: boolean;
  data?: T;
  error?: string;
};


export async function getProjects(): Promise<ActionResult> {
  const userId = await requireAuth();
  if (!userId) return { success: false, error: "Unauthorized" };

  const data = await projectsRepo.getProjects();
  return { success: true, data };
}

export async function getProject(id: string): Promise<ActionResult> {
  const userId = await requireAuth();
  if (!userId) return { success: false, error: "Unauthorized" };

  const data = await projectsRepo.getProject(id);
  if (!data) return { success: false, error: "Project not found" };
  return { success: true, data };
}

export async function createProject(
  formData: z.infer<typeof createProjectSchema>
): Promise<ActionResult> {
  const userId = await requireAuth();
  if (!userId) return { success: false, error: "Unauthorized" };

  const parsed = createProjectSchema.safeParse(formData);
  if (!parsed.success) {
    return { success: false, error: parsed.error.errors[0]?.message };
  }

  const project = await projectsRepo.createProject(
    {
      name: parsed.data.name,
      slug: parsed.data.slug,
      domain: parsed.data.domain || null,
      vercelProjectId: parsed.data.vercelProjectId || null,
      githubRepo: parsed.data.githubRepo || null,
      status: parsed.data.status ?? "active",
      healthScore: parsed.data.healthScore ?? null,
    },
    userId
  );

  revalidatePath("/projects");
  revalidateTag("projects", {});
  return { success: true, data: project };
}

export async function updateProject(
  id: string,
  formData: z.infer<typeof updateProjectSchema>
): Promise<ActionResult> {
  const userId = await requireAuth();
  if (!userId) return { success: false, error: "Unauthorized" };

  const parsed = updateProjectSchema.safeParse(formData);
  if (!parsed.success) {
    return { success: false, error: parsed.error.errors[0]?.message };
  }

  const project = await projectsRepo.updateProject(id, parsed.data, userId);
  if (!project) return { success: false, error: "Project not found" };

  revalidatePath("/projects");
  revalidatePath(`/projects/${id}`);
  revalidateTag("projects", {});
  return { success: true, data: project };
}

export async function assignTeamMember(
  projectId: string,
  teamMemberId: string,
  role?: string
): Promise<ActionResult> {
  const userId = await requireAuth();
  if (!userId) return { success: false, error: "Unauthorized" };

  const assignment = await teamRepo.assignToProject(
    { teamMemberId, projectId, role: role || null },
    userId
  );

  revalidatePath(`/projects/${projectId}`);
  revalidatePath(`/team/${teamMemberId}`);
  return { success: true, data: assignment };
}
