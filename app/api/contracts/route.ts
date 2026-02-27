/**
 * GET  /api/contracts  -- list contracts
 * POST /api/contracts  -- create contract (manual or from proposal)
 */

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { desc, eq } from "drizzle-orm";
import { checkAdmin } from "@/lib/auth";
import { captureError } from "@/lib/errors";
import { createAuditLog } from "@/lib/db/repositories/audit";
import { generateContractNumber } from "@/lib/invoices/number";
import { buildSectionsFromProposal, DEFAULT_CONTRACT_SECTIONS } from "@/lib/contracts/templates";
import crypto from "crypto";

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
  try {
    const userId = await checkAdmin();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
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
        sections: body.sections ?? sections,
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
