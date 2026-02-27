"use server";

import { auth } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";
import * as alertsRepo from "@/lib/db/repositories/alerts";

type ActionResult<T = unknown> = {
  success: boolean;
  data?: T;
  error?: string;
};

async function getUserId() {
  if (!process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY) return "dev-admin";
  const { userId } = await auth();
  return userId;
}

export async function getAlerts(filters?: {
  severity?: string;
  isResolved?: boolean;
}): Promise<ActionResult> {
  const userId = await getUserId();
  if (!userId) return { success: false, error: "Unauthorized" };

  const data = await alertsRepo.getAlerts(filters);
  return { success: true, data };
}

export async function resolveAlert(id: string): Promise<ActionResult> {
  const userId = await getUserId();
  if (!userId) return { success: false, error: "Unauthorized" };

  const alert = await alertsRepo.resolveAlert(id, userId);
  if (!alert) return { success: false, error: "Alert not found" };

  revalidatePath("/alerts");
  return { success: true, data: alert };
}
