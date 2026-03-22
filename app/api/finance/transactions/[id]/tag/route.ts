/**
 * Transaction Tag API — Update the company tag on a Mercury transaction.
 *
 * PATCH: Sets the companyTag field. Auth: owner or admin only.
 */

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { createAuditLog } from "@/lib/db/repositories/audit";
import { checkAdmin } from "@/lib/auth";
import { captureError } from "@/lib/errors";
import { aj } from "@/lib/middleware/arcjet";

const VALID_TAGS = [
  "trackr",
  "wholesail",
  "taskspace",
  "cursive",
  "tbgc",
  "hook",
  "am_collective",
  "personal",
  "untagged",
] as const;

type CompanyTag = (typeof VALID_TAGS)[number];

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (aj) {
    const decision = await aj.protect(req, { requested: 1 });
    if (decision.isDenied()) {
      return NextResponse.json({ error: "Rate limited" }, { status: 429 });
    }
  }

  const userId = await checkAdmin();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  try {
    const body = await req.json();
    const tag = body.tag as string;

    if (!tag || !VALID_TAGS.includes(tag as CompanyTag)) {
      return NextResponse.json(
        { error: "Invalid tag", validTags: VALID_TAGS },
        { status: 400 }
      );
    }

    const [updated] = await db
      .update(schema.mercuryTransactions)
      .set({ companyTag: tag as CompanyTag })
      .where(eq(schema.mercuryTransactions.id, id))
      .returning({ id: schema.mercuryTransactions.id });

    if (!updated) {
      return NextResponse.json(
        { error: "Transaction not found" },
        { status: 404 }
      );
    }

    await createAuditLog({
      actorId: userId,
      actorType: "user",
      action: "tag_mercury_transaction",
      entityType: "mercury_transactions",
      entityId: id,
      metadata: { tag },
    });

    return NextResponse.json({ success: true, id: updated.id, tag });
  } catch (err) {
    captureError(err, { tags: { route: "PATCH /api/finance/transactions/[id]/tag" } });
    return NextResponse.json(
      {
        error: "Failed to update tag",
      },
      { status: 500 }
    );
  }
}
