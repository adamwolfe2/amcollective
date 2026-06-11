/**
 * GoHighLevel (GHL) Webhook Handler — ads + calls channels
 *
 * Adstra manages paid ads (Google + Meta) through GHL. GHL workflow webhooks
 * push contact/opportunity events (ad-sourced leads → "ads") and appointment
 * events (booked discovery calls → "calls").
 *
 * Auth: secret token in the URL path (GHL custom webhooks send no signature):
 *   /api/webhooks/ghl/<GHL_WEBHOOK_TOKEN>
 */

import { NextRequest, NextResponse } from "next/server";
import { createAuditLog } from "@/lib/db/repositories/audit";
import { captureError } from "@/lib/errors";
import {
  verifyToken,
  idempotencyKey,
  isDuplicateEvent,
  storeOutreachEvent,
  fullName,
  type OutreachChannel,
} from "@/lib/webhooks/outreach-ingest";

const SOURCE = "ghl";

// GHL event type → { normalized type, channel }
function classify(raw: string): { eventType: string; channel: OutreachChannel } {
  const e = raw.toLowerCase();
  if (e.includes("appointment")) {
    if (e.includes("cancel") || e.includes("delete")) {
      return { eventType: "call_canceled", channel: "calls" };
    }
    return { eventType: "call_booked", channel: "calls" };
  }
  if (e.includes("opportunity")) {
    return { eventType: "ads_opportunity", channel: "ads" };
  }
  // ContactCreate / InboundMessage / form submission → ad-sourced lead
  return { eventType: `ads_${e.replace(/[^a-z0-9]+/g, "_")}`, channel: "ads" };
}

export async function POST(request: NextRequest, ctx: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await ctx.params;
    if (!verifyToken(token, process.env.GHL_WEBHOOK_TOKEN)) {
      captureError(new Error("Invalid GHL webhook token"), {
        level: "warning",
        tags: { source: SOURCE },
      });
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));

    const rawType: string =
      body.type ?? body.event ?? body.eventType ?? body.webhook_event ?? "unknown";
    const { eventType, channel } = classify(rawType);

    const rawId =
      body.id ??
      body.appointmentId ??
      body.opportunityId ??
      body.contactId ??
      body.contact_id ??
      null;
    const key = idempotencyKey(eventType, rawId, body);

    if (await isDuplicateEvent(SOURCE, key)) {
      return NextResponse.json({ received: true, duplicate: true });
    }

    const contact = body.contact ?? body ?? {};
    const leadName = fullName(
      contact.firstName ?? contact.first_name,
      contact.lastName ?? contact.last_name,
      contact.name ?? contact.full_name ?? body.full_name ?? null
    );
    const leadEmail = contact.email ?? body.email ?? null;
    const leadIdentifier =
      contact.phone ?? body.phone ?? contact.id ?? body.contactId ?? null;
    // Attribution: which ad source/campaign GHL recorded.
    const campaignName =
      body.campaign?.name ??
      body.attributionSource?.utmCampaign ??
      body.utm_campaign ??
      body.source ??
      contact.source ??
      null;
    const subject =
      body.title ?? body.appointment?.title ?? body.opportunity?.name ?? body.message ?? null;

    await storeOutreachEvent(SOURCE, key, {
      channel,
      eventType,
      campaignName,
      leadEmail,
      leadName,
      leadIdentifier: leadIdentifier ? String(leadIdentifier).slice(0, 500) : null,
      subject: subject ? String(subject).slice(0, 1000) : null,
      payload: body,
    });

    if (["call_booked", "ads_opportunity"].includes(eventType)) {
      await createAuditLog({
        actorId: SOURCE,
        actorType: "system",
        action: `outreach.${eventType}`,
        entityType: "outreach_event",
        entityId: leadEmail ?? String(leadIdentifier ?? "unknown"),
        metadata: { channel, campaignName, leadName, subject },
      });
    }

    return NextResponse.json({ received: true });
  } catch (error) {
    captureError(error, { tags: { component: "GHL Webhook Error" } });
    return NextResponse.json({ received: true });
  }
}
