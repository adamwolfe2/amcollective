/**
 * POST /api/recurring/[id]/generate — Manually trigger invoice generation for a specific recurring template.
 *
 * Sends a billing/generate-recurring-invoices event scoped to a single template ID,
 * so the Inngest job processes only that rule immediately.
 */

import { NextRequest, NextResponse } from "next/server";
import { checkAdmin } from "@/lib/auth";
import { captureError } from "@/lib/errors";
import { inngest } from "@/lib/inngest/client";
import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { createAuditLog } from "@/lib/db/repositories/audit";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const userId = await checkAdmin();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;

    // Verify the template exists and is active
    const [template] = await db
      .select({ id: schema.recurringInvoices.id, status: schema.recurringInvoices.status })
      .from(schema.recurringInvoices)
      .where(eq(schema.recurringInvoices.id, id))
      .limit(1);

    if (!template) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    if (template.status !== "active") {
      return NextResponse.json(
        { error: "Only active templates can be manually triggered" },
        { status: 422 }
      );
    }

    await inngest.send({
      name: "billing/generate-recurring-invoices",
      data: { templateId: id, triggeredBy: userId },
    });

    await createAuditLog({
      actorId: userId,
      actorType: "user",
      action: "generate",
      entityType: "recurring_invoice",
      entityId: id,
      metadata: { manual: true },
    });

    return NextResponse.json({ success: true, message: "Invoice generation queued" });
  } catch (error) {
    captureError(error, {
      tags: { source: "api", route: "recurring/[id]/generate" },
      level: "error",
    });
    return NextResponse.json(
      { error: "Failed to trigger generation" },
      { status: 500 }
    );
  }
}
