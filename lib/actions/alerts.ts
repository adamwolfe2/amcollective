"use server";

import { revalidatePath } from "next/cache";
import * as alertsRepo from "@/lib/db/repositories/alerts";
import { captureError } from "@/lib/errors";
import { requireAuth } from "@/lib/auth";

type ActionResult<T = unknown> = {
  success: boolean;
  data?: T;
  error?: string;
};

export async function getAlerts(filters?: {
  severity?: string;
  isResolved?: boolean;
}): Promise<ActionResult> {
  const userId = await requireAuth();
  if (!userId) return { success: false, error: "Unauthorized" };

  const data = await alertsRepo.getAlerts(filters);
  return { success: true, data };
}

export async function resolveAlert(id: string): Promise<ActionResult> {
  const userId = await requireAuth();
  if (!userId) return { success: false, error: "Unauthorized" };

  try {
    const alert = await alertsRepo.resolveAlert(id, userId);
    if (!alert) return { success: false, error: "Alert not found" };

    revalidatePath("/alerts");
    return { success: true, data: alert };
  } catch (err) {
    captureError(err instanceof Error ? err : new Error("resolveAlert failed"), { tags: { component: "alerts" } });
    return { success: false, error: "Failed to resolve alert" };
  }
}
