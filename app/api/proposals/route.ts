/**
 * GET  /api/proposals — List all proposals.
 * POST /api/proposals — Create a new proposal.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { checkAdmin } from "@/lib/auth";
import { captureError } from "@/lib/errors";
import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { eq, desc } from "drizzle-orm";
import { createAuditLog } from "@/lib/db/repositories/audit";
import { generateProposalNumber } from "@/lib/invoices/number";
import { aj } from "@/lib/middleware/arcjet";

const companyTags = ["trackr", "wholesail", "taskspace", "cursive", "tbgc", "hook", "am_collective", "personal", "untagged"] as const;

const proposalSchema = z.object({
  clientId: z.string().uuid(),
  companyTag: z.enum(companyTags).optional(),
  title: z.string().min(1).max(500).trim(),
  summary: z.string().max(10000).optional().nullable(),
  scope: z.unknown().optional().nullable(),
  deliverables: z.unknown().optional().nullable(),
  timeline: z.unknown().optional().nullable(),
  lineItems: z.unknown().optional().nullable(),
  subtotal: z.number().min(0).max(100_000_000).optional().nullable(),
  taxRate: z.number().min(0).max(100).optional(),
  taxAmount: z.number().min(0).max(100_000_000).optional(),
  total: z.number().min(0).max(100_000_000).optional().nullable(),
  paymentTerms: z.string().max(1000).optional(),
  validUntil: z.string().optional().nullable(),
  internalNotes: z.string().max(5000).optional().nullable(),
});

export async function GET() {
  try {
    const userId = await checkAdmin();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const rows = await db
      .select({
        proposal: schema.proposals,
        clientName: schema.clients.name,
        clientCompany: schema.clients.companyName,
      })
      .from(schema.proposals)
      .leftJoin(
        schema.clients,
        eq(schema.proposals.clientId, schema.clients.id)
      )
      .orderBy(desc(schema.proposals.createdAt))
      .limit(500);

    return NextResponse.json(rows);
  } catch (error) {
    captureError(error, {
      tags: { source: "api", route: "proposals" },
      level: "error",
    });
    return NextResponse.json(
      { error: "Failed to fetch proposals" },
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

  try {
    const userId = await checkAdmin();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    let rawBody: unknown;
    try {
      rawBody = await req.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }

    const parsed = proposalSchema.safeParse(rawBody);
    if (!parsed.success) {
      const firstError = parsed.error.errors[0];
      return NextResponse.json(
        { error: "Validation failed", field: firstError?.path?.join("."), message: firstError?.message },
        { status: 400 }
      );
    }

    const body = parsed.data;
    const proposalNumber = await generateProposalNumber();

    const [proposal] = await db
      .insert(schema.proposals)
      .values({
        clientId: body.clientId,
        companyTag: body.companyTag ?? "am_collective",
        title: body.title,
        proposalNumber,
        summary: body.summary ?? null,
        scope: (body.scope ?? null) as typeof schema.proposals.$inferInsert.scope,
        deliverables: (body.deliverables ?? null) as typeof schema.proposals.$inferInsert.deliverables,
        timeline: (body.timeline as string) ?? null,
        lineItems: (body.lineItems ?? null) as typeof schema.proposals.$inferInsert.lineItems,
        subtotal: body.subtotal ?? null,
        taxRate: body.taxRate ?? 0,
        taxAmount: body.taxAmount ?? 0,
        total: body.total ?? null,
        paymentTerms: body.paymentTerms ?? "50% upfront, 50% on delivery",
        validUntil: body.validUntil ?? null,
        internalNotes: body.internalNotes ?? null,
      })
      .returning();

    await createAuditLog({
      actorId: userId,
      actorType: "user",
      action: "create",
      entityType: "proposal",
      entityId: proposal.id,
      metadata: {
        proposalNumber,
        clientId: body.clientId,
        total: body.total,
      },
    });

    return NextResponse.json(proposal, { status: 201 });
  } catch (error) {
    captureError(error, {
      tags: { source: "api", route: "proposals" },
      level: "error",
    });
    return NextResponse.json(
      { error: "Failed to create proposal" },
      { status: 500 }
    );
  }
}
