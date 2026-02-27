/**
 * GET /api/public/proposals/[id] — Public proposal data (no auth required).
 */

import { NextResponse } from "next/server";
import { captureError } from "@/lib/errors";
import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { eq } from "drizzle-orm";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const [result] = await db
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
      .where(eq(schema.proposals.id, id))
      .limit(1);

    if (!result) {
      return NextResponse.json({ error: "Proposal not found" }, { status: 404 });
    }

    // Don't expose internal notes
    const { proposal, clientName, clientCompany } = result;
    return NextResponse.json({
      id: proposal.id,
      title: proposal.title,
      proposalNumber: proposal.proposalNumber,
      status: proposal.status,
      summary: proposal.summary,
      scope: proposal.scope,
      deliverables: proposal.deliverables,
      timeline: proposal.timeline,
      lineItems: proposal.lineItems,
      subtotal: proposal.subtotal,
      taxRate: proposal.taxRate,
      taxAmount: proposal.taxAmount,
      total: proposal.total,
      paymentTerms: proposal.paymentTerms,
      validUntil: proposal.validUntil,
      approvedAt: proposal.approvedAt,
      rejectedAt: proposal.rejectedAt,
      clientName,
      clientCompany,
    });
  } catch (error) {
    captureError(error, {
      tags: { source: "api", route: "public/proposals/[id]" },
      level: "error",
    });
    return NextResponse.json(
      { error: "Failed to fetch proposal" },
      { status: 500 }
    );
  }
}
