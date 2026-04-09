/**
 * POST /api/leads/[id]/activity  -- add activity log entry
 * GET  /api/leads/[id]/activity  -- get activity timeline
 */

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { eq, desc } from "drizzle-orm";
import { checkAdmin } from "@/lib/auth";
import { captureError } from "@/lib/errors";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: NextRequest, ctx: RouteContext) {
  try {
    const userId = await checkAdmin();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await ctx.params;

    const activities = await db
      .select()
      .from(schema.leadActivities)
      .where(eq(schema.leadActivities.leadId, id))
      .orderBy(desc(schema.leadActivities.createdAt))
      .limit(100);

    return NextResponse.json(activities, {
      headers: { "Cache-Control": "private, max-age=60, stale-while-revalidate=120" },
    });
  } catch (error) {
    captureError(error);
    return NextResponse.json(
      { error: "Failed to fetch activities" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest, ctx: RouteContext) {
  try {
    const userId = await checkAdmin();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await ctx.params;
    const body = await request.json();

    if (!body.content || typeof body.content !== "string" || !body.content.trim()) {
      return NextResponse.json({ error: "content is required" }, { status: 400 });
    }

    const [activity] = await db
      .insert(schema.leadActivities)
      .values({
        leadId: id,
        type: body.type ?? "note",
        content: body.content.slice(0, 5000),
        createdById: userId,
      })
      .returning();

    // Update lastContactedAt on the lead
    if (["email", "call", "meeting"].includes(body.type)) {
      await db
        .update(schema.leads)
        .set({ lastContactedAt: new Date() })
        .where(eq(schema.leads.id, id));
    }

    return NextResponse.json(activity, { status: 201 });
  } catch (error) {
    captureError(error);
    return NextResponse.json(
      { error: "Failed to create activity" },
      { status: 500 }
    );
  }
}
