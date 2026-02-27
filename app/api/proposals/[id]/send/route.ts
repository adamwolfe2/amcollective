/**
 * POST /api/proposals/[id]/send — Send proposal to client via email.
 */

import { NextResponse } from "next/server";
import { checkAdmin } from "@/lib/auth";
import { captureError } from "@/lib/errors";
import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { createAuditLog } from "@/lib/db/repositories/audit";
import { notifySlack } from "@/lib/webhooks/slack";
import { Resend } from "resend";

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const userId = await checkAdmin();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;

    const [result] = await db
      .select({
        proposal: schema.proposals,
        clientName: schema.clients.name,
        clientEmail: schema.clients.email,
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

    const { proposal, clientEmail, clientName } = result;

    // Update status
    await db
      .update(schema.proposals)
      .set({ status: "sent", sentAt: new Date() })
      .where(eq(schema.proposals.id, id));

    // Send email
    const resend = process.env.RESEND_API_KEY
      ? new Resend(process.env.RESEND_API_KEY)
      : null;

    if (resend && clientEmail) {
      const from =
        process.env.RESEND_FROM_EMAIL ||
        "AM Collective <team@amcollectivecapital.com>";

      const proposalUrl = `${process.env.NEXT_PUBLIC_APP_URL || "https://amcollective.vercel.app"}/proposals/${id}`;

      await resend.emails.send({
        from,
        to: clientEmail,
        subject: `Your proposal from AM Collective — ${proposal.proposalNumber}`,
        html: buildProposalEmail({
          title: proposal.title,
          number: proposal.proposalNumber,
          clientName: clientName ?? "there",
          summary: proposal.summary,
          total: proposal.total,
          validUntil: proposal.validUntil,
          proposalUrl,
        }),
      });
    }

    await createAuditLog({
      actorId: userId,
      actorType: "user",
      action: "send",
      entityType: "proposal",
      entityId: id,
      metadata: { clientEmail, proposalNumber: proposal.proposalNumber },
    });

    await notifySlack(
      `Proposal ${proposal.proposalNumber} sent to ${clientName ?? "Unknown"} — $${((proposal.total ?? 0) / 100).toFixed(0)}`
    );

    return NextResponse.json({ success: true });
  } catch (error) {
    captureError(error, {
      tags: { source: "api", route: "proposals/[id]/send" },
      level: "error",
    });
    return NextResponse.json(
      { error: "Failed to send proposal" },
      { status: 500 }
    );
  }
}

// ─── Email Template ──────────────────────────────────────────────────────────

function buildProposalEmail(data: {
  title: string;
  number: string;
  clientName: string;
  summary: string | null;
  total: number | null;
  validUntil: string | null;
  proposalUrl: string;
}): string {
  const totalStr = data.total
    ? `$${(data.total / 100).toLocaleString("en-US", { minimumFractionDigits: 2 })}`
    : "";

  return `<!DOCTYPE html>
<html>
<body style="font-family: Georgia, serif; max-width: 600px; margin: 0 auto; padding: 40px 20px; color: #0A0A0A;">
  <p style="font-family: monospace; font-size: 12px; color: #666; margin-bottom: 32px;">
    AM COLLECTIVE CAPITAL
  </p>

  <h1 style="font-size: 24px; font-weight: normal; margin-bottom: 8px;">
    ${data.title}
  </h1>

  <p style="font-family: monospace; font-size: 12px; color: #666; margin-bottom: 24px;">
    ${data.number}
  </p>

  <p style="font-size: 15px; line-height: 1.6; margin-bottom: 24px;">
    Hi ${data.clientName},
  </p>

  ${data.summary ? `<p style="font-size: 15px; line-height: 1.6; margin-bottom: 24px;">${data.summary.slice(0, 300)}</p>` : ""}

  ${totalStr ? `
  <div style="border: 2px solid #0A0A0A; padding: 16px 20px; margin-bottom: 24px;">
    <p style="font-family: monospace; font-size: 11px; color: #666; margin: 0 0 4px 0;">TOTAL</p>
    <p style="font-family: monospace; font-size: 24px; font-weight: bold; margin: 0;">${totalStr}</p>
  </div>` : ""}

  ${data.validUntil ? `<p style="font-family: monospace; font-size: 12px; color: #666; margin-bottom: 24px;">Valid until: ${data.validUntil}</p>` : ""}

  <a href="${data.proposalUrl}" style="display:inline-block;background:#0A0A0A;color:#fff;
     padding:14px 32px;font-family:monospace;font-size:14px;text-decoration:none;">
    Review &amp; Approve Proposal
  </a>

  <hr style="margin: 48px 0; border: none; border-top: 1px solid #eee;" />
  <p style="font-family: monospace; font-size: 11px; color: #999;">
    AM Collective Capital &middot; team@amcollectivecapital.com
  </p>
</body>
</html>`;
}
