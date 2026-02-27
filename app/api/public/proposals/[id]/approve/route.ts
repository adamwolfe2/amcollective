/**
 * POST /api/public/proposals/[id]/approve — Client approves a proposal (no admin auth).
 */

import { NextResponse } from "next/server";
import { captureError } from "@/lib/errors";
import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { createAuditLog } from "@/lib/db/repositories/audit";
import { notifySlack } from "@/lib/webhooks/slack";
import { notifyAdmins } from "@/lib/db/repositories/notifications";

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const [result] = await db
      .select({
        proposal: schema.proposals,
        clientName: schema.clients.name,
      })
      .from(schema.proposals)
      .leftJoin(
        schema.clients,
        eq(schema.proposals.clientId, schema.clients.id)
      )
      .where(eq(schema.proposals.id, id))
      .limit(1);

    if (!result) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const { proposal, clientName } = result;

    if (proposal.status === "approved") {
      return NextResponse.json({ error: "Already approved" }, { status: 400 });
    }

    if (!["draft", "sent", "viewed"].includes(proposal.status)) {
      return NextResponse.json(
        { error: "Proposal cannot be approved in current state" },
        { status: 400 }
      );
    }

    // Update status
    await db
      .update(schema.proposals)
      .set({ status: "approved", approvedAt: new Date() })
      .where(eq(schema.proposals.id, id));

    // Audit log
    await createAuditLog({
      actorId: "client",
      actorType: "system",
      action: "approve",
      entityType: "proposal",
      entityId: id,
      metadata: {
        proposalNumber: proposal.proposalNumber,
        clientName,
        total: proposal.total,
      },
    });

    // Slack notification
    await notifySlack(
      `Proposal ${proposal.proposalNumber} approved by ${clientName ?? "Unknown"} — $${((proposal.total ?? 0) / 100).toFixed(0)}`
    );

    // In-app notification
    await notifyAdmins({
      type: "general",
      title: `Proposal ${proposal.proposalNumber} approved`,
      message: `${clientName ?? "Unknown"} approved — $${((proposal.total ?? 0) / 100).toFixed(2)}`,
      link: "/proposals",
    });

    return NextResponse.json({ success: true, status: "approved" });
  } catch (error) {
    captureError(error, {
      tags: { source: "api", route: "public/proposals/[id]/approve" },
      level: "error",
    });
    return NextResponse.json(
      { error: "Failed to approve proposal" },
      { status: 500 }
    );
  }
}
