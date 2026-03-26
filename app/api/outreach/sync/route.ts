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
import { checkAdmin } from "@/lib/auth";
import { syncCampaigns, syncAllWorkspaces, getWorkspaceKeys } from "@/lib/connectors/emailbison";
import { captureError } from "@/lib/errors";

export async function POST() {
  try {
    const userId = await checkAdmin();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Use multi-workspace sync when EMAILBISON_API_KEYS is set; otherwise fall
    // back to the single-key syncCampaigns() for backward compatibility.
    const useMulti = !!process.env.EMAILBISON_API_KEYS || getWorkspaceKeys().length > 1;

    let campaignsToSync: Array<{ id: number; name: string; status: string; total_leads: number; total_leads_contacted: number; opened: number; replied: number; interested: number; bounced: number; unsubscribed: number; unique_opens: number; unique_replies: number; emails_sent: number; max_emails_per_day: number; tags: Array<{ id: number; name: string }>; workspace: string }>;

    if (useMulti) {
      const { campaigns } = await syncAllWorkspaces();
      campaignsToSync = campaigns;
    } else {
      const { campaigns } = await syncCampaigns();
      campaignsToSync = campaigns.map((c) => ({ ...c, workspace: "default" }));
    }

    let synced = 0;

    for (const c of campaignsToSync) {
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
            workspace: c.workspace,
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
              workspace: c.workspace,
            },
          },
        });
      synced++;
    }

    return NextResponse.json({ success: true, synced });
  } catch (error) {
    captureError(error, { tags: { component: "Outreach Sync Error" } });
    const msg = error instanceof Error ? error.message : "Sync failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
