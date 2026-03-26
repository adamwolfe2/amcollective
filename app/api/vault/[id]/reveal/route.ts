/**
 * GET /api/vault/[id]/reveal
 *
 * Decrypts and returns the password for a credential entry.
 * Protected by Clerk admin auth — only owner/admin roles can call this.
 */

import { NextRequest, NextResponse } from "next/server";
import { after } from "next/server";
import { apiError } from "@/lib/api/response";
import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { checkAdmin } from "@/lib/auth";
import { decryptPassword } from "@/lib/vault/crypto";
import { createAuditLog } from "@/lib/db/repositories/audit";
import { captureError } from "@/lib/errors";
import arcjet, { shield, tokenBucket } from "@arcjet/next";

const key = process.env.ARCJET_KEY;

/** Strict rate limiter for vault reveal: 10 req/hour per IP */
const ajVaultReveal = key
  ? arcjet({
      key,
      characteristics: ["ip.src"],
      rules: [
        shield({ mode: "LIVE" }),
        tokenBucket({
          mode: "LIVE",
          refillRate: 10,
          interval: 3600,
          capacity: 10,
        }),
      ],
    })
  : null;

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  // Rate limit — strict because this reveals passwords
  if (ajVaultReveal) {
    const decision = await ajVaultReveal.protect(req, { requested: 1 });
    if (decision.isDenied()) {
      return apiError("Rate limited", 429);
    }
  }

  // Auth — admin/owner only
  const userId = await checkAdmin();
  if (!userId) {
    return apiError("Unauthorized", 401);
  }

  const { id } = await params;

  const [row] = await db
    .select({ passwordEncrypted: schema.credentials.passwordEncrypted })
    .from(schema.credentials)
    .where(eq(schema.credentials.id, id))
    .limit(1);

  if (!row) {
    return apiError("Not found", 404);
  }

  if (!row.passwordEncrypted) {
    return NextResponse.json({ password: null }, { headers: { "Cache-Control": "no-store" } });
  }

  try {
    const password = decryptPassword(row.passwordEncrypted);

    after(async () => {
      await createAuditLog({
        actorId: userId,
        actorType: "user",
        action: "credential.revealed",
        entityType: "credential",
        entityId: id,
      });
    });

    return NextResponse.json({ password }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    captureError(error, { tags: { route: "GET /api/vault/[id]/reveal" } });
    return apiError("Decryption failed", 500);
  }
}
