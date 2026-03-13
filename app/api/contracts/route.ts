/**
 * GET  /api/contracts  -- list contracts
 * POST /api/contracts  -- create contract (manual or from proposal)
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { desc, eq } from "drizzle-orm";
import { checkAdmin } from "@/lib/auth";
import { captureError } from "@/lib/errors";
import { createAuditLog } from "@/lib/db/repositories/audit";
import { generateContractNumber } from "@/lib/invoices/number";
import { buildSectionsFromProposal, DEFAULT_CONTRACT_SECTIONS } from "@/lib/contracts/templates";
import crypto from "crypto";
import { aj } from "@/lib/middleware/arcjet";

const companyTags = ["trackr", "wholesail", "taskspace", "cursive", "tbgc", "hook", "am_collective", "personal", "untagged"] as const;

const contractSchema = z.object({
  clientId: z.string().uuid("Invalid client ID"),
  proposalId: z.string().uuid().optional().nullable(),
  companyTag: z.enum(companyTags).optional(),
  title: z.string().min(1).max(500).trim().optional(),
  sections: z.unknown().optional(),
  terms: z.string().max(50000).optional().nullable(),
  totalValue: z.number().min(0).max(100_000_000).optional().nullable(),
  startDate: z.string().optional().nullable(),
  endDate: z.string().optional().nullable(),
  autoInvoiceOnSign: z.boolean().optional(),
});

export async function GET() {
  try {
    const userId = await checkAdmin();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const rows = await db
      .select({
        contract: schema.contracts,
        clientName: schema.clients.name,
        clientCompany: schema.clients.companyName,
      })
      .from(schema.contracts)
      .leftJoin(schema.clients, eq(schema.contracts.clientId, schema.clients.id))
      .orderBy(desc(schema.contracts.createdAt))
      .limit(100);

    return NextResponse.json(rows);
  } catch (error) {
    captureError(error);
    return NextResponse.json({ error: "Failed to fetch contracts" }, { status: 500 });
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

    const parsed = contractSchema.safeParse(rawBody);
    if (!parsed.success) {
      const firstError = parsed.error.errors[0];
      return NextResponse.json(
        { error: "Validation failed", field: firstError?.path?.join("."), message: firstError?.message },
        { status: 400 }
      );
    }

    const body = parsed.data;
    const contractNumber = await generateContractNumber();
    const token = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + 30 * 86400000); // 30 days

    let sections = DEFAULT_CONTRACT_SECTIONS;

    // If created from a proposal, build sections from it
    if (body.proposalId) {
      const [proposal] = await db
        .select()
        .from(schema.proposals)
        .where(eq(schema.proposals.id, body.proposalId))
        .limit(1);

      if (proposal) {
        sections = buildSectionsFromProposal(proposal);
      }
    }

    const [contract] = await db
      .insert(schema.contracts)
      .values({
        clientId: body.clientId,
        proposalId: body.proposalId ?? null,
        companyTag: body.companyTag ?? "am_collective",
        contractNumber,
        title: body.title ?? "Service Agreement",
        sections: (body.sections ?? sections) as typeof schema.contracts.$inferInsert.sections,
        terms: body.terms ?? null,
        totalValue: body.totalValue ?? null,
        startDate: body.startDate ?? null,
        endDate: body.endDate ?? null,
        token,
        expiresAt,
        autoInvoiceOnSign: body.autoInvoiceOnSign ?? true,
      })
      .returning();

    await createAuditLog({
      actorId: userId,
      actorType: "user",
      action: "contract.created",
      entityType: "contract",
      entityId: contract.id,
      metadata: { contractNumber, proposalId: body.proposalId },
    });

    return NextResponse.json(contract, { status: 201 });
  } catch (error) {
    captureError(error);
    return NextResponse.json({ error: "Failed to create contract" }, { status: 500 });
  }
}
