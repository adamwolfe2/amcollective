/**
 * DELETE /api/integrations/gmail/disconnect
 *
 * Marks the connected Gmail account as "disconnected".
 */

import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/require-admin";
import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { and, eq } from "drizzle-orm";
import { createAuditLog } from "@/lib/db/repositories/audit";

export async function DELETE() {
  const { userId, error } = await requireAdmin();
  if (error) return error;

  const [account] = await db
    .select()
    .from(schema.connectedAccounts)
    .where(
      and(
        eq(schema.connectedAccounts.userId, userId),
        eq(schema.connectedAccounts.provider, "gmail"),
        eq(schema.connectedAccounts.status, "active")
      )
    )
    .limit(1);

  if (!account) {
    return NextResponse.json(
      { error: "No active Gmail connection found" },
      { status: 404 }
    );
  }

  await db
    .update(schema.connectedAccounts)
    .set({
      status: "disconnected",
      lastSyncAt: null,
    })
    .where(eq(schema.connectedAccounts.id, account.id));

  await createAuditLog({
    actorId: userId,
    actorType: "user",
    action: "disconnect_gmail",
    entityType: "connected_account",
    entityId: account.id,
    metadata: { email: account.email },
  });

  return NextResponse.json({ success: true });
}
