"use server";

import { revalidatePath, revalidateTag } from "next/cache";
import { after } from "next/server";
import { z } from "zod";

import { db } from "@/lib/db";
import { subscriptionCosts, COMPANY_TAGS } from "@/lib/db/schema/costs";
import { requireAuth } from "@/lib/auth";
import { createAuditLog } from "@/lib/db/repositories/audit";
import { captureError } from "@/lib/errors";

const promoteSchema = z.object({
  name: z.string().min(1).max(255),
  vendor: z.string().min(1).max(255),
  amountCents: z.number().int().min(1),
  billingCycle: z.enum(["monthly", "annual", "weekly", "biweekly", "quarterly"]),
  companyTag: z.enum(COMPANY_TAGS),
  nextRenewal: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be YYYY-MM-DD")
    .optional(),
  category: z.string().max(100).optional(),
  notes: z.string().max(1000).optional(),
  /** For audit trail — which Mercury candidate this came from. */
  candidateKey: z.string().max(255).optional(),
});

export type PromoteRecurringInput = z.infer<typeof promoteSchema>;
export type ActionResult = {
  success: boolean;
  error?: string;
  id?: string;
};

/**
 * Promote a detected Mercury recurring candidate into a tracked
 * subscription_cost row. The candidate stays in mercury_transactions —
 * this just creates the forward-looking forecast entry.
 */
export async function promoteRecurringCandidate(
  input: PromoteRecurringInput
): Promise<ActionResult> {
  const userId = await requireAuth();
  if (!userId) return { success: false, error: "Unauthorized" };

  const parsed = promoteSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues.map((i) => i.message).join(", "),
    };
  }

  try {
    const [created] = await db
      .insert(subscriptionCosts)
      .values({
        name: parsed.data.name,
        vendor: parsed.data.vendor,
        amount: parsed.data.amountCents,
        billingCycle: parsed.data.billingCycle,
        companyTag: parsed.data.companyTag,
        nextRenewal: parsed.data.nextRenewal
          ? new Date(parsed.data.nextRenewal)
          : null,
        category: parsed.data.category ?? null,
        notes: parsed.data.notes ?? "Imported from Mercury transaction history",
        isActive: true,
      })
      .returning({ id: subscriptionCosts.id });

    after(async () => {
      await createAuditLog({
        actorId: userId,
        actorType: "user",
        action: "create",
        entityType: "subscription_cost",
        entityId: created.id,
        metadata: {
          source: "mercury_recurring_detector",
          candidateKey: parsed.data.candidateKey,
          name: parsed.data.name,
          amountCents: parsed.data.amountCents,
          billingCycle: parsed.data.billingCycle,
        },
      });
    });

    revalidatePath("/costs");
    revalidatePath("/finance");
    revalidatePath("/finance/calendar");
    revalidatePath("/finance/ventures");
    revalidatePath("/finance/recurring");
    revalidateTag("costs", {});

    return { success: true, id: created.id };
  } catch (err) {
    captureError(err, { tags: { component: "promoteRecurringCandidate" } });
    return {
      success: false,
      error: err instanceof Error ? err.message : "Failed to promote",
    };
  }
}
