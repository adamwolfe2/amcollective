/**
 * Subscription Costs API — CRUD for SaaS/tool recurring costs.
 *
 * GET /api/costs — List all subscription costs (active by default)
 * POST /api/costs — Create a new subscription cost
 * Auth: owner or admin only.
 */

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { eq, desc } from "drizzle-orm";
import { checkAdmin } from "@/lib/auth";
import { captureError } from "@/lib/errors";
import { createAuditLog } from "@/lib/db/repositories/audit";

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
  const userId = await checkAdmin();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const { name, vendor, companyTag, amount, billingCycle, nextRenewal, category, notes } = body;

    if (!name || !vendor || !amount) {
      return NextResponse.json(
        { error: "name, vendor, and amount are required" },
        { status: 400 }
      );
    }

    const [cost] = await db
      .insert(schema.subscriptionCosts)
      .values({
        name,
        vendor,
        companyTag: companyTag ?? "am_collective",
        amount: Math.round(Number(amount)),
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
