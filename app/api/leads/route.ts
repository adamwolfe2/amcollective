/**
 * GET  /api/leads  -- list leads with optional filters
 * POST /api/leads  -- create a new lead
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { and, eq, desc, or, ilike } from "drizzle-orm";
import { checkAdmin } from "@/lib/auth";
import { captureError } from "@/lib/errors";
import { createAuditLog } from "@/lib/db/repositories/audit";
import { aj } from "@/lib/middleware/arcjet";

const companyTags = ["trackr", "wholesail", "taskspace", "cursive", "tbgc", "hook", "myvsl", "am_collective", "personal", "untagged"] as const;

const leadSchema = z.object({
  contactName: z.string().min(1, "Contact name is required").max(200).trim(),
  companyName: z.string().max(200).optional().nullable(),
  email: z.string().email().max(320).optional().nullable(),
  phone: z.string().max(50).optional().nullable(),
  linkedinUrl: z.string().url().max(500).optional().nullable(),
  website: z.string().url().max(500).optional().nullable(),
  stage: z.enum(["awareness", "interest", "consideration", "intent", "closed_won", "closed_lost", "nurture"]).optional(),
  source: z.enum(["referral", "inbound", "outbound", "conference", "social", "university", "other"]).optional().nullable(),
  assignedTo: z.string().max(255).optional().nullable(),
  estimatedValue: z.number().min(0).max(100_000_000).optional().nullable(),
  probability: z.number().min(0).max(100).optional().nullable(),
  expectedCloseDate: z.string().optional().nullable(),
  industry: z.string().max(200).optional().nullable(),
  companySize: z.string().max(100).optional().nullable(),
  notes: z.string().max(10000).optional().nullable(),
  tags: z.unknown().optional().nullable(),
  companyTag: z.enum(companyTags).optional(),
  nextFollowUpAt: z.string().optional().nullable(),
});

export async function GET(request: NextRequest) {
  try {
    const userId = await checkAdmin();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const url = request.nextUrl.searchParams;
    const stage = url.get("stage");
    const source = url.get("source");
    const companyTag = url.get("companyTag");
    const search = url.get("search");

    const conditions = [eq(schema.leads.isArchived, false)];

    if (stage && stage !== "all") {
      conditions.push(
        eq(
          schema.leads.stage,
          stage as (typeof schema.leadStageEnum.enumValues)[number]
        )
      );
    }
    if (source) {
      conditions.push(
        eq(
          schema.leads.source,
          source as (typeof schema.leadSourceEnum.enumValues)[number]
        )
      );
    }
    if (companyTag) {
      conditions.push(
        eq(
          schema.leads.companyTag,
          companyTag as (typeof schema.companyTagEnum.enumValues)[number]
        )
      );
    }
    if (search) {
      const pattern = `%${search}%`
      conditions.push(
        or(ilike(schema.leads.contactName, pattern), ilike(schema.leads.companyName, pattern))!
      );
    }

    const rows = await db
      .select()
      .from(schema.leads)
      .where(and(...conditions))
      .orderBy(desc(schema.leads.updatedAt))
      .limit(200);

    return NextResponse.json(rows);
  } catch (error) {
    captureError(error);
    return NextResponse.json(
      { error: "Failed to fetch leads" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
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

    let rawBody: unknown;
    try {
      rawBody = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }

    const parsed = leadSchema.safeParse(rawBody);
    if (!parsed.success) {
      const firstError = parsed.error.errors[0];
      return NextResponse.json(
        { error: "Validation failed", field: firstError?.path?.join("."), message: firstError?.message },
        { status: 400 }
      );
    }

    const body = parsed.data;

    const [lead] = await db
      .insert(schema.leads)
      .values({
        contactName: body.contactName,
        companyName: body.companyName ?? null,
        email: body.email ?? null,
        phone: body.phone ?? null,
        linkedinUrl: body.linkedinUrl ?? null,
        website: body.website ?? null,
        stage: body.stage ?? "awareness",
        source: body.source ?? null,
        assignedTo: body.assignedTo ?? null,
        estimatedValue: body.estimatedValue ?? null,
        probability: body.probability ?? null,
        expectedCloseDate: body.expectedCloseDate ?? null,
        industry: body.industry ?? null,
        companySize: body.companySize ?? null,
        notes: body.notes ?? null,
        tags: body.tags as typeof schema.leads.$inferInsert.tags ?? null,
        companyTag: body.companyTag ?? "am_collective",
        nextFollowUpAt: body.nextFollowUpAt
          ? new Date(body.nextFollowUpAt)
          : null,
      })
      .returning();

    await db.insert(schema.leadActivities).values({
      leadId: lead.id,
      type: "note",
      content: "Lead created",
      createdById: userId,
    });

    await createAuditLog({
      actorId: userId,
      actorType: "user",
      action: "lead.created",
      entityType: "lead",
      entityId: lead.id,
      metadata: { contactName: lead.contactName, stage: lead.stage },
    });

    return NextResponse.json(lead, { status: 201 });
  } catch (error) {
    captureError(error);
    return NextResponse.json(
      { error: "Failed to create lead" },
      { status: 500 }
    );
  }
}
