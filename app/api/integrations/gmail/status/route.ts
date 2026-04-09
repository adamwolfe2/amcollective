/**
 * GET /api/integrations/gmail/status
 *
 * Returns current Gmail connection status for the authenticated user.
 */

import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/require-admin";
import { isComposioConfigured } from "@/lib/integrations/composio";
import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { and, eq } from "drizzle-orm";
import { captureError } from "@/lib/errors";

export async function GET() {
  const { userId, error } = await requireAdmin();
  if (error) return error;

  try {
    if (!isComposioConfigured()) {
      return NextResponse.json({
        configured: false,
        connected: false,
      }, {
        headers: { "Cache-Control": "private, max-age=60, stale-while-revalidate=120" },
      });
    }

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

    return NextResponse.json({
      configured: true,
      connected: !!account,
      email: account?.email ?? null,
      lastSyncAt: account?.lastSyncAt ?? null,
      accountId: account?.id ?? null,
    }, {
      headers: { "Cache-Control": "private, max-age=60, stale-while-revalidate=120" },
    });
  } catch (error) {
    captureError(error, { tags: { component: "gmail-status" } });
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
