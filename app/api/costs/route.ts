/**
 * Subscription Costs API — CRUD for SaaS/tool recurring costs.
 *
 * GET /api/costs — List all subscription costs (active by default)
 * POST /api/costs — Create a new subscription cost
 * Auth: owner or admin only.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { eq, desc } from "drizzle-orm";
import { checkAdmin } from "@/lib/auth";
import { captureError } from "@/lib/errors";
import { createAuditLog } from "@/lib/db/repositories/audit";
import { aj } from "@/lib/middleware/arcjet";

const companyTags = ["trackr", "wholesail", "taskspace", "cursive", "tbgc", "hook", "am_collective", "personal", "untagged"] as const;

const costSchema = z.object({
  name: z.string().min(1).max(200).trim(),
  vendor: z.string().min(1).max(200).trim(),
  companyTag: z.enum(companyTags).optional(),
  amount: z.number().min(0).max(10_000_000),
  billingCycle: z.enum(["monthly", "quarterly", "annually", "one-time"]).optional(),
  nextRenewal: z.string().optional().nullable(),
  category: z.string().max(100).optional().nullable(),
  notes: z.string().max(5000).optional().nullable(),
});

export async function GET(req: NextRequest) {
  const userId = await checkAdmin();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const showInactive = req.nextUrl.searchParams.get("all") === "true";

  try {
    const costs = showInactive
      ? await db
          .select()
          .from(schema.subscriptionCosts)
          .orderBy(desc(schema.subscriptionCosts.createdAt))
      : await db
          .select()
          .from(schema.subscriptionCosts)
          .where(eq(schema.subscriptionCosts.isActive, true))
          .orderBy(desc(schema.subscriptionCosts.createdAt));

    return NextResponse.json({ costs });
  } catch (err) {
    captureError(err, { tags: { route: "GET /api/costs" } });
    return NextResponse.json(
      { error: "Failed to fetch costs" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  if (aj) {
    const decision = await aj.protect(req, { requested: 1 });
    if (decision.isDenied()) {
      return NextResponse.json({ error: "Too many requests" }, { status: 429 });
    }
  }

  const userId = await checkAdmin();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    let rawBody: unknown;
    try {
      rawBody = await req.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }

    const parsed = costSchema.safeParse(rawBody);
    if (!parsed.success) {
      const firstError = parsed.error.errors[0];
      return NextResponse.json(
        { error: "Validation failed", field: firstError?.path?.join("."), message: firstError?.message },
        { status: 400 }
      );
    }

    const { name, vendor, companyTag, amount, billingCycle, nextRenewal, category, notes } = parsed.data;

    const [cost] = await db
      .insert(schema.subscriptionCosts)
      .values({
        name,
        vendor,
        companyTag: companyTag ?? "am_collective",
        amount: Math.round(amount),
        billingCycle: billingCycle ?? "monthly",
        nextRenewal: nextRenewal ? new Date(nextRenewal) : null,
        category: category ?? null,
        notes: notes ?? null,
      })
      .returning();

    await createAuditLog({
      actorId: userId,
      actorType: "user",
      action: "create_subscription_cost",
      entityType: "subscription_cost",
      entityId: cost.id,
      metadata: { name, vendor, amount },
    });

    return NextResponse.json({ cost }, { status: 201 });
  } catch (err) {
    captureError(err, { tags: { route: "POST /api/costs" } });
    return NextResponse.json(
      { error: "Failed to create cost" },
      { status: 500 }
    );
  }
}
