/**
 * GET  /api/proposals — List all proposals.
 * POST /api/proposals — Create a new proposal.
 */

import { NextResponse } from "next/server";
import { checkAdmin } from "@/lib/auth";
import { captureError } from "@/lib/errors";
import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { eq, desc } from "drizzle-orm";
import { createAuditLog } from "@/lib/db/repositories/audit";
import { generateProposalNumber } from "@/lib/invoices/number";

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
      .orderBy(desc(schema.proposals.createdAt));

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

export async function POST(req: Request) {
  try {
    const userId = await checkAdmin();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const proposalNumber = await generateProposalNumber();

    const [proposal] = await db
      .insert(schema.proposals)
      .values({
        clientId: body.clientId,
        companyTag: body.companyTag ?? "am_collective",
        title: body.title,
        proposalNumber,
        summary: body.summary ?? null,
        scope: body.scope ?? null,
        deliverables: body.deliverables ?? null,
        timeline: body.timeline ?? null,
        lineItems: body.lineItems ?? null,
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
