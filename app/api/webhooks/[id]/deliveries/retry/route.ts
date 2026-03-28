import { NextRequest, NextResponse } from "next/server";
import { checkAdmin } from "@/lib/auth";
import { captureError } from "@/lib/errors";
import { deliverWebhook } from "@/lib/webhooks/deliver";
import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { eq } from "drizzle-orm";

type RouteContext = { params: Promise<{ id: string }> };

/**
 * POST /api/webhooks/[id]/deliveries/retry — Retry a specific delivery
 * Body: { deliveryId: string }
 */
export async function POST(request: NextRequest, context: RouteContext) {
  const userId = await checkAdmin();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const { id: registrationId } = await context.params;
    const body = await request.json();
    const { deliveryId } = body;

    if (!deliveryId) {
      return NextResponse.json({ error: "deliveryId is required" }, { status: 400 });
    }

    // Fetch the original delivery to get event type and payload
    const [delivery] = await db
      .select()
      .from(schema.webhookDeliveries)
      .where(eq(schema.webhookDeliveries.id, deliveryId))
      .limit(1);

    if (!delivery) {
      return NextResponse.json({ error: "Delivery not found" }, { status: 404 });
    }

    if (delivery.registrationId !== registrationId) {
      return NextResponse.json({ error: "Delivery does not belong to this webhook" }, { status: 403 });
    }

    // Re-deliver using the original payload data
    const originalPayload = delivery.payload as { data?: Record<string, unknown> } | null;
    const result = await deliverWebhook(
      registrationId,
      delivery.eventType,
      originalPayload?.data ?? {}
    );

    return NextResponse.json(result);
  } catch (error) {
    captureError(error, { tags: { route: "POST /api/webhooks/[id]/deliveries/retry" } });
    return NextResponse.json({ error: "Retry failed" }, { status: 500 });
  }
}
