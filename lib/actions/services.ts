"use server";

import { auth } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import * as servicesRepo from "@/lib/db/repositories/services";

const createServiceSchema = z.object({
  name: z.string().min(1, "Name is required"),
  description: z.string().optional(),
  category: z.string().optional(),
  basePrice: z.number().int().min(0).optional(),
  pricePeriod: z.string().optional(),
  isActive: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
});

const updateServiceSchema = createServiceSchema.partial();

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

export async function getServices(): Promise<ActionResult> {
  const userId = await getUserId();
  if (!userId) return { success: false, error: "Unauthorized" };

  const data = await servicesRepo.getServices();
  return { success: true, data };
}

export async function createService(
  formData: z.infer<typeof createServiceSchema>
): Promise<ActionResult> {
  const userId = await getUserId();
  if (!userId) return { success: false, error: "Unauthorized" };

  const parsed = createServiceSchema.safeParse(formData);
  if (!parsed.success) {
    return { success: false, error: parsed.error.errors[0]?.message };
  }

  const service = await servicesRepo.createService(
    {
      name: parsed.data.name,
      description: parsed.data.description || null,
      category: parsed.data.category || null,
      basePrice: parsed.data.basePrice ?? null,
      pricePeriod: parsed.data.pricePeriod || null,
      isActive: parsed.data.isActive ?? true,
      sortOrder: parsed.data.sortOrder ?? 0,
    },
    userId
  );

  revalidatePath("/services");
  return { success: true, data: service };
}

export async function updateService(
  id: string,
  formData: z.infer<typeof updateServiceSchema>
): Promise<ActionResult> {
  const userId = await getUserId();
  if (!userId) return { success: false, error: "Unauthorized" };

  const parsed = updateServiceSchema.safeParse(formData);
  if (!parsed.success) {
    return { success: false, error: parsed.error.errors[0]?.message };
  }

  const service = await servicesRepo.updateService(id, parsed.data, userId);
  if (!service) return { success: false, error: "Service not found" };

  revalidatePath("/services");
  return { success: true, data: service };
}

export async function deleteService(id: string): Promise<ActionResult> {
  const userId = await getUserId();
  if (!userId) return { success: false, error: "Unauthorized" };

  await servicesRepo.deleteService(id, userId);
  revalidatePath("/services");
  return { success: true };
}
