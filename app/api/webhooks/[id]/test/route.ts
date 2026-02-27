import { NextRequest, NextResponse } from "next/server";
import { checkAdmin } from "@/lib/auth";
import { captureError } from "@/lib/errors";
import { deliverWebhook } from "@/lib/webhooks/deliver";

type RouteContext = { params: Promise<{ id: string }> };

/**
 * POST /api/webhooks/[id]/test — Send a test webhook delivery
 */
export async function POST(_request: NextRequest, context: RouteContext) {
  const userId = await checkAdmin();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const { id } = await context.params;

    const result = await deliverWebhook(id, "test.ping", {
      message: "This is a test webhook from AM Collective.",
      timestamp: new Date().toISOString(),
      sentBy: userId,
    });

    return NextResponse.json(result);
  } catch (error) {
    captureError(error, { tags: { route: "POST /api/webhooks/[id]/test" } });
    return NextResponse.json({ error: "Test delivery failed" }, { status: 500 });
  }
}
