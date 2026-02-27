/**
 * POST /api/recurring/[id]/resume — Resume paused recurring billing.
 */

import { NextResponse } from "next/server";
import { checkAdmin } from "@/lib/auth";
import { captureError } from "@/lib/errors";
import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { createAuditLog } from "@/lib/db/repositories/audit";

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

    const [updated] = await db
      .update(schema.recurringInvoices)
      .set({ status: "active" })
      .where(eq(schema.recurringInvoices.id, id))
      .returning();

    if (!updated) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    await createAuditLog({
      actorId: userId,
      actorType: "user",
      action: "resume",
      entityType: "recurring_invoice",
      entityId: id,
    });

    return NextResponse.json({ success: true, status: "active" });
  } catch (error) {
    captureError(error, {
      tags: { source: "api", route: "recurring/[id]/resume" },
      level: "error",
    });
    return NextResponse.json(
      { error: "Failed to resume" },
      { status: 500 }
    );
  }
}
