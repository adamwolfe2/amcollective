/**
 * POST /api/outreach/sync — Sync campaigns from EmailBison API
 */

import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { checkAdmin } from "@/lib/auth";
import { getCampaigns } from "@/lib/connectors/emailbison";

export async function POST() {
  try {
    const userId = await checkAdmin();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const result = await getCampaigns();
    if (!result.success || !result.data) {
      return NextResponse.json(
        { error: result.error ?? "Failed to fetch campaigns" },
        { status: 502 }
      );
    }

    let synced = 0;
    for (const campaign of result.data) {
      const existing = await db
        .select()
        .from(schema.outreachCampaigns)
        .where(eq(schema.outreachCampaigns.externalId, campaign.id))
        .limit(1);

      if (existing.length > 0) {
        await db
          .update(schema.outreachCampaigns)
          .set({
            name: campaign.name,
            status: campaign.status,
            lastSyncedAt: new Date(),
            updatedAt: new Date(),
          })
          .where(eq(schema.outreachCampaigns.externalId, campaign.id));
      } else {
        await db.insert(schema.outreachCampaigns).values({
          externalId: campaign.id,
          name: campaign.name,
          status: campaign.status,
          lastSyncedAt: new Date(),
        });
      }
      synced++;
    }

    return NextResponse.json({ synced, total: result.data.length });
  } catch (error) {
    console.error("[Outreach Sync Error]", error);
    return NextResponse.json(
      { error: "Sync failed" },
      { status: 500 }
    );
  }
}
