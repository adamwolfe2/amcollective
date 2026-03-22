/**
 * Document Upload API — Upload files to Vercel Blob and create document records.
 *
 * POST: Accepts multipart form with file + metadata.
 * Auth: owner or admin only.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { put } from "@vercel/blob";
import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { createAuditLog } from "@/lib/db/repositories/audit";
import { checkAdmin } from "@/lib/auth";
import { captureError } from "@/lib/errors";

const companyTags = ["trackr", "wholesail", "taskspace", "cursive", "tbgc", "hook", "myvsl", "am_collective", "personal", "untagged"] as const;

const uploadMetadataSchema = z.object({
  title: z.string().min(1, "title is required").max(500).trim(),
  companyTag: z.enum(companyTags).default("am_collective"),
  docType: z.enum(["contract", "proposal", "note", "sop", "invoice", "brief", "other"]).default("other"),
  clientId: z.string().uuid().nullable().default(null),
  isClientVisible: z.enum(["true", "false"]).default("false").transform(v => v === "true"),
});

export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_SIZE = 25 * 1024 * 1024; // 25MB

function sanitizeFileName(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 255);
}

const ALLOWED_TYPES = new Set([
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/msword",
  "application/vnd.ms-excel",
  "image/png",
  "image/jpeg",
  "image/webp",
  "video/mp4",
  "text/plain",
  "text/markdown",
]);

export async function POST(req: NextRequest) {
  const userId = await checkAdmin();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;

    const rawMetadata = {
      title: formData.get("title") as string | null,
      companyTag: formData.get("companyTag") as string | null,
      docType: formData.get("docType") as string | null,
      clientId: formData.get("clientId") as string | null,
      isClientVisible: formData.get("isClientVisible") as string | null,
    };

    // Strip null/undefined keys so Zod defaults kick in
    const cleaned = Object.fromEntries(
      Object.entries(rawMetadata).filter(([, v]) => v != null && v !== "")
    );

    const parsed = uploadMetadataSchema.safeParse(cleaned);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const { title, companyTag, docType, clientId, isClientVisible } = parsed.data;

    let fileUrl: string | null = null;
    let fileName: string | null = null;
    let fileMimeType: string | null = null;
    let fileSizeBytes: number | null = null;

    if (file && file.size > 0) {
      // Validate size
      if (file.size > MAX_SIZE) {
        return NextResponse.json(
          { error: `File too large. Max size: 25MB` },
          { status: 400 }
        );
      }

      // Validate type
      if (!ALLOWED_TYPES.has(file.type)) {
        return NextResponse.json(
          {
            error: `File type not allowed: ${file.type}`,
            allowedTypes: Array.from(ALLOWED_TYPES),
          },
          { status: 400 }
        );
      }

      // Upload to Vercel Blob
      const folder = clientId || "internal";
      const timestamp = Date.now();
      const pathname = `documents/${companyTag}/${folder}/${timestamp}-${sanitizeFileName(file.name)}`;

      const blob = await put(pathname, file, {
        access: "public",
        addRandomSuffix: false,
      });

      fileUrl = blob.url;
      fileName = file.name;
      fileMimeType = file.type;
      fileSizeBytes = file.size;
    }

    // Create document record
    const [document] = await db
      .insert(schema.documents)
      .values({
        companyTag: companyTag as typeof schema.companyTagEnum.enumValues[number],
        clientId: clientId || null,
        title,
        fileUrl,
        fileName,
        fileMimeType,
        fileSizeBytes,
        docType: docType as typeof schema.docTypeEnum.enumValues[number],
        isClientVisible,
        createdById: userId,
      })
      .returning();

    await createAuditLog({
      actorId: userId,
      actorType: "user",
      action: "upload_document",
      entityType: "documents",
      entityId: document.id,
      metadata: { title, fileName, companyTag, docType },
    });

    return NextResponse.json(document, { status: 201 });
  } catch (err) {
    captureError(err, { tags: { route: "POST /api/documents/upload" } });
    return NextResponse.json(
      {
        error: "Upload failed",
      },
      { status: 500 }
    );
  }
}
