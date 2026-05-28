/**
 * POST /api/cold-email/campaigns/author
 *
 * End-to-end Bison campaign authoring. Given a workspace + campaign KB,
 * generates a full 4-step sequence with N variants each, validates spintax,
 * and deploys to EmailBison as a brand-new campaign.
 *
 * Body: {
 *   workspace: string,
 *   kb: CampaignKnowledgeBase,
 *   campaignName?: string,
 *   variantsPerStep?: number,
 *   dryRun?: boolean,        // if true, return the authored sequence without deploying
 *   ingestBrandContext?: boolean  // if true, merge content/brands/<workspace>.md into KB before writing
 * }
 */

import { NextResponse } from "next/server";
import { checkAdmin } from "@/lib/auth";
import {
  authorSequence,
  deployAuthoredCampaign,
  validateAuthoredSequence,
  ingestBrandContext,
} from "@/lib/ai/agents/cold-email-coach";
import type { CampaignKnowledgeBase } from "@/lib/db/schema/outreach";
import { captureError } from "@/lib/errors";

export async function POST(req: Request) {
  try {
    const userId = await checkAdmin();
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = (await req.json()) as {
      workspace: string;
      kb: CampaignKnowledgeBase;
      campaignName?: string;
      variantsPerStep?: number;
      dryRun?: boolean;
      ingestBrandContext?: boolean;
    };

    if (!body.workspace || !body.kb) {
      return NextResponse.json(
        { error: "workspace and kb are required" },
        { status: 400 }
      );
    }

    // Optional: pull in content/brands/<workspace>.md to enrich the KB
    let workingKb: CampaignKnowledgeBase = body.kb;
    let brandContextBytes = 0;
    if (body.ingestBrandContext) {
      const result = await ingestBrandContext(body.workspace, workingKb);
      if (result.ok && result.kbPatch) {
        workingKb = { ...workingKb, ...result.kbPatch };
        brandContextBytes = result.bytesIngested;
      }
    }

    const authored = await authorSequence({
      workspace: body.workspace,
      kb: workingKb,
      campaignName: body.campaignName,
      variantsPerStep: body.variantsPerStep,
    });

    const validationIssues = validateAuthoredSequence(authored);

    if (body.dryRun) {
      return NextResponse.json({
        ok: true,
        dryRun: true,
        authored,
        validationIssues,
        brandContextBytes,
      });
    }

    if (validationIssues.length > 0) {
      return NextResponse.json(
        {
          error: "Validation failed before deploy",
          validationIssues,
          authored,
        },
        { status: 422 }
      );
    }

    const deployment = await deployAuthoredCampaign(body.workspace, authored);

    return NextResponse.json({
      ...deployment,
      ok: deployment.ok,
      brandContextBytes,
    });
  } catch (err) {
    captureError(err, { tags: { route: "cold-email/campaigns/author" } });
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 }
    );
  }
}
