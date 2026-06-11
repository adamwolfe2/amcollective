/**
 * Calendly Webhook Handler — calls channel (booked discovery calls)
 *
 * Captures invitee.created (booked) and invitee.canceled. Auth is a secret
 * token in the URL path. If CALENDLY_WEBHOOK_SIGNING_KEY is set (returned when
 * the subscription is created via API), the Calendly-Webhook-Signature header
 * is additionally verified.
 *
 *   /api/webhooks/calendly/<CALENDLY_WEBHOOK_TOKEN>
 */

import { NextRequest, NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "crypto";
import { createAuditLog } from "@/lib/db/repositories/audit";
import { captureError } from "@/lib/errors";
import {
  verifyToken,
  idempotencyKey,
  isDuplicateEvent,
  storeOutreachEvent,
} from "@/lib/webhooks/outreach-ingest";

const SOURCE = "calendly";

// Verify Calendly's "t=...,v1=..." signature header against the raw body.
function verifyCalendlySignature(
  header: string | null,
  rawBody: string,
  signingKey: string
): boolean {
  if (!header) return false;
  const parts = Object.fromEntries(
    header.split(",").map((kv) => kv.split("=").map((s) => s.trim()))
  );
  const t = parts["t"];
  const v1 = parts["v1"];
  if (!t || !v1) return false;
  const expected = createHmac("sha256", signingKey)
    .update(`${t}.${rawBody}`)
    .digest("hex");
  const a = Buffer.from(v1);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function POST(request: NextRequest, ctx: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await ctx.params;
    if (!verifyToken(token, process.env.CALENDLY_WEBHOOK_TOKEN)) {
      captureError(new Error("Invalid Calendly webhook token"), {
        level: "warning",
        tags: { source: SOURCE },
      });
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const rawBody = await request.text();
    const signingKey = process.env.CALENDLY_WEBHOOK_SIGNING_KEY;
    if (
      signingKey &&
      !verifyCalendlySignature(
        request.headers.get("calendly-webhook-signature"),
        rawBody,
        signingKey
      )
    ) {
      captureError(new Error("Invalid Calendly signature"), {
        level: "warning",
        tags: { source: SOURCE },
      });
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = JSON.parse(rawBody || "{}");

    const rawEvent: string = body.event ?? "unknown";
    const eventType = rawEvent === "invitee.canceled" ? "call_canceled" : "call_booked";

    const payload = body.payload ?? {};
    const rawId = payload.uri ?? payload.uuid ?? body.created_at ?? null;
    const key = idempotencyKey(eventType, rawId, body);

    if (await isDuplicateEvent(SOURCE, key)) {
      return NextResponse.json({ received: true, duplicate: true });
    }

    const leadName = payload.name ?? null;
    const leadEmail = payload.email ?? null;
    const eventName =
      payload.scheduled_event?.name ?? payload.event_type?.name ?? "Discovery Call";

    await storeOutreachEvent(SOURCE, key, {
      channel: "calls",
      eventType,
      campaignName: "Calendly",
      leadEmail,
      leadName,
      leadIdentifier: leadEmail,
      subject: eventName,
      payload: body,
    });

    if (eventType === "call_booked") {
      await createAuditLog({
        actorId: SOURCE,
        actorType: "system",
        action: "outreach.call_booked",
        entityType: "outreach_event",
        entityId: leadEmail ?? "unknown",
        metadata: { leadName, eventName },
      });
    }

    return NextResponse.json({ received: true });
  } catch (error) {
    captureError(error, { tags: { component: "Calendly Webhook Error" } });
    return NextResponse.json({ received: true });
  }
}
