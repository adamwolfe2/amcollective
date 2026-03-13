/**
 * GET  /api/recurring — List all recurring invoice templates.
 * POST /api/recurring — Create a new recurring template.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { checkAdmin } from "@/lib/auth";
import { captureError } from "@/lib/errors";
import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { eq, desc } from "drizzle-orm";
import { createAuditLog } from "@/lib/db/repositories/audit";
import { aj } from "@/lib/middleware/arcjet";

const companyTags = ["trackr", "wholesail", "taskspace", "cursive", "tbgc", "hook", "am_collective", "personal", "untagged"] as const;

const recurringSchema = z.object({
  clientId: z.string().uuid("Invalid client ID"),
  companyTag: z.enum(companyTags).optional(),
  lineItems: z.unknown(),
  subtotal: z.number().min(0).max(10_000_000),
  taxRate: z.number().min(0).max(100).optional(),
  taxAmount: z.number().min(0).max(10_000_000).optional(),
  total: z.number().min(0).max(10_000_000),
  paymentTerms: z.string().max(500).optional(),
  notes: z.string().max(5000).optional().nullable(),
  interval: z.enum(["weekly", "biweekly", "monthly", "quarterly", "annual"]),
  startDate: z.string().min(1, "Start date is required"),
  endDate: z.string().optional().nullable(),
  autoSend: z.boolean().optional(),
});

export async function GET() {
  try {
    const userId = await checkAdmin();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const templates = await db
      .select({
        template: schema.recurringInvoices,
        clientName: schema.clients.name,
        clientCompany: schema.clients.companyName,
      })
      .from(schema.recurringInvoices)
      .leftJoin(
        schema.clients,
        eq(schema.recurringInvoices.clientId, schema.clients.id)
      )
      .orderBy(desc(schema.recurringInvoices.createdAt))
      .limit(500);

    return NextResponse.json(templates);
  } catch (error) {
    captureError(error, {
      tags: { source: "api", route: "recurring" },
      level: "error",
    });
    return NextResponse.json(
      { error: "Failed to fetch recurring invoices" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  if (aj) {
    const decision = await aj.protect(req, { requested: 1 });
    if (decision.isDenied()) {
      return NextResponse.json({ error: "Too many requests" }, { status: 429 });
    }
  }

  try {
    const userId = await checkAdmin();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    let rawBody: unknown;
    try {
      rawBody = await req.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }

    const parsed = recurringSchema.safeParse(rawBody);
    if (!parsed.success) {
      const firstError = parsed.error.errors[0];
      return NextResponse.json(
        { error: "Validation failed", field: firstError?.path?.join("."), message: firstError?.message },
        { status: 400 }
      );
    }

    const body = parsed.data;

    const [template] = await db
      .insert(schema.recurringInvoices)
      .values({
        clientId: body.clientId,
        companyTag: body.companyTag ?? "am_collective",
        lineItems: body.lineItems as typeof schema.recurringInvoices.$inferInsert.lineItems,
        subtotal: body.subtotal,
        taxRate: body.taxRate ?? 0,
        taxAmount: body.taxAmount ?? 0,
        total: body.total,
        paymentTerms: body.paymentTerms ?? "Net 30",
        notes: body.notes ?? null,
        interval: body.interval,
        startDate: body.startDate,
        endDate: body.endDate ?? null,
        nextBillingDate: body.startDate,
        autoSend: body.autoSend ?? true,
      })
      .returning();

    await createAuditLog({
      actorId: userId,
      actorType: "user",
      action: "create",
      entityType: "recurring_invoice",
      entityId: template.id,
      metadata: {
        clientId: body.clientId,
        interval: body.interval,
        total: body.total,
      },
    });

    return NextResponse.json(template, { status: 201 });
  } catch (error) {
    captureError(error, {
      tags: { source: "api", route: "recurring" },
      level: "error",
    });
    return NextResponse.json(
      { error: "Failed to create recurring invoice" },
      { status: 500 }
    );
  }
}
