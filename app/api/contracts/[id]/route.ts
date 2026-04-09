/**
 * GET    /api/contracts/[id]  -- contract detail
 * PATCH  /api/contracts/[id]  -- update contract (send, countersign, etc.)
 * DELETE /api/contracts/[id]  -- terminate contract
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { checkAdmin } from "@/lib/auth";
import { captureError } from "@/lib/errors";
import { createAuditLog } from "@/lib/db/repositories/audit";
import { sendContractEmail, sendContractExecutedEmail } from "@/lib/email/notifications";
import { after } from "next/server";
import { aj } from "@/lib/middleware/arcjet";

const contractUpdateSchema = z.object({
  status: z.enum(["draft", "sent", "signed", "active", "terminated", "expired"]),
  title: z.string().min(1).max(500).trim(),
  sections: z.array(z.object({
    heading: z.string().max(500),
    body: z.string().max(50000),
  })),
  terms: z.string().max(50000).nullable(),
  totalValue: z.number().int().min(0),
  startDate: z.string().nullable(),
  endDate: z.string().nullable(),
  autoInvoiceOnSign: z.boolean(),
  action: z.enum(["send", "countersign", "terminate"]),
}).partial().refine(data => Object.keys(data).length > 0, "At least one field required");

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

    // Strip sensitive signing metadata from admin GET response
    const { token: _token, signerIp: _signerIp, signerUserAgent: _signerUserAgent, ...safeContract } = row.contract;

    return NextResponse.json({ ...row, contract: safeContract }, {
      headers: { "Cache-Control": "private, max-age=60, stale-while-revalidate=120" },
    });
  } catch (error) {
    captureError(error);
    return NextResponse.json({ error: "Failed to fetch contract" }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest, ctx: RouteContext) {
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

    const { id } = await ctx.params;
    const body = await request.json();

    const parsed = contractUpdateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const data = parsed.data;
    const updates: Record<string, unknown> = {};

    if (data.status !== undefined) updates.status = data.status;
    if (data.title !== undefined) updates.title = data.title;
    if (data.sections !== undefined) updates.sections = data.sections;
    if (data.terms !== undefined) updates.terms = data.terms;
    if (data.totalValue !== undefined) updates.totalValue = data.totalValue;
    if (data.startDate !== undefined) updates.startDate = data.startDate;
    if (data.endDate !== undefined) updates.endDate = data.endDate;
    if (data.autoInvoiceOnSign !== undefined)
      updates.autoInvoiceOnSign = data.autoInvoiceOnSign;

    // Handle send action
    if (data.action === "send") {
      updates.status = "sent";
      updates.sentAt = new Date();
    }

    // Handle countersign action
    if (data.action === "countersign") {
      updates.status = "active";
      updates.countersignedAt = new Date();
    }

    // Handle terminate action
    if (data.action === "terminate") {
      updates.status = "terminated";
    }

    // Fetch client email before update (needed for send/countersign emails)
    const needsEmail = data.action === "send" || data.status === "sent";
    const needsCountersignEmail = data.action === "countersign";
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
      action: `contract.${data.action ?? "updated"}`,
      entityType: "contract",
      entityId: id,
      metadata: data,
    });

    return NextResponse.json(updated);
  } catch (error) {
    captureError(error);
    return NextResponse.json({ error: "Failed to update contract" }, { status: 500 });
  }
}
