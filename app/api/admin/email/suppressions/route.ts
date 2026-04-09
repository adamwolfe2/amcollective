/**
 * /api/admin/email/suppressions
 *
 * GET  — list all active email suppressions
 * DELETE — remove a suppression by id (body: { id: string })
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { db } from "@/lib/db";
import { emailSuppressions } from "@/lib/db/schema/email";
import { eq, desc } from "drizzle-orm";
import { z } from "zod";
import { createAuditLog } from "@/lib/db/repositories/audit";

export const runtime = "nodejs";

export async function GET() {
  const userId = await requireAuth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rows = await db
    .select()
    .from(emailSuppressions)
    .orderBy(desc(emailSuppressions.createdAt))
    .limit(200);

  return NextResponse.json({ suppressions: rows });
}

const deleteSchema = z.object({
  id: z.string().uuid(),
});

export async function DELETE(req: NextRequest) {
  const userId = await requireAuth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = deleteSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.message }, { status: 400 });
  }

  const { id } = parsed.data;

  const [deleted] = await db
    .delete(emailSuppressions)
    .where(eq(emailSuppressions.id, id))
    .returning();

  if (!deleted) {
    return NextResponse.json({ error: "Suppression not found" }, { status: 404 });
  }

  await createAuditLog({
    actorId: userId,
    actorType: "user",
    action: "remove_email_suppression",
    entityType: "email_suppression",
    entityId: id,
    metadata: { email: deleted.email, reason: deleted.reason },
  });

  return NextResponse.json({ success: true, removed: deleted });
}
