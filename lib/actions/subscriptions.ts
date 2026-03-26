"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { subscriptionCosts } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { requireAuth } from "@/lib/auth";

type ActionResult<T = unknown> = {
  success: boolean;
  data?: T;
  error?: string;
};


export type SubscriptionInput = {
  name: string;
  vendor: string;
  companyTag: string;
  projectId: string | null;
  amountDollars: number;
  billingCycle: string;
  nextRenewal: string | null; // ISO date string (YYYY-MM-DD) or null
  category: string | null;
  notes: string | null;
};

export async function createSubscription(
  input: SubscriptionInput
): Promise<ActionResult> {
  const userId = await requireAuth();
  if (!userId) return { success: false, error: "Unauthorized" };

  try {
    const [sub] = await db
      .insert(subscriptionCosts)
      .values({
        name: input.name,
        vendor: input.vendor,
        companyTag: input.companyTag as "trackr" | "wholesail" | "taskspace" | "cursive" | "tbgc" | "hook" | "myvsl" | "am_collective" | "personal" | "untagged",
        projectId: input.projectId || null,
        amount: Math.round(input.amountDollars * 100),
        billingCycle: input.billingCycle,
        nextRenewal: input.nextRenewal ? new Date(input.nextRenewal) : null,
        category: input.category || null,
        notes: input.notes || null,
        isActive: true,
      })
      .returning();

    revalidatePath("/costs");
    revalidatePath("/finance");
    return { success: true, data: sub };
  } catch (e) {
    return {
      success: false,
      error: e instanceof Error ? e.message : "Failed to create subscription",
    };
  }
}

export async function updateSubscription(
  id: string,
  input: SubscriptionInput
): Promise<ActionResult> {
  const userId = await requireAuth();
  if (!userId) return { success: false, error: "Unauthorized" };

  try {
    const [sub] = await db
      .update(subscriptionCosts)
      .set({
        name: input.name,
        vendor: input.vendor,
        companyTag: input.companyTag as "trackr" | "wholesail" | "taskspace" | "cursive" | "tbgc" | "hook" | "myvsl" | "am_collective" | "personal" | "untagged",
        projectId: input.projectId || null,
        amount: Math.round(input.amountDollars * 100),
        billingCycle: input.billingCycle,
        nextRenewal: input.nextRenewal ? new Date(input.nextRenewal) : null,
        category: input.category || null,
        notes: input.notes || null,
      })
      .where(eq(subscriptionCosts.id, id))
      .returning();

    revalidatePath("/costs");
    revalidatePath("/finance");
    return { success: true, data: sub };
  } catch (e) {
    return {
      success: false,
      error: e instanceof Error ? e.message : "Failed to update subscription",
    };
  }
}

export async function deactivateSubscription(
  id: string
): Promise<ActionResult> {
  const userId = await requireAuth();
  if (!userId) return { success: false, error: "Unauthorized" };

  try {
    await db
      .update(subscriptionCosts)
      .set({ isActive: false })
      .where(eq(subscriptionCosts.id, id));

    revalidatePath("/costs");
    revalidatePath("/finance");
    return { success: true };
  } catch (e) {
    return {
      success: false,
      error: e instanceof Error ? e.message : "Failed to deactivate subscription",
    };
  }
}
