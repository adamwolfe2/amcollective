/**
 * GET  /api/knowledge  -- list knowledge base articles (SOPs + notes)
 * POST /api/knowledge  -- create KB article
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { eq, and, desc, sql, or, ilike } from "drizzle-orm";
import { checkAdmin } from "@/lib/auth";
import { captureError } from "@/lib/errors";
import { createAuditLog } from "@/lib/db/repositories/audit";
import { aj } from "@/lib/middleware/arcjet";

const createKnowledgeSchema = z.object({
  title: z.string().min(1).max(500),
  content: z.string().max(100000).optional().nullable(),
  docType: z.enum(["contract", "proposal", "note", "sop", "invoice", "brief", "other"]).default("sop"),
  tags: z.array(z.string().min(1).max(100)).max(50).optional(),
});

export async function GET(request: NextRequest) {
  try {
    const userId = await checkAdmin();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = request.nextUrl;
    const docType = searchParams.get("type");
    const search = searchParams.get("search");
    const tag = searchParams.get("tag");

    const conditions = [
      or(
        eq(schema.documents.docType, "sop"),
        eq(schema.documents.docType, "note"),
        eq(schema.documents.docType, "brief")
      ),
    ];

    if (docType && docType !== "all") {
      conditions.push(
        eq(
          schema.documents.docType,
          docType as (typeof schema.docTypeEnum.enumValues)[number]
        )
      );
    }

    if (search) {
      conditions.push(
        or(
          ilike(schema.documents.title, `%${search}%`),
          ilike(schema.documents.content, `%${search}%`)
        )!
      );
    }

    let rows;
    if (tag) {
      // Join with tags
      rows = await db
        .select({
          document: schema.documents,
          tag: schema.documentTags.tag,
        })
        .from(schema.documents)
        .innerJoin(
          schema.documentTags,
          eq(schema.documents.id, schema.documentTags.documentId)
        )
        .where(and(...conditions, eq(schema.documentTags.tag, tag)))
        .orderBy(desc(schema.documents.updatedAt))
        .limit(100);

      return NextResponse.json(
        rows.map((r) => ({ ...r.document, tags: [r.tag] })),
        { headers: { "Cache-Control": "private, max-age=60, stale-while-revalidate=120" } }
      );
    }

    const documents = await db
      .select()
      .from(schema.documents)
      .where(and(...conditions))
      .orderBy(desc(schema.documents.updatedAt))
      .limit(100);

    // Get tags for all documents
    const docIds = documents.map((d) => d.id);
    const tags =
      docIds.length > 0
        ? await db
            .select()
            .from(schema.documentTags)
            .where(
              sql`${schema.documentTags.documentId} IN (${sql.join(
                docIds.map((id) => sql`${id}`),
                sql`,`
              )})`
            )
        : [];

    const tagMap = new Map<string, string[]>();
    for (const t of tags) {
      if (!tagMap.has(t.documentId)) tagMap.set(t.documentId, []);
      tagMap.get(t.documentId)!.push(t.tag);
    }

    return NextResponse.json(
      documents.map((d) => ({ ...d, tags: tagMap.get(d.id) ?? [] })),
      { headers: { "Cache-Control": "private, max-age=60, stale-while-revalidate=120" } }
    );
  } catch (error) {
    captureError(error);
    return NextResponse.json(
      { error: "Failed to fetch knowledge base" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  if (aj) {
    const decision = await aj.protect(request, { requested: 1 });
    if (decision.isDenied()) {
      return NextResponse.json({ error: "Rate limited" }, { status: 429 });
    }
  }

  try {
    const userId = await checkAdmin();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();

    const parsed = createKnowledgeSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const { title, content, docType, tags } = parsed.data;

    const [doc] = await db
      .insert(schema.documents)
      .values({
        title,
        content: content ?? null,
        docType,
        companyTag: "am_collective",
        createdById: userId,
        isClientVisible: false,
      })
      .returning();

    // Add tags
    if (tags && tags.length > 0) {
      await db.insert(schema.documentTags).values(
        tags.map((tag) => ({
          documentId: doc.id,
          tag,
        }))
      );
    }

    await createAuditLog({
      actorId: userId,
      actorType: "user",
      action: "knowledge.created",
      entityType: "document",
      entityId: doc.id,
      metadata: { title, docType },
    });

    return NextResponse.json(doc, { status: 201 });
  } catch (error) {
    captureError(error);
    return NextResponse.json(
      { error: "Failed to create article" },
      { status: 500 }
    );
  }
}
