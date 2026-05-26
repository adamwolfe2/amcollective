"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { eq } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/lib/db";
import { engagements } from "@/lib/db/schema/crm";
import { requireAuth } from "@/lib/auth";
import { createAuditLog } from "@/lib/db/repositories/audit";
import { captureError } from "@/lib/errors";

const PAY_CADENCES = [
  "one_time",
  "weekly",
  "biweekly",
  "monthly",
  "quarterly",
  "annual",
  "custom",
] as const;

const updatePayScheduleSchema = z.object({
  engagementId: z.string().uuid("Invalid engagement id"),
  paymentCadence: z.enum(PAY_CADENCES).nullable(),
  nextPayDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be YYYY-MM-DD")
    .nullable(),
});

export type UpdatePayScheduleInput = z.infer<typeof updatePayScheduleSchema>;

export type ActionResult = {
  success: boolean;
  error?: string;
};

/**
 * Update an engagement's payment cadence and next-pay date. Drives the
 * /finance/calendar forward projection and the per-venture P&L revenue side.
 */
export async function updateEngagementPaySchedule(
  input: UpdatePayScheduleInput
): Promise<ActionResult> {
  const userId = await requireAuth();
  if (!userId) return { success: false, error: "Unauthorized" };

  const parsed = updatePayScheduleSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues.map((i) => i.message).join(", "),
    };
  }

  try {
    await db
      .update(engagements)
      .set({
        paymentCadence: parsed.data.paymentCadence,
        nextPayDate: parsed.data.nextPayDate ? new Date(parsed.data.nextPayDate) : null,
        updatedAt: new Date(),
      })
      .where(eq(engagements.id, parsed.data.engagementId));

    after(async () => {
      await createAuditLog({
        actorId: userId,
        actorType: "user",
        action: "update",
        entityType: "engagement",
        entityId: parsed.data.engagementId,
        metadata: {
          paymentCadence: parsed.data.paymentCadence,
          nextPayDate: parsed.data.nextPayDate,
          field: "pay_schedule",
        },
      });
    });

    revalidatePath("/finance/calendar");
    revalidatePath("/finance/ventures");
    revalidatePath("/finance/engagements");
    return { success: true };
  } catch (err) {
    captureError(err, { tags: { component: "updateEngagementPaySchedule" } });
    return {
      success: false,
      error: err instanceof Error ? err.message : "Update failed",
    };
  }
}
