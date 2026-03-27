/**
 * POST /api/public/proposals/[id]/view — Record a client view of the proposal.
 */

import { NextRequest, NextResponse } from "next/server";
import { after } from "next/server";
import { captureError } from "@/lib/errors";
import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { eq, sql } from "drizzle-orm";
import { createAuditLog } from "@/lib/db/repositories/audit";
import { ajWebhook } from "@/lib/middleware/arcjet";

export async function POST(
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

    const [proposal] = await db
      .select()
      .from(schema.proposals)
      .where(eq(schema.proposals.id, id))
      .limit(1);

    if (!proposal) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const updates: Record<string, unknown> = {
      viewCount: sql`${schema.proposals.viewCount} + 1`,
    };

    // Set viewedAt on first view and advance status
    if (!proposal.viewedAt) {
      updates.viewedAt = new Date();
    }

    if (proposal.status === "sent") {
      updates.status = "viewed";
    }

    await db
      .update(schema.proposals)
      .set(updates)
      .where(eq(schema.proposals.id, id));

    after(async () => {
      await createAuditLog({
        actorId: "client",
        actorType: "system",
        action: "view",
        entityType: "proposal",
        entityId: id,
        metadata: { proposalNumber: proposal.proposalNumber },
      });
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    captureError(error, {
      tags: { source: "api", route: "public/proposals/[id]/view" },
      level: "error",
    });
    return NextResponse.json(
      { error: "Failed to record view" },
      { status: 500 }
    );
  }
}
