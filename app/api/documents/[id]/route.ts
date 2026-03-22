/**
 * Document Detail API — Get, update, or delete a document.
 *
 * GET: Returns document with tags
 * PATCH: Update document metadata (title, docType, isClientVisible, content, companyTag)
 * DELETE: Delete document + Vercel Blob file
 * Auth: owner or admin only.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { del } from "@vercel/blob";
import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { captureError } from "@/lib/errors";
import { createAuditLog } from "@/lib/db/repositories/audit";
import { checkAdmin } from "@/lib/auth";
import { aj } from "@/lib/middleware/arcjet";

const companyTags = ["trackr", "wholesail", "taskspace", "cursive", "tbgc", "hook", "myvsl", "am_collective", "personal", "untagged"] as const;

const documentUpdateSchema = z.object({
  title: z.string().min(1).max(500).trim(),
  content: z.string().max(100000).nullable(),
  docType: z.enum(["contract", "proposal", "note", "sop", "invoice", "brief", "other"]),
  companyTag: z.enum(companyTags),
  isClientVisible: z.boolean(),
  clientId: z.string().uuid().nullable(),
}).partial().refine(data => Object.keys(data).length > 0, "At least one field required");

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

    const parsed = documentUpdateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const data = parsed.data;
    const updates: Record<string, unknown> = {};

    if (data.title !== undefined) updates.title = data.title;
    if (data.content !== undefined) updates.content = data.content;
    if (data.docType !== undefined) updates.docType = data.docType;
    if (data.companyTag !== undefined) updates.companyTag = data.companyTag;
    if (data.isClientVisible !== undefined)
      updates.isClientVisible = data.isClientVisible;
    if (data.clientId !== undefined) updates.clientId = data.clientId || null;

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
  if (aj) {
    const decision = await aj.protect(_req, { requested: 1 });
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
        captureError(blobErr, { level: "warning", tags: { source: "documents-blob-delete" } });
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
    captureError(err, { tags: { component: "documents" } });
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
