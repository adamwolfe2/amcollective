"use server";

import { auth } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import * as clientsRepo from "@/lib/db/repositories/clients";

const createClientSchema = z.object({
  name: z.string().min(1, "Name is required"),
  companyName: z.string().optional(),
  email: z.string().email("Invalid email").optional().or(z.literal("")),
  phone: z.string().optional(),
  website: z.string().url("Invalid URL").optional().or(z.literal("")),
  notes: z.string().optional(),
  portalAccess: z.boolean().optional(),
});

const updateClientSchema = createClientSchema.partial();

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

export async function getClients(search?: string): Promise<ActionResult> {
  const userId = await getUserId();
  if (!userId) return { success: false, error: "Unauthorized" };

  const data = await clientsRepo.getClients({ search: search || undefined });
  return { success: true, data };
}

export async function getClient(id: string): Promise<ActionResult> {
  const userId = await getUserId();
  if (!userId) return { success: false, error: "Unauthorized" };

  const data = await clientsRepo.getClient(id);
  if (!data) return { success: false, error: "Client not found" };
  return { success: true, data };
}

export async function createClient(
  formData: z.infer<typeof createClientSchema>
): Promise<ActionResult> {
  const userId = await getUserId();
  if (!userId) return { success: false, error: "Unauthorized" };

  const parsed = createClientSchema.safeParse(formData);
  if (!parsed.success) {
    return { success: false, error: parsed.error.errors[0]?.message };
  }

  const client = await clientsRepo.createClient(
    {
      name: parsed.data.name,
      companyName: parsed.data.companyName || null,
      email: parsed.data.email || null,
      phone: parsed.data.phone || null,
      website: parsed.data.website || null,
      notes: parsed.data.notes || null,
      portalAccess: parsed.data.portalAccess ?? false,
    },
    userId
  );

  revalidatePath("/clients");
  return { success: true, data: client };
}

export async function updateClient(
  id: string,
  formData: z.infer<typeof updateClientSchema>
): Promise<ActionResult> {
  const userId = await getUserId();
  if (!userId) return { success: false, error: "Unauthorized" };

  const parsed = updateClientSchema.safeParse(formData);
  if (!parsed.success) {
    return { success: false, error: parsed.error.errors[0]?.message };
  }

  const client = await clientsRepo.updateClient(id, parsed.data, userId);
  if (!client) return { success: false, error: "Client not found" };

  revalidatePath("/clients");
  revalidatePath(`/clients/${id}`);
  return { success: true, data: client };
}

export async function deleteClient(id: string): Promise<ActionResult> {
  const userId = await getUserId();
  if (!userId) return { success: false, error: "Unauthorized" };

  await clientsRepo.deleteClient(id, userId);
  revalidatePath("/clients");
  return { success: true };
}
