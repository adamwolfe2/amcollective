"use server";

import { auth } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { eq, desc, ilike, or } from "drizzle-orm";
import { encryptPassword } from "@/lib/vault/crypto";

// ─── Auth ─────────────────────────────────────────────────────────────────────

async function getUserId() {
  const { userId } = await auth();
  if (!userId) {
    if (process.env.NODE_ENV === "development") return "dev-admin";
    throw new Error("Not authenticated");
  }
  return userId;
}

// ─── Schemas ─────────────────────────────────────────────────────────────────

const credentialSchema = z.object({
  label: z.string().min(1, "Label is required"),
  service: z.string().min(1, "Service is required"),
  username: z.string().optional(),
  password: z.string().optional(),
  url: z.string().optional(),
  notes: z.string().optional(),
  clientId: z.string().uuid().optional().nullable(),
  projectId: z.string().uuid().optional().nullable(),
});

type ActionResult<T = unknown> = { success: boolean; data?: T; error?: string };

// ─── Actions ──────────────────────────────────────────────────────────────────

export async function listCredentials(
  search?: string
): Promise<ActionResult> {
  const userId = await getUserId();
  if (!userId) return { success: false, error: "Unauthorized" };

  const rows = await db
    .select({
      id: schema.credentials.id,
      label: schema.credentials.label,
      service: schema.credentials.service,
      username: schema.credentials.username,
      url: schema.credentials.url,
      notes: schema.credentials.notes,
      clientId: schema.credentials.clientId,
      projectId: schema.credentials.projectId,
      hasPassword: schema.credentials.passwordEncrypted,
      createdAt: schema.credentials.createdAt,
    })
    .from(schema.credentials)
    .where(
      search
        ? or(
            ilike(schema.credentials.label, `%${search}%`),
            ilike(schema.credentials.service, `%${search}%`)
          )
        : undefined
    )
    .orderBy(desc(schema.credentials.createdAt));

  return {
    success: true,
    data: rows.map((r) => ({ ...r, hasPassword: !!r.hasPassword })),
  };
}

export async function createCredential(
  input: z.infer<typeof credentialSchema>
): Promise<ActionResult> {
  const userId = await getUserId();
  if (!userId) return { success: false, error: "Unauthorized" };

  const parsed = credentialSchema.safeParse(input);
  if (!parsed.success)
    return { success: false, error: parsed.error.errors[0]?.message };

  const { password, ...rest } = parsed.data;

  await db.insert(schema.credentials).values({
    ...rest,
    passwordEncrypted: password ? encryptPassword(password) : null,
    clientId: rest.clientId ?? null,
    projectId: rest.projectId ?? null,
    createdBy: userId,
  });

  revalidatePath("/vault");
  return { success: true };
}

export async function updateCredential(
  id: string,
  input: z.infer<typeof credentialSchema>
): Promise<ActionResult> {
  const userId = await getUserId();
  if (!userId) return { success: false, error: "Unauthorized" };

  const parsed = credentialSchema.safeParse(input);
  if (!parsed.success)
    return { success: false, error: parsed.error.errors[0]?.message };

  const { password, ...rest } = parsed.data;

  const updateData: Record<string, unknown> = { ...rest };
  if (password !== undefined) {
    updateData.passwordEncrypted = password ? encryptPassword(password) : null;
  }

  await db
    .update(schema.credentials)
    .set(updateData)
    .where(eq(schema.credentials.id, id));

  revalidatePath("/vault");
  return { success: true };
}

export async function deleteCredential(id: string): Promise<ActionResult> {
  const userId = await getUserId();
  if (!userId) return { success: false, error: "Unauthorized" };

  await db.delete(schema.credentials).where(eq(schema.credentials.id, id));

  revalidatePath("/vault");
  return { success: true };
}
