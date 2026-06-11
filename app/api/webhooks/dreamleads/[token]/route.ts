/**
 * Dream Leads Webhook Handler (LinkedIn channel)
 *
 * Receives real-time LinkedIn events pushed from Dream Leads "Push Webhooks".
 * Dream Leads has no auth-header field, so authentication is a secret token in
 * the URL path: /api/webhooks/dreamleads/<DREAMLEADS_WEBHOOK_TOKEN>
 *
 * Triggers covered: new connection, new/sent message, connection request,
 * inmail/group message request, connection error, disconnected, out of contacts.
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
} from "@/lib/webhooks/outreach-ingest";

const SOURCE = "dreamleads";

// Map Dream Leads trigger labels → normalized event types.
function normalizeEventType(raw: string): string {
  const e = raw.toLowerCase().replace(/\s+/g, "_");
  const map: Record<string, string> = {
    new_connection: "linkedin_connected",
    out_of_contacts: "linkedin_out_of_contacts",
    new_message: "linkedin_message_received",
    sent_message: "linkedin_message_sent",
    connection_request: "linkedin_request_sent",
    inmail_message_request: "linkedin_inmail_sent",
    group_message_request: "linkedin_group_message_sent",
    connection_error: "linkedin_connection_error",
    disconnected: "linkedin_disconnected",
  };
  return map[e] ?? `linkedin_${e}`;
}

export async function POST(request: NextRequest, ctx: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await ctx.params;
    if (!verifyToken(token, process.env.DREAMLEADS_WEBHOOK_TOKEN)) {
      captureError(new Error("Invalid Dream Leads webhook token"), {
        level: "warning",
        tags: { source: SOURCE },
      });
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));

    // Dream Leads payload shape is undocumented — normalize defensively.
    const rawType: string =
      body.event ?? body.event_type ?? body.trigger ?? body.type ?? "unknown";
    const eventType = normalizeEventType(rawType);

    const rawId =
      body.id ?? body.event_id ?? body.contact_id ?? body.connection_id ?? null;
    const key = idempotencyKey(eventType, rawId, body);

    if (await isDuplicateEvent(SOURCE, key)) {
      return NextResponse.json({ received: true, duplicate: true });
    }

    const contact = body.contact ?? body.lead ?? body.connection ?? body ?? {};
    const leadName = fullName(
      contact.first_name ?? contact.firstName,
      contact.last_name ?? contact.lastName,
      contact.name ?? contact.full_name ?? body.name ?? null
    );
    const leadProfileUrl =
      contact.profile_url ??
      contact.profileUrl ??
      contact.linkedin_url ??
      contact.public_profile_url ??
      body.profile_url ??
      null;
    const leadIdentifier =
      contact.public_identifier ??
      contact.username ??
      contact.handle ??
      leadProfileUrl ??
      null;
    const leadEmail = contact.email ?? body.email ?? null;
    const campaignName =
      body.campaign_name ?? body.campaign?.name ?? body.campaign ?? null;
    const subject = body.message ?? body.text ?? body.subject ?? null;

    await storeOutreachEvent(SOURCE, key, {
      channel: "linkedin",
      eventType,
      campaignName,
      leadEmail,
      leadName,
      leadIdentifier,
      leadProfileUrl,
      subject: subject ? String(subject).slice(0, 1000) : null,
      payload: body,
    });

    // Audit high-signal LinkedIn events.
    if (
      ["linkedin_connected", "linkedin_message_received", "linkedin_connection_error"].includes(
        eventType
      )
    ) {
      await createAuditLog({
        actorId: SOURCE,
        actorType: "system",
        action: `outreach.${eventType}`,
        entityType: "outreach_event",
        entityId: leadIdentifier ?? leadEmail ?? "unknown",
        metadata: { campaignName, leadName, leadProfileUrl },
      });
    }

    return NextResponse.json({ received: true });
  } catch (error) {
    captureError(error, { tags: { component: "DreamLeads Webhook Error" } });
    // 200 to prevent Dream Leads retry storms.
    return NextResponse.json({ received: true });
  }
}
