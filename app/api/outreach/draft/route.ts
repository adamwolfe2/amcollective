/**
 * POST /api/outreach/draft
 *
 * Generates a cold email draft for a given campaign + prospect.
 * Called by the outreach dashboard "Draft with AI" UI.
 *
 * Body: { campaignId, prospect, emailType, instruction?, fullSequence?, useHighQuality? }
 */

import { NextRequest, NextResponse } from "next/server";
import { checkAdmin } from "@/lib/auth";
import { captureError } from "@/lib/errors";
import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { draftColdEmail, draftFullSequence } from "@/lib/ai/agents/outreach-agent";
import type { CampaignKnowledgeBase } from "@/lib/db/schema/outreach";
import type { ProspectContext } from "@/lib/ai/agents/outreach-agent";

export async function POST(request: NextRequest) {
  const userId = await checkAdmin();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const body = await request.json() as {
      campaignId: number;
      prospect?: ProspectContext;
      emailType?: "initial" | "followup-1" | "followup-2" | "followup-3" | "breakup";
      instruction?: string;
      fullSequence?: boolean;
      useHighQuality?: boolean;
    };

    if (!body.campaignId) {
      return NextResponse.json({ error: "campaignId is required" }, { status: 400 });
    }

    // Load campaign + knowledge base
    const [campaign] = await db
      .select({
        id: schema.outreachCampaigns.id,
        externalId: schema.outreachCampaigns.externalId,
        name: schema.outreachCampaigns.name,
        knowledgeBase: schema.outreachCampaigns.knowledgeBase,
      })
      .from(schema.outreachCampaigns)
      .where(eq(schema.outreachCampaigns.externalId, body.campaignId))
      .limit(1);

    if (!campaign) {
      return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
    }

    const knowledgeBase = campaign.knowledgeBase as CampaignKnowledgeBase | null;
    if (!knowledgeBase) {
      return NextResponse.json(
        {
          error: "This campaign has no knowledge base set up yet.",
          tip: "Set it via ClaudeBot ('set the ICP for [campaign]') or the campaign knowledge editor in the outreach dashboard.",
        },
        { status: 422 }
      );
    }

    const prospect: ProspectContext = body.prospect ?? {};
    const campaignName = campaign.name;

    if (body.fullSequence) {
      const drafts = await draftFullSequence(
        campaignName,
        knowledgeBase,
        prospect,
        body.useHighQuality ?? false
      );
      return NextResponse.json({
        campaign: campaignName,
        sequence: drafts.map((d, i) => ({
          step: i + 1,
          type: ["initial", "followup-1", "followup-2", "followup-3", "breakup"][i],
          subjectLine: d.subjectLine,
          body: d.body,
          reasoning: d.reasoning,
        })),
      });
    }

    const draft = await draftColdEmail({
      campaignName,
      knowledgeBase,
      prospect,
      emailType: body.emailType ?? "initial",
      instruction: body.instruction,
      useHighQuality: body.useHighQuality ?? false,
    });

    return NextResponse.json({
      campaign: campaignName,
      subjectLine: draft.subjectLine,
      body: draft.body,
      reasoning: draft.reasoning,
      warnings: draft.warnings,
    });
  } catch (error) {
    captureError(error, { tags: { route: "POST /api/outreach/draft" } });
    return NextResponse.json({ error: "Failed to generate email draft" }, { status: 500 });
  }
}
