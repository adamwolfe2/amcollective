/**
 * GET    /api/leads/[id]  -- lead detail with activity timeline
 * PATCH  /api/leads/[id]  -- update lead
 * DELETE /api/leads/[id]  -- archive (soft delete)
 */

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { eq, desc } from "drizzle-orm";
import { checkAdmin } from "@/lib/auth";
import { captureError } from "@/lib/errors";
import { createAuditLog } from "@/lib/db/repositories/audit";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: NextRequest, ctx: RouteContext) {
  try {
    const userId = await checkAdmin();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await ctx.params;

    const [lead] = await db
      .select()
      .from(schema.leads)
      .where(eq(schema.leads.id, id))
      .limit(1);

    if (!lead) {
      return NextResponse.json({ error: "Lead not found" }, { status: 404 });
    }

    const activities = await db
      .select()
      .from(schema.leadActivities)
      .where(eq(schema.leadActivities.leadId, id))
      .orderBy(desc(schema.leadActivities.createdAt))
      .limit(50);

    return NextResponse.json({ ...lead, activities });
  } catch (error) {
    captureError(error);
    return NextResponse.json(
      { error: "Failed to fetch lead" },
      { status: 500 }
    );
  }
}

export async function PATCH(request: NextRequest, ctx: RouteContext) {
  try {
    const userId = await checkAdmin();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await ctx.params;
    const body = await request.json();

    const [current] = await db
      .select()
      .from(schema.leads)
      .where(eq(schema.leads.id, id))
      .limit(1);

    if (!current) {
      return NextResponse.json({ error: "Lead not found" }, { status: 404 });
    }

    const [updated] = await db
      .update(schema.leads)
      .set({
        ...(body.contactName !== undefined && {
          contactName: body.contactName,
        }),
        ...(body.companyName !== undefined && {
          companyName: body.companyName,
        }),
        ...(body.email !== undefined && { email: body.email }),
        ...(body.phone !== undefined && { phone: body.phone }),
        ...(body.linkedinUrl !== undefined && {
          linkedinUrl: body.linkedinUrl,
        }),
        ...(body.website !== undefined && { website: body.website }),
        ...(body.stage !== undefined && { stage: body.stage }),
        ...(body.source !== undefined && { source: body.source }),
        ...(body.assignedTo !== undefined && {
          assignedTo: body.assignedTo,
        }),
        ...(body.estimatedValue !== undefined && {
          estimatedValue: body.estimatedValue,
        }),
        ...(body.probability !== undefined && {
          probability: body.probability,
        }),
        ...(body.expectedCloseDate !== undefined && {
          expectedCloseDate: body.expectedCloseDate,
        }),
        ...(body.industry !== undefined && { industry: body.industry }),
        ...(body.companySize !== undefined && {
          companySize: body.companySize,
        }),
        ...(body.notes !== undefined && { notes: body.notes }),
        ...(body.tags !== undefined && { tags: body.tags }),
        ...(body.companyTag !== undefined && {
          companyTag: body.companyTag,
        }),
        ...(body.lastContactedAt !== undefined && {
          lastContactedAt: body.lastContactedAt
            ? new Date(body.lastContactedAt)
            : null,
        }),
        ...(body.nextFollowUpAt !== undefined && {
          nextFollowUpAt: body.nextFollowUpAt
            ? new Date(body.nextFollowUpAt)
            : null,
        }),
      })
      .where(eq(schema.leads.id, id))
      .returning();

    // Log stage change as activity
    if (body.stage && body.stage !== current.stage) {
      await db.insert(schema.leadActivities).values({
        leadId: id,
        type: "stage_change",
        content: `Stage changed from ${current.stage} to ${body.stage}`,
        createdById: userId,
      });
    }

    await createAuditLog({
      actorId: userId,
      actorType: "user",
      action: "lead.updated",
      entityType: "lead",
      entityId: id,
      metadata: body,
    });

    return NextResponse.json(updated);
  } catch (error) {
    captureError(error);
    return NextResponse.json(
      { error: "Failed to update lead" },
      { status: 500 }
    );
  }
}

export async function DELETE(_request: NextRequest, ctx: RouteContext) {
  try {
    const userId = await checkAdmin();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await ctx.params;

    const [archived] = await db
      .update(schema.leads)
      .set({ isArchived: true })
      .where(eq(schema.leads.id, id))
      .returning();

    if (!archived) {
      return NextResponse.json({ error: "Lead not found" }, { status: 404 });
    }

    await createAuditLog({
      actorId: userId,
      actorType: "user",
      action: "lead.archived",
      entityType: "lead",
      entityId: id,
    });

    return NextResponse.json({ archived: true });
  } catch (error) {
    captureError(error);
    return NextResponse.json(
      { error: "Failed to archive lead" },
      { status: 500 }
    );
  }
}
