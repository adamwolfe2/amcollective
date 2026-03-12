/**
 * POST /api/integrations/gmail/connect
 *
 * Initiates Gmail OAuth via Composio. Returns a redirect URL for the user to authorize.
 */

import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/require-admin";
import { initiateGmailConnection, isComposioConfigured } from "@/lib/integrations/composio";
import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { and, eq } from "drizzle-orm";

export async function POST(request: Request) {
  const { userId, error } = await requireAdmin();
  if (error) return error;

  if (!isComposioConfigured()) {
    return NextResponse.json(
      { error: "Composio is not configured. Set COMPOSIO_API_KEY." },
      { status: 503 }
    );
  }

  // Check for existing active connection
  const [existing] = await db
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

  if (existing) {
    return NextResponse.json(
      { error: "Gmail account already connected", accountId: existing.id },
      { status: 409 }
    );
  }

  const { origin } = new URL(request.url);
  const redirectUrl = `${origin}/api/integrations/gmail/callback`;

  try {
    const result = await initiateGmailConnection({
      userId,
      redirectUrl,
    });

    // Create a pending connected account record
    if (result.connectionId) {
      await db.insert(schema.connectedAccounts).values({
        userId,
        provider: "gmail",
        composioAccountId: result.connectionId,
        status: "expired", // Will be set to "active" on callback
      });
    }

    return NextResponse.json({ redirectUrl: result.redirectUrl });
  } catch (err) {
    console.error("[gmail/connect] Composio error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to initiate Gmail connection" },
      { status: 500 }
    );
  }
}
