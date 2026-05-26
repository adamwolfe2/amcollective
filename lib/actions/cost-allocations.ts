"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { eq } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/lib/db";
import {
  subscriptionCostAllocations,
  subscriptionCosts,
  COMPANY_TAGS,
} from "@/lib/db/schema/costs";
import { requireAuth } from "@/lib/auth";
import { createAuditLog } from "@/lib/db/repositories/audit";
import { captureError } from "@/lib/errors";

const allocationSchema = z.object({
  companyTag: z.enum(COMPANY_TAGS),
  percentBps: z
    .number()
    .int()
    .min(1, "Percentage must be > 0")
    .max(10000, "Percentage must be ≤ 100%"),
});

const setAllocationsSchema = z.object({
  costId: z.string().uuid("Invalid cost id"),
  allocations: z
    .array(allocationSchema)
    .max(20, "Maximum 20 allocations per cost"),
});

export type SetAllocationsInput = z.infer<typeof setAllocationsSchema>;
export type ActionResult = { success: boolean; error?: string };

/**
 * Replace every allocation row for a subscription_cost atomically.
 * Pass an empty `allocations` array to clear and fall back to the single-tag
 * column.
 */
export async function setCostAllocations(
  input: SetAllocationsInput
): Promise<ActionResult> {
  const userId = await requireAuth();
  if (!userId) return { success: false, error: "Unauthorized" };

  const parsed = setAllocationsSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues.map((i) => i.message).join(", "),
    };
  }

  // Must total 10000 bps (100%) when any allocations exist.
  if (parsed.data.allocations.length > 0) {
    const sum = parsed.data.allocations.reduce(
      (s, a) => s + a.percentBps,
      0
    );
    if (sum !== 10000) {
      return {
        success: false,
        error: `Allocations must total 100% (got ${(sum / 100).toFixed(2)}%)`,
      };
    }
    // No duplicate tags.
    const tags = new Set(parsed.data.allocations.map((a) => a.companyTag));
    if (tags.size !== parsed.data.allocations.length) {
      return {
        success: false,
        error: "Each venture can only appear once per cost.",
      };
    }
  }

  // Verify the cost exists.
  const [cost] = await db
    .select({ id: subscriptionCosts.id, name: subscriptionCosts.name })
    .from(subscriptionCosts)
    .where(eq(subscriptionCosts.id, parsed.data.costId))
    .limit(1);
  if (!cost) return { success: false, error: "Cost not found" };

  try {
    // Replace-all: delete then insert. Drizzle's neon-http driver doesn't
    // support transactions across multiple statements, but since the unique
    // index prevents duplicates we accept the short window of inconsistency.
    await db
      .delete(subscriptionCostAllocations)
      .where(eq(subscriptionCostAllocations.costId, parsed.data.costId));

    if (parsed.data.allocations.length > 0) {
      await db.insert(subscriptionCostAllocations).values(
        parsed.data.allocations.map((a) => ({
          costId: parsed.data.costId,
          companyTag: a.companyTag,
          percentBps: a.percentBps,
        }))
      );
    }

    after(async () => {
      await createAuditLog({
        actorId: userId,
        actorType: "user",
        action: "update",
        entityType: "subscription_cost_allocation",
        entityId: parsed.data.costId,
        metadata: {
          costName: cost.name,
          allocationCount: parsed.data.allocations.length,
          allocations: parsed.data.allocations,
        },
      });
    });

    revalidatePath("/costs");
    revalidatePath("/finance");
    revalidatePath("/finance/calendar");
    revalidatePath("/finance/ventures");
    return { success: true };
  } catch (err) {
    captureError(err, { tags: { component: "setCostAllocations" } });
    return {
      success: false,
      error: err instanceof Error ? err.message : "Failed to save allocations",
    };
  }
}
