/**
 * GET    /api/contracts/[id]  -- contract detail
 * PATCH  /api/contracts/[id]  -- update contract (send, countersign, etc.)
 * DELETE /api/contracts/[id]  -- terminate contract
 */

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { checkAdmin } from "@/lib/auth";
import { captureError } from "@/lib/errors";
import { createAuditLog } from "@/lib/db/repositories/audit";
import { sendContractEmail, sendContractExecutedEmail } from "@/lib/email/notifications";
import { after } from "next/server";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: NextRequest, ctx: RouteContext) {
  try {
    const userId = await checkAdmin();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await ctx.params;

    const [row] = await db
      .select({
        contract: schema.contracts,
        clientName: schema.clients.name,
        clientCompany: schema.clients.companyName,
        clientEmail: schema.clients.email,
      })
      .from(schema.contracts)
      .leftJoin(schema.clients, eq(schema.contracts.clientId, schema.clients.id))
      .where(eq(schema.contracts.id, id))
      .limit(1);

    if (!row) {
      return NextResponse.json({ error: "Contract not found" }, { status: 404 });
    }

    return NextResponse.json(row);
  } catch (error) {
    captureError(error);
    return NextResponse.json({ error: "Failed to fetch contract" }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest, ctx: RouteContext) {
  try {
    const userId = await checkAdmin();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await ctx.params;
    const body = await request.json();

    const updates: Record<string, unknown> = {};

    if (body.status !== undefined) updates.status = body.status;
    if (body.title !== undefined) updates.title = body.title;
    if (body.sections !== undefined) updates.sections = body.sections;
    if (body.terms !== undefined) updates.terms = body.terms;
    if (body.totalValue !== undefined) updates.totalValue = body.totalValue;
    if (body.startDate !== undefined) updates.startDate = body.startDate;
    if (body.endDate !== undefined) updates.endDate = body.endDate;
    if (body.autoInvoiceOnSign !== undefined)
      updates.autoInvoiceOnSign = body.autoInvoiceOnSign;

    // Handle send action
    if (body.action === "send") {
      updates.status = "sent";
      updates.sentAt = new Date();
    }

    // Handle countersign action
    if (body.action === "countersign") {
      updates.status = "active";
      updates.countersignedAt = new Date();
    }

    // Handle terminate action
    if (body.action === "terminate") {
      updates.status = "terminated";
    }

    // Fetch client email before update (needed for send/countersign emails)
    const needsEmail = body.action === "send" || body.status === "sent";
    const needsCountersignEmail = body.action === "countersign";
    let clientRow: { clientName: string | null; clientEmail: string | null } | null = null;
    if (needsEmail || needsCountersignEmail) {
      const [found] = await db
        .select({
          clientName: schema.clients.name,
          clientEmail: schema.clients.email,
        })
        .from(schema.contracts)
        .leftJoin(schema.clients, eq(schema.contracts.clientId, schema.clients.id))
        .where(eq(schema.contracts.id, id))
        .limit(1);
      clientRow = found ?? null;
    }

    const [updated] = await db
      .update(schema.contracts)
      .set(updates)
      .where(eq(schema.contracts.id, id))
      .returning();

    if (!updated) {
      return NextResponse.json({ error: "Contract not found" }, { status: 404 });
    }

    // Send signing link email when contract is sent to client
    if (needsEmail && clientRow?.clientEmail) {
      const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://amcollective.vercel.app";
      const signingUrl = `${appUrl}/contracts/sign/${updated.token}`;
      after(async () => {
        try {
          await sendContractEmail({
            clientName: clientRow.clientName ?? "Client",
            clientEmail: clientRow.clientEmail!,
            contractTitle: updated.title,
            contractNumber: updated.contractNumber,
            signingUrl,
            totalValue: updated.totalValue,
            expiresAt: updated.expiresAt,
          });
        } catch (emailErr) {
          captureError(emailErr, { tags: { route: "contract-send-email", contractId: id } });
        }
      });
    }

    // Send countersign confirmation email to client
    if (needsCountersignEmail && clientRow?.clientEmail) {
      after(async () => {
        try {
          await sendContractExecutedEmail({
            clientName: clientRow.clientName ?? "Client",
            clientEmail: clientRow.clientEmail!,
            contractTitle: updated.title,
            contractNumber: updated.contractNumber,
            startDate: updated.startDate,
          });
        } catch (emailErr) {
          captureError(emailErr, { tags: { route: "contract-countersign-email", contractId: id } });
        }
      });
    }

    await createAuditLog({
      actorId: userId,
      actorType: "user",
      action: `contract.${body.action ?? "updated"}`,
      entityType: "contract",
      entityId: id,
      metadata: body,
    });

    return NextResponse.json(updated);
  } catch (error) {
    captureError(error);
    return NextResponse.json({ error: "Failed to update contract" }, { status: 500 });
  }
}
