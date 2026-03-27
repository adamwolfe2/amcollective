/**
 * GET /api/public/proposals/[id] — Public proposal data (no auth required).
 *
 * Only returns proposals that have been explicitly sent to a client
 * (status != "draft"). This prevents enumeration of draft proposals.
 */

import { NextRequest, NextResponse } from "next/server";
import { captureError } from "@/lib/errors";
import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { eq, ne, and } from "drizzle-orm";
import { ajWebhook } from "@/lib/middleware/arcjet";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (ajWebhook) {
    const decision = await ajWebhook.protect(req, { requested: 1 });
    if (decision.isDenied()) {
      return NextResponse.json({ error: "Rate limited" }, { status: 429 });
    }
  }

  try {
    const { id } = await params;

    // Validate UUID format to prevent enumeration probes
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(id)) {
      return NextResponse.json({ error: "Proposal not found" }, { status: 404 });
    }

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
      .where(
        and(
          eq(schema.proposals.id, id),
          ne(schema.proposals.status, "draft")
        )
      )
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
