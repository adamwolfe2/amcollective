/**
 * POST /api/webhooks/composio
 *
 * Receives event payloads from Composio (V3 format).
 *
 * Event types:
 *  composio.trigger.message      — a connected tool fired a trigger (GitHub push,
 *                                  Linear issue updated, Calendar event, etc.)
 *  composio.connected_account.expired — OAuth token expired, needs re-auth
 */

import { NextRequest, NextResponse } from "next/server";
import { captureError } from "@/lib/errors";
import { createAuditLog } from "@/lib/db/repositories/audit";
import { inngest } from "@/lib/inngest/client";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const eventType: string = body?.event ?? body?.type ?? "unknown";
    const payload = body?.payload ?? body?.data ?? body;

    // Log every composio event to the audit trail
    await createAuditLog({
      actorId: "composio",
      actorType: "system",
      action: `composio.${eventType}`,
      entityType: "composio_event",
      entityId: body?.id ?? "unknown",
      metadata: { eventType, appName: payload?.appName, triggerName: payload?.triggerName },
    }).catch(() => {
      // Non-fatal — don't block the 200 response
    });

    // Route to Inngest for async processing
    if (eventType === "trigger.message" || eventType === "composio.trigger.message") {
      await inngest.send({
        name: "composio/trigger.received",
        data: {
          appName: payload?.appName ?? payload?.app_name ?? "unknown",
          triggerName: payload?.triggerName ?? payload?.trigger_name ?? "unknown",
          connectionId: payload?.connectionId ?? payload?.connection_id,
          payload,
        },
      });
    }

    if (eventType === "connected_account.expired" || eventType === "composio.connected_account.expired") {
      await inngest.send({
        name: "composio/account.expired",
        data: {
          connectionId: payload?.connectionId ?? payload?.connection_id,
          appName: payload?.appName ?? payload?.app_name,
          payload,
        },
      });
    }

    return NextResponse.json({ received: true });
  } catch (error) {
    captureError(error, { tags: { route: "POST /api/webhooks/composio" } });
    // Always return 200 to prevent Composio retry storms
    return NextResponse.json({ received: true });
  }
}
