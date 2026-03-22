/**
 * EmailBison Webhook Handler
 *
 * Receives events from EmailBison (email_sent, contact_replied, etc.)
 * and stores them in the outreach_events table for the dashboard.
 */

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { eq, sql } from "drizzle-orm";
import { createAuditLog } from "@/lib/db/repositories/audit";
import { captureError } from "@/lib/errors";

export async function POST(request: NextRequest) {
  try {
    // Verify shared secret via X-API-Key header (fail closed if env var missing)
    const expectedKey = process.env.EMAILBISON_API_KEY;
    const providedKey = request.headers.get("x-api-key");
    if (!expectedKey || providedKey !== expectedKey) {
      captureError(new Error("Invalid or missing X-API-Key header"), { level: "warning", tags: { source: "emailbison-webhook" } });
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();

    // EmailBison sends event_type at the top level
    const eventType: string = body.event_type ?? body.event ?? "unknown";

    // Extract common fields from the webhook payload
    const campaignId: number | null = body.campaign_id ?? body.campaign?.id ?? null;
    const campaignName: string | null =
      body.campaign_name ?? body.campaign?.name ?? null;
    const leadEmail: string | null =
      body.lead_email ?? body.lead?.email ?? body.to_email ?? null;
    const leadName: string | null =
      body.lead_name ??
      (body.lead
        ? `${body.lead.first_name ?? ""} ${body.lead.last_name ?? ""}`.trim()
        : null);
    const senderEmail: string | null =
      body.sender_email ?? body.from_email ?? null;
    const subject: string | null = body.subject ?? body.email_subject ?? null;

    // Store the event
    await db.insert(schema.outreachEvents).values({
      eventType,
      campaignId,
      campaignName,
      leadEmail,
      leadName,
      senderEmail,
      subject,
      payload: body,
    });

    // Update campaign stats if we have a valid campaign ID
    if (campaignId == null) {
      captureError(new Error(`No campaignId in ${eventType} event, skipping campaign upsert`), { level: "info", tags: { source: "emailbison-webhook" } });
    } else {
      const columnMap: Record<string, keyof typeof schema.outreachCampaigns> = {
        email_sent: "contacted",
        contact_first_emailed: "contacted",
        email_opened: "opened",
        contact_replied: "replied",
        contact_interested: "interested",
        email_bounced: "bounced",
        contact_unsubscribed: "unsubscribed",
      };

      const column = columnMap[eventType];
      if (column) {
        // Upsert campaign and increment the counter
        const existing = await db
          .select()
          .from(schema.outreachCampaigns)
          .where(eq(schema.outreachCampaigns.externalId, campaignId))
          .limit(1);

        if (existing.length > 0) {
          await db
            .update(schema.outreachCampaigns)
            .set({
              [column]: sql`COALESCE(${schema.outreachCampaigns[column]}, 0) + 1`,
              ...(campaignName ? { name: campaignName } : {}),
              updatedAt: new Date(),
            })
            .where(eq(schema.outreachCampaigns.externalId, campaignId));
        } else {
          await db.insert(schema.outreachCampaigns).values({
            externalId: campaignId,
            name: campaignName ?? `Campaign ${campaignId}`,
            [column]: 1,
          });
        }
      }
    }

    // Audit log for interesting events
    if (["contact_replied", "contact_interested", "email_bounced"].includes(eventType)) {
      await createAuditLog({
        actorId: "emailbison",
        actorType: "system",
        action: `outreach.${eventType}`,
        entityType: "outreach_event",
        entityId: leadEmail ?? "unknown",
        metadata: { campaignId, campaignName, subject },
      });
    }

    return NextResponse.json({ received: true });
  } catch (error) {
    captureError(error, { tags: { component: "EmailBison Webhook Error" } });
    // Return 200 to prevent EmailBison retry storms
    return NextResponse.json({ received: true });
  }
}
