/**
 * POST /api/cold-email/questions/[id]/answer
 *
 * Records the user's answer to a Bison question and applies the
 * corresponding action (typically patching the campaign KB).
 *
 * Body: { answer: string }
 */

import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { coldEmailQuestions, outreachCampaigns } from "@/lib/db/schema";
import type { CampaignKnowledgeBase } from "@/lib/db/schema/outreach";
import { checkAdmin } from "@/lib/auth";
import { eq } from "drizzle-orm";
import { captureError } from "@/lib/errors";

function setKbField(
  kb: CampaignKnowledgeBase,
  field: string,
  value: string
): CampaignKnowledgeBase {
  // Dot-path setter — handles "icp.painPoints", "copyGuidelines.use", etc.
  // Always returns a NEW object (immutability).
  const parts = field.split(".");
  if (parts.length === 1) {
    // Top-level field
    if (field === "proof") {
      return {
        ...kb,
        proof: [...(kb.proof ?? []), { result: value }],
      };
    }
    return { ...kb, [field]: value };
  }
  if (parts.length === 2) {
    const [a, b] = parts;
    if (a === "icp" && b === "painPoints") {
      return {
        ...kb,
        icp: { ...kb.icp, painPoints: [...(kb.icp.painPoints ?? []), value] },
      };
    }
    if (a === "copyGuidelines" && b === "use") {
      return {
        ...kb,
        copyGuidelines: {
          ...(kb.copyGuidelines ?? {}),
          use: [...(kb.copyGuidelines?.use ?? []), value],
        },
      };
    }
    if (a === "copyGuidelines" && b === "avoid") {
      return {
        ...kb,
        copyGuidelines: {
          ...(kb.copyGuidelines ?? {}),
          avoid: [...(kb.copyGuidelines?.avoid ?? []), value],
        },
      };
    }
  }
  // Unknown path — store the raw answer in notes for manual review
  const stamp = `\n[${field}] ${value}\n`;
  return { ...kb, notes: (kb.notes ?? "") + stamp };
}

export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  try {
    const userId = await checkAdmin();
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id } = await ctx.params;
    const body = (await req.json()) as { answer: string };
    if (!body.answer?.trim()) {
      return NextResponse.json({ error: "answer required" }, { status: 400 });
    }

    const [q] = await db
      .select()
      .from(coldEmailQuestions)
      .where(eq(coldEmailQuestions.id, id))
      .limit(1);

    if (!q) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (q.status !== "open") {
      return NextResponse.json(
        { error: `Cannot answer — status is ${q.status}` },
        { status: 400 }
      );
    }

    // Apply the answered action
    let kbUpdated = false;
    if (q.answeredAction?.type === "update_kb_field" && q.answeredAction.field && q.campaignExternalId) {
      const [camp] = await db
        .select({ knowledgeBase: outreachCampaigns.knowledgeBase })
        .from(outreachCampaigns)
        .where(eq(outreachCampaigns.externalId, q.campaignExternalId))
        .limit(1);
      const currentKb = (camp?.knowledgeBase ?? null) as CampaignKnowledgeBase | null;
      if (currentKb) {
        const updated = setKbField(currentKb, q.answeredAction.field, body.answer);
        await db
          .update(outreachCampaigns)
          .set({ knowledgeBase: { ...updated, updatedAt: new Date().toISOString() }, updatedAt: new Date() })
          .where(eq(outreachCampaigns.externalId, q.campaignExternalId));
        kbUpdated = true;
      }
    }

    await db
      .update(coldEmailQuestions)
      .set({
        status: "answered",
        answerText: body.answer,
        answeredAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(coldEmailQuestions.id, id));

    return NextResponse.json({ ok: true, kbUpdated });
  } catch (err) {
    captureError(err, { tags: { route: "cold-email/questions/answer" } });
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 }
    );
  }
}
