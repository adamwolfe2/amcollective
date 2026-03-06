/**
 * Document Detail API — Get, update, or delete a document.
 *
 * GET: Returns document with tags
 * PATCH: Update document metadata (title, docType, isClientVisible, content, companyTag)
 * DELETE: Delete document + Vercel Blob file
 * Auth: owner or admin only.
 */

import { NextRequest, NextResponse } from "next/server";
import { del } from "@vercel/blob";
import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { createAuditLog } from "@/lib/db/repositories/audit";
import { checkAdmin } from "@/lib/auth";
import { captureError } from "@/lib/errors";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const userId = await checkAdmin();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  const [doc] = await db
    .select()
    .from(schema.documents)
    .where(eq(schema.documents.id, id))
    .limit(1);

  if (!doc) {
    return NextResponse.json({ error: "Document not found" }, { status: 404 });
  }

  const tags = await db
    .select()
    .from(schema.documentTags)
    .where(eq(schema.documentTags.documentId, id));

  return NextResponse.json({ ...doc, tags });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const userId = await checkAdmin();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  try {
    const body = await req.json();
    const updates: Record<string, unknown> = {};

    if (body.title !== undefined) updates.title = body.title;
    if (body.content !== undefined) updates.content = body.content;
    if (body.docType !== undefined) updates.docType = body.docType;
    if (body.companyTag !== undefined) updates.companyTag = body.companyTag;
    if (body.isClientVisible !== undefined)
      updates.isClientVisible = body.isClientVisible;
    if (body.clientId !== undefined) updates.clientId = body.clientId || null;

    const [updated] = await db
      .update(schema.documents)
      .set(updates)
      .where(eq(schema.documents.id, id))
      .returning();

    if (!updated) {
      return NextResponse.json(
        { error: "Document not found" },
        { status: 404 }
      );
    }

    await createAuditLog({
      actorId: userId,
      actorType: "user",
      action: "update_document",
      entityType: "documents",
      entityId: id,
      metadata: { fields: Object.keys(updates) },
    });

    return NextResponse.json(updated);
  } catch (err) {
    console.error("[documents] Error:", err);
    captureError(err, { tags: { route: "PATCH /api/documents/[id]" } });
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const userId = await checkAdmin();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  try {
    // Fetch document to get file URL
    const [doc] = await db
      .select()
      .from(schema.documents)
      .where(eq(schema.documents.id, id))
      .limit(1);

    if (!doc) {
      return NextResponse.json(
        { error: "Document not found" },
        { status: 404 }
      );
    }

    // Delete from Vercel Blob if file exists
    if (doc.fileUrl) {
      try {
        await del(doc.fileUrl);
      } catch (blobErr) {
        console.warn("[documents] Blob delete warning:", blobErr);
        // Continue with DB deletion even if blob delete fails
      }
    }

    // Delete from DB (cascades to document_tags)
    await db
      .delete(schema.documents)
      .where(eq(schema.documents.id, id));

    await createAuditLog({
      actorId: userId,
      actorType: "user",
      action: "delete_document",
      entityType: "documents",
      entityId: id,
      metadata: { title: doc.title, fileName: doc.fileName },
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[documents] Error:", err);
    captureError(err, { tags: { route: "DELETE /api/documents/[id]" } });
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
