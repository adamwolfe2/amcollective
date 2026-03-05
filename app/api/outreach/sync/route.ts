/**
 * POST /api/outreach/sync
 *
 * Pulls live campaign + sender data from EmailBison and upserts into
 * outreach_campaigns. Called by the Outreach dashboard "Sync" button
 * and the Inngest sync-emailbison job.
 */

import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { checkAdmin } from "@/lib/auth";
import { syncCampaigns } from "@/lib/connectors/emailbison";

export async function POST() {
  try {
    const userId = await checkAdmin();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { campaigns } = await syncCampaigns();

    let synced = 0;

    for (const c of campaigns) {
      await db
        .insert(schema.outreachCampaigns)
        .values({
          externalId: c.id,
          name: c.name,
          status: c.status,
          totalLeads: c.total_leads,
          contacted: c.total_leads_contacted,
          opened: c.opened,
          replied: c.replied,
          interested: c.interested,
          bounced: c.bounced,
          unsubscribed: c.unsubscribed,
          lastSyncedAt: new Date(),
          updatedAt: new Date(),
          metadata: {
            uniqueOpens: c.unique_opens,
            uniqueReplies: c.unique_replies,
            emailsSent: c.emails_sent,
            maxEmailsPerDay: c.max_emails_per_day,
            tags: c.tags,
          },
        })
        .onConflictDoUpdate({
          target: schema.outreachCampaigns.externalId,
          set: {
            name: c.name,
            status: c.status,
            totalLeads: c.total_leads,
            contacted: c.total_leads_contacted,
            opened: c.opened,
            replied: c.replied,
            interested: c.interested,
            bounced: c.bounced,
            unsubscribed: c.unsubscribed,
            lastSyncedAt: new Date(),
            updatedAt: new Date(),
            metadata: {
              uniqueOpens: c.unique_opens,
              uniqueReplies: c.unique_replies,
              emailsSent: c.emails_sent,
              maxEmailsPerDay: c.max_emails_per_day,
              tags: c.tags,
            },
          },
        });
      synced++;
    }

    return NextResponse.json({ success: true, synced });
  } catch (error) {
    console.error("[Outreach Sync Error]", error);
    const msg = error instanceof Error ? error.message : "Sync failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
