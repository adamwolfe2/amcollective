/**
 * GET    /api/knowledge/[id]  -- article detail
 * PATCH  /api/knowledge/[id]  -- update article
 * DELETE /api/knowledge/[id]  -- delete article
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { checkAdmin } from "@/lib/auth";
import { captureError } from "@/lib/errors";
import { createAuditLog } from "@/lib/db/repositories/audit";

const knowledgeUpdateSchema = z.object({
  title: z.string().min(1).max(500).trim(),
  content: z.string().max(100000).nullable(),
  docType: z.enum(["contract", "proposal", "note", "sop", "invoice", "brief", "other"]),
  tags: z.array(z.string().max(100)).max(50),
}).partial().refine(data => Object.keys(data).length > 0, "At least one field required");

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: NextRequest, ctx: RouteContext) {
  try {
    const userId = await checkAdmin();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await ctx.params;

    const [[doc], tags] = await Promise.all([
      db.select().from(schema.documents).where(eq(schema.documents.id, id)).limit(1),
      db
        .select({ tag: schema.documentTags.tag })
        .from(schema.documentTags)
        .where(eq(schema.documentTags.documentId, id)),
    ]);

    if (!doc) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    return NextResponse.json({
      ...doc,
      tags: tags.map((t) => t.tag),
    });
  } catch (error) {
    captureError(error);
    return NextResponse.json(
      { error: "Failed to fetch article" },
      { status: 500 }
    );
  }
}

export async function PATCH(request: NextRequest, ctx: RouteContext) {
  try {
    const userId = await checkAdmin();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await ctx.params;
    const body = await request.json();

    const parsed = knowledgeUpdateSchema.safeParse(body);
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

    const [updated] = await db
      .update(schema.documents)
      .set(updates)
      .where(eq(schema.documents.id, id))
      .returning();

    if (!updated) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    // Replace tags if provided
    if (data.tags !== undefined) {
      await db
        .delete(schema.documentTags)
        .where(eq(schema.documentTags.documentId, id));

      if (data.tags.length > 0) {
        await db.insert(schema.documentTags).values(
          data.tags.map((tag: string) => ({
            documentId: id,
            tag,
          }))
        );
      }
    }

    await createAuditLog({
      actorId: userId,
      actorType: "user",
      action: "knowledge.updated",
      entityType: "document",
      entityId: id,
      metadata: data,
    });

    return NextResponse.json(updated);
  } catch (error) {
    captureError(error);
    return NextResponse.json(
      { error: "Failed to update article" },
      { status: 500 }
    );
  }
}

export async function DELETE(_request: NextRequest, ctx: RouteContext) {
  try {
    const userId = await checkAdmin();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await ctx.params;

    await db.delete(schema.documents).where(eq(schema.documents.id, id));

    await createAuditLog({
      actorId: userId,
      actorType: "user",
      action: "knowledge.deleted",
      entityType: "document",
      entityId: id,
    });

    return NextResponse.json({ deleted: true });
  } catch (error) {
    captureError(error);
    return NextResponse.json(
      { error: "Failed to delete article" },
      { status: 500 }
    );
  }
}
