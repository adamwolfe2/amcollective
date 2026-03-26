/**
 * GET  /api/public/contracts/[token]       -- view contract (public)
 * POST /api/public/contracts/[token]/sign  -- sign contract (public)
 */

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { captureError } from "@/lib/errors";
import { createAuditLog } from "@/lib/db/repositories/audit";
import { createNotification } from "@/lib/db/repositories/notifications";
import { fireEvent } from "@/lib/webhooks/events";
import { generateInvoiceNumber } from "@/lib/invoices/number";
import { ajWebhook } from "@/lib/middleware/arcjet";

type RouteContext = { params: Promise<{ token: string }> };

export async function GET(_request: NextRequest, ctx: RouteContext) {
  try {
    const { token } = await ctx.params;

    const [row] = await db
      .select({
        contract: schema.contracts,
        clientName: schema.clients.name,
        clientCompany: schema.clients.companyName,
      })
      .from(schema.contracts)
      .leftJoin(
        schema.clients,
        eq(schema.contracts.clientId, schema.clients.id)
      )
      .where(eq(schema.contracts.token, token))
      .limit(1);

    if (!row) {
      return NextResponse.json(
        { error: "Contract not found" },
        { status: 404 }
      );
    }

    // Mark as viewed if sent
    if (
      row.contract.status === "sent" &&
      !row.contract.viewedAt
    ) {
      await db
        .update(schema.contracts)
        .set({ viewedAt: new Date(), status: "viewed" })
        .where(eq(schema.contracts.id, row.contract.id));
    }

    // Remove sensitive fields for public view
    const { token: _token, signerIp: _signerIp, signerUserAgent: _signerUserAgent, ...safeContract } =
      row.contract;

    return NextResponse.json({
      ...safeContract,
      clientName: row.clientName,
      clientCompany: row.clientCompany,
    });
  } catch (error) {
    captureError(error);
    return NextResponse.json(
      { error: "Failed to fetch contract" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest, ctx: RouteContext) {
  if (ajWebhook) {
    const decision = await ajWebhook.protect(request, { requested: 1 });
    if (decision.isDenied()) {
      return NextResponse.json({ error: "Rate limited" }, { status: 429 });
    }
  }

  try {
    const { token } = await ctx.params;
    const body = await request.json();

    const [contract] = await db
      .select()
      .from(schema.contracts)
      .where(eq(schema.contracts.token, token))
      .limit(1);

    if (!contract) {
      return NextResponse.json(
        { error: "Contract not found" },
        { status: 404 }
      );
    }

    // Validate state
    if (!["sent", "viewed"].includes(contract.status)) {
      return NextResponse.json(
        { error: "Contract cannot be signed in its current state" },
        { status: 400 }
      );
    }

    if (contract.expiresAt && contract.expiresAt < new Date()) {
      await db
        .update(schema.contracts)
        .set({ status: "expired" })
        .where(eq(schema.contracts.id, contract.id));
      return NextResponse.json(
        { error: "Signing link has expired" },
        { status: 410 }
      );
    }

    // Get signer info from headers
    const ip =
      request.headers.get("x-forwarded-for") ??
      request.headers.get("x-real-ip") ??
      "unknown";
    const userAgent = request.headers.get("user-agent") ?? "unknown";

    // Update contract with signature
    const [signed] = await db
      .update(schema.contracts)
      .set({
        status: "signed",
        signedAt: new Date(),
        signatureData: body.signatureData ?? null,
        clientSignatoryName: body.signatoryName ?? null,
        clientSignatoryTitle: body.signatoryTitle ?? null,
        signerIp: ip,
        signerUserAgent: userAgent,
      })
      .where(eq(schema.contracts.id, contract.id))
      .returning();

    // Auto-create invoice if configured — non-blocking, contract is already signed
    if (contract.autoInvoiceOnSign && contract.proposalId) {
      try {
        const [proposal] = await db
          .select()
          .from(schema.proposals)
          .where(eq(schema.proposals.id, contract.proposalId))
          .limit(1);

        if (proposal) {
          const invoiceNumber = await generateInvoiceNumber();
          const dueDate = new Date();
          dueDate.setDate(dueDate.getDate() + 30);

          const [invoice] = await db
            .insert(schema.invoices)
            .values({
              clientId: contract.clientId,
              number: invoiceNumber,
              status: "draft",
              lineItems: proposal.lineItems,
              subtotal: proposal.subtotal ?? 0,
              taxRate: proposal.taxRate ?? 0,
              taxAmount: proposal.taxAmount ?? 0,
              amount: proposal.total ?? 0,
              dueDate,
              notes: `Pursuant to contract ${contract.contractNumber}`,
            })
            .returning();

          await db
            .update(schema.contracts)
            .set({ invoiceId: invoice.id })
            .where(eq(schema.contracts.id, contract.id));
        }
      } catch (invoiceErr) {
        // Log but don't fail the signing response — contract is already committed
        captureError(invoiceErr, {
          tags: { route: "contract-sign-auto-invoice", contractId: contract.id },
        });
      }
    }

    // Notify admin
    const SUPER_ADMIN_USER_IDS = (process.env.SUPER_ADMIN_USER_IDS || "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);

    for (const adminId of SUPER_ADMIN_USER_IDS) {
      await createNotification({
        userId: adminId,
        type: "general",
        title: `Contract signed: ${contract.contractNumber}`,
        message: `${body.signatoryName ?? "Client"} signed ${contract.title}. Ready for countersignature.`,
        link: `/contracts/${contract.id}`,
      });
    }

    // Fire webhook
    await fireEvent("contract.signed", {
      contractId: contract.id,
      contractNumber: contract.contractNumber,
    });

    await createAuditLog({
      actorId: "public",
      actorType: "user",
      action: "contract.signed",
      entityType: "contract",
      entityId: contract.id,
      metadata: {
        signatoryName: body.signatoryName,
        ip,
      },
    });

    return NextResponse.json({
      signed: true,
      contractId: signed.id,
    });
  } catch (error) {
    captureError(error);
    return NextResponse.json(
      { error: "Failed to sign contract" },
      { status: 500 }
    );
  }
}
