import { NextRequest, NextResponse } from "next/server";
import { checkAdmin } from "@/lib/auth";
import { captureError } from "@/lib/errors";
import { createAuditLog } from "@/lib/db/repositories/audit";
import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { eq } from "drizzle-orm";

type RouteContext = { params: Promise<{ id: string }> };

/**
 * GET /api/email/drafts/:id — Get a single draft
 */
export async function GET(_request: NextRequest, context: RouteContext) {
  const userId = await checkAdmin();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const { id } = await context.params;
    const [draft] = await db
      .select({
        draft: schema.emailDrafts,
        clientName: schema.clients.name,
      })
      .from(schema.emailDrafts)
      .leftJoin(schema.clients, eq(schema.emailDrafts.clientId, schema.clients.id))
      .where(eq(schema.emailDrafts.id, id))
      .limit(1);

    if (!draft) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json(draft);
  } catch (error) {
    captureError(error, { tags: { route: "GET /api/email/drafts/:id" } });
    return NextResponse.json({ error: "Failed to fetch draft" }, { status: 500 });
  }
}

/**
 * PATCH /api/email/drafts/:id — Update a draft
 */
export async function PATCH(request: NextRequest, context: RouteContext) {
  const userId = await checkAdmin();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const { id } = await context.params;
    const body = await request.json();

    const [existing] = await db
      .select()
      .from(schema.emailDrafts)
      .where(eq(schema.emailDrafts.id, id))
      .limit(1);

    if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (existing.status === "sent") {
      return NextResponse.json({ error: "Cannot edit a sent email" }, { status: 400 });
    }

    const updates: Record<string, unknown> = {};
    if (body.to !== undefined) updates.to = body.to;
    if (body.cc !== undefined) updates.cc = body.cc || null;
    if (body.subject !== undefined) updates.subject = body.subject;
    if (body.body !== undefined) updates.body = body.body;
    if (body.plainText !== undefined) updates.plainText = body.plainText || null;
    if (body.status !== undefined) updates.status = body.status;

    const [updated] = await db
      .update(schema.emailDrafts)
      .set(updates)
      .where(eq(schema.emailDrafts.id, id))
      .returning();

    await createAuditLog({
      actorId: userId,
      actorType: "user",
      action: "email_draft.updated",
      entityType: "email_draft",
      entityId: id,
      metadata: { changes: Object.keys(updates) },
    });

    return NextResponse.json(updated);
  } catch (error) {
    captureError(error, { tags: { route: "PATCH /api/email/drafts/:id" } });
    return NextResponse.json({ error: "Failed to update draft" }, { status: 500 });
  }
}

/**
 * DELETE /api/email/drafts/:id — Delete a draft (only if not sent)
 */
export async function DELETE(_request: NextRequest, context: RouteContext) {
  const userId = await checkAdmin();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const { id } = await context.params;

    const [existing] = await db
      .select()
      .from(schema.emailDrafts)
      .where(eq(schema.emailDrafts.id, id))
      .limit(1);

    if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (existing.status === "sent") {
      return NextResponse.json({ error: "Cannot delete a sent email" }, { status: 400 });
    }

    await db.delete(schema.emailDrafts).where(eq(schema.emailDrafts.id, id));

    await createAuditLog({
      actorId: userId,
      actorType: "user",
      action: "email_draft.deleted",
      entityType: "email_draft",
      entityId: id,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    captureError(error, { tags: { route: "DELETE /api/email/drafts/:id" } });
    return NextResponse.json({ error: "Failed to delete draft" }, { status: 500 });
  }
}
