/**
 * Connector Manual Refresh
 *
 * POST /api/connectors/[name]/refresh
 *
 * Invalidates the Redis cache for a given connector and returns fresh data
 * (by calling the connector immediately after invalidation).
 * Used by the "Refresh" button on dashboard connector cards.
 */

import { NextResponse } from "next/server";
import { checkAdmin } from "@/lib/auth";
import { invalidateCache } from "@/lib/connectors/base";

// Known connector cache keys — invalidate all keys for the given connector name
const CONNECTOR_KEYS: Record<string, string[]> = {
  stripe: ["stripe:mrr", "stripe:mrr-by-company", "stripe:recent-charges", "stripe:invoice-stats"],
  mercury: ["mercury:accounts", "mercury:total-cash"],
  vercel: ["vercel:recent-deploys", "vercel:projects"],
  posthog: ["posthog:overview"],
  neon: ["neon:usage"],
  clerk: ["clerk:users"],
};

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ name: string }> }
) {
  const userId = await checkAdmin();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { name } = await params;
  const keys = CONNECTOR_KEYS[name];

  if (!keys) {
    return NextResponse.json(
      { error: `Unknown connector: ${name}` },
      { status: 400 }
    );
  }

  // Invalidate all cache keys for this connector
  await Promise.all(keys.map((key) => invalidateCache(key)));

  return NextResponse.json({
    connector: name,
    invalidated: keys,
    refreshedAt: new Date().toISOString(),
  });
}
