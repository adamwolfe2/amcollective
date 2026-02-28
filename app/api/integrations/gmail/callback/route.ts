/**
 * GET /api/integrations/gmail/callback
 *
 * Handles OAuth callback from Composio after the user authorizes Gmail.
 * Verifies the connection is active, updates the connected_accounts record,
 * then redirects to the settings page.
 */

import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/require-admin";
import { getConnectionStatus } from "@/lib/integrations/composio";
import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { and, eq } from "drizzle-orm";
import { createAuditLog } from "@/lib/db/repositories/audit";

export async function GET(request: Request) {
  const { userId, error } = await requireAdmin();
  if (error) return error;

  const url = new URL(request.url);
  const { origin } = url;

  // Find the pending connected account for this user
  const [pendingAccount] = await db
    .select()
    .from(schema.connectedAccounts)
    .where(
      and(
        eq(schema.connectedAccounts.userId, userId),
        eq(schema.connectedAccounts.provider, "gmail"),
        eq(schema.connectedAccounts.status, "expired")
      )
    )
    .limit(1);

  if (!pendingAccount?.composioAccountId) {
    return NextResponse.redirect(
      `${origin}/settings/integrations?error=no_pending_connection`
    );
  }

  // Verify the connection status with Composio
  const status = await getConnectionStatus(pendingAccount.composioAccountId);

  if (status.status !== "active") {
    return NextResponse.redirect(
      `${origin}/settings/integrations?error=connection_failed`
    );
  }

  // Update the connected account to active
  await db
    .update(schema.connectedAccounts)
    .set({
      status: "active",
      email: status.email ?? null,
      lastSyncAt: new Date(),
    })
    .where(eq(schema.connectedAccounts.id, pendingAccount.id));

  await createAuditLog({
    actorId: userId,
    actorType: "user",
    action: "connect_gmail",
    entityType: "connected_account",
    entityId: pendingAccount.id,
    metadata: { email: status.email },
  });

  return NextResponse.redirect(
    `${origin}/settings/integrations?success=gmail_connected`
  );
}
