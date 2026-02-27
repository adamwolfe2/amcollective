/**
 * Documents List API — List documents with optional filters.
 *
 * GET: Returns documents filtered by companyTag, docType, clientId.
 * Auth: owner or admin only.
 */

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { eq, desc, and, type SQL } from "drizzle-orm";
import { checkAdmin } from "@/lib/auth";

export async function GET(req: NextRequest) {
  const userId = await checkAdmin();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = req.nextUrl;
  const companyTag = searchParams.get("companyTag");
  const docType = searchParams.get("docType");
  const clientId = searchParams.get("clientId");
  const limit = parseInt(searchParams.get("limit") || "50", 10);

  const conditions: SQL[] = [];
  if (companyTag) {
    conditions.push(
      eq(
        schema.documents.companyTag,
        companyTag as typeof schema.companyTagEnum.enumValues[number]
      )
    );
  }
  if (docType) {
    conditions.push(
      eq(
        schema.documents.docType,
        docType as typeof schema.docTypeEnum.enumValues[number]
      )
    );
  }
  if (clientId) {
    conditions.push(eq(schema.documents.clientId, clientId));
  }

  const docs = await db
    .select({
      id: schema.documents.id,
      companyTag: schema.documents.companyTag,
      clientId: schema.documents.clientId,
      title: schema.documents.title,
      fileUrl: schema.documents.fileUrl,
      fileName: schema.documents.fileName,
      fileMimeType: schema.documents.fileMimeType,
      fileSizeBytes: schema.documents.fileSizeBytes,
      docType: schema.documents.docType,
      isClientVisible: schema.documents.isClientVisible,
      createdById: schema.documents.createdById,
      createdAt: schema.documents.createdAt,
      updatedAt: schema.documents.updatedAt,
      clientName: schema.clients.name,
    })
    .from(schema.documents)
    .leftJoin(schema.clients, eq(schema.documents.clientId, schema.clients.id))
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(schema.documents.createdAt))
    .limit(limit);

  return NextResponse.json(docs);
}
