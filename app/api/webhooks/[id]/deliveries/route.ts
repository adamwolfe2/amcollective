import { NextRequest, NextResponse } from "next/server";
import { checkAdmin } from "@/lib/auth";
import { captureError } from "@/lib/errors";
import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { eq, desc } from "drizzle-orm";

type RouteContext = { params: Promise<{ id: string }> };

/**
 * GET /api/webhooks/[id]/deliveries — List recent deliveries for a registration
 */
export async function GET(_request: NextRequest, context: RouteContext) {
  const userId = await checkAdmin();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const { id } = await context.params;

    const deliveries = await db
      .select()
      .from(schema.webhookDeliveries)
      .where(eq(schema.webhookDeliveries.registrationId, id))
      .orderBy(desc(schema.webhookDeliveries.createdAt))
      .limit(50);

    return NextResponse.json(deliveries);
  } catch (error) {
    captureError(error, { tags: { route: "GET /api/webhooks/[id]/deliveries" } });
    return NextResponse.json({ error: "Failed to fetch deliveries" }, { status: 500 });
  }
}
