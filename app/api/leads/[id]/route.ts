/**
 * GET    /api/leads/[id]  -- lead detail with activity timeline
 * PATCH  /api/leads/[id]  -- update lead
 * DELETE /api/leads/[id]  -- archive (soft delete)
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

const leadUpdateSchema = z.object({
  contactName: z.string().min(1).max(200).trim(),
  companyName: z.string().max(200).nullable(),
  email: z.string().email().max(320).nullable(),
  phone: z.string().max(50).nullable(),
  linkedinUrl: z.string().url().max(500).nullable(),
  website: z.string().url().max(500).nullable(),
  stage: z.enum(["awareness", "interest", "consideration", "intent", "closed_won", "closed_lost", "nurture"]),
  source: z.enum(["referral", "inbound", "outbound", "conference", "social", "university", "other"]).nullable(),
  assignedTo: z.string().max(255).nullable(),
  estimatedValue: z.number().int().min(0).max(100_000_000).nullable(),
  probability: z.number().int().min(0).max(100).nullable(),
  expectedCloseDate: z.string().nullable(),
  industry: z.string().max(200).nullable(),
  companySize: z.string().max(100).nullable(),
  notes: z.string().max(10000).nullable(),
  tags: z.array(z.string()).nullable(),
  companyTag: z.enum(companyTags),
  lastContactedAt: z.string().nullable(),
  nextFollowUpAt: z.string().nullable(),
}).partial().refine(data => Object.keys(data).length > 0, "At least one field required");

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: NextRequest, ctx: RouteContext) {
  try {
    const userId = await checkAdmin();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await ctx.params;

    const [[lead], activities] = await Promise.all([
      db.select().from(schema.leads).where(eq(schema.leads.id, id)).limit(1),
      db
        .select()
        .from(schema.leadActivities)
        .where(eq(schema.leadActivities.leadId, id))
        .orderBy(desc(schema.leadActivities.createdAt))
        .limit(50),
    ]);

    if (!lead) {
      return NextResponse.json({ error: "Lead not found" }, { status: 404 });
    }

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
  if (aj) {
    const decision = await aj.protect(request, { requested: 1 });
    if (decision.isDenied()) {
      return NextResponse.json({ error: "Rate limited" }, { status: 429 });
    }
  }

  try {
    const userId = await checkAdmin();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await ctx.params;
    const body = await request.json();

    const parsed = leadUpdateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const data = parsed.data;

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
        ...(data.contactName !== undefined && {
          contactName: data.contactName,
        }),
        ...(data.companyName !== undefined && {
          companyName: data.companyName,
        }),
        ...(data.email !== undefined && { email: data.email }),
        ...(data.phone !== undefined && { phone: data.phone }),
        ...(data.linkedinUrl !== undefined && {
          linkedinUrl: data.linkedinUrl,
        }),
        ...(data.website !== undefined && { website: data.website }),
        ...(data.stage !== undefined && { stage: data.stage }),
        ...(data.source !== undefined && { source: data.source }),
        ...(data.assignedTo !== undefined && {
          assignedTo: data.assignedTo,
        }),
        ...(data.estimatedValue !== undefined && {
          estimatedValue: data.estimatedValue,
        }),
        ...(data.probability !== undefined && {
          probability: data.probability,
        }),
        ...(data.expectedCloseDate !== undefined && {
          expectedCloseDate: data.expectedCloseDate,
        }),
        ...(data.industry !== undefined && { industry: data.industry }),
        ...(data.companySize !== undefined && {
          companySize: data.companySize,
        }),
        ...(data.notes !== undefined && { notes: data.notes }),
        ...(data.tags !== undefined && { tags: data.tags }),
        ...(data.companyTag !== undefined && {
          companyTag: data.companyTag,
        }),
        ...(data.lastContactedAt !== undefined && {
          lastContactedAt: data.lastContactedAt
            ? new Date(data.lastContactedAt)
            : null,
        }),
        ...(data.nextFollowUpAt !== undefined && {
          nextFollowUpAt: data.nextFollowUpAt
            ? new Date(data.nextFollowUpAt)
            : null,
        }),
      })
      .where(eq(schema.leads.id, id))
      .returning();

    // Log stage change as activity
    if (data.stage && data.stage !== current.stage) {
      await db.insert(schema.leadActivities).values({
        leadId: id,
        type: "stage_change",
        content: `Stage changed from ${current.stage} to ${data.stage}`,
        createdById: userId,
      });
    }

    await createAuditLog({
      actorId: userId,
      actorType: "user",
      action: "lead.updated",
      entityType: "lead",
      entityId: id,
      metadata: data,
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
  if (aj) {
    const decision = await aj.protect(_request, { requested: 1 });
    if (decision.isDenied()) {
      return NextResponse.json({ error: "Rate limited" }, { status: 429 });
    }
  }

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
