/**
 * GET /api/vault/[id]/reveal
 *
 * Decrypts and returns the password for a credential entry.
 * Protected by Clerk admin auth — only owner/admin roles can call this.
 */

import { NextRequest, NextResponse } from "next/server";
import { after } from "next/server";
import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { checkAdmin } from "@/lib/auth";
import { decryptPassword } from "@/lib/vault/crypto";
import { createAuditLog } from "@/lib/db/repositories/audit";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  // Auth — admin/owner only
  const userId = await checkAdmin();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  const [row] = await db
    .select({ passwordEncrypted: schema.credentials.passwordEncrypted })
    .from(schema.credentials)
    .where(eq(schema.credentials.id, id))
    .limit(1);

  if (!row) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (!row.passwordEncrypted) {
    return NextResponse.json({ password: null });
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

    return NextResponse.json({ password });
  } catch {
    return NextResponse.json(
      { error: "Decryption failed" },
      { status: 500 }
    );
  }
}
