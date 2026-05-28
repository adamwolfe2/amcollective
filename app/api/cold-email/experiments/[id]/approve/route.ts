/**
 * POST /api/cold-email/experiments/[id]/approve
 *
 * Approves a pending challenger experiment and deploys it to EmailBison as a
 * new variant on the same sequence step group. Sets evaluateAfter = now + 7d
 * (configurable via request body).
 */

import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { coldEmailExperiments } from "@/lib/db/schema";
import { checkAdmin } from "@/lib/auth";
import { eq } from "drizzle-orm";
import { deployChallenger } from "@/lib/ai/agents/cold-email-coach";
import { captureError } from "@/lib/errors";

export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  try {
    const userId = await checkAdmin();
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id } = await ctx.params;
    const body = (await req.json().catch(() => ({}))) as {
      evaluateAfterDays?: number;
      baselineStepExternalId?: number;
    };
    const evalDays = Math.max(1, Math.min(60, body.evaluateAfterDays ?? 7));

    const [exp] = await db
      .select()
      .from(coldEmailExperiments)
      .where(eq(coldEmailExperiments.id, id))
      .limit(1);

    if (!exp) return NextResponse.json({ error: "Experiment not found" }, { status: 404 });
    if (exp.status !== "pending_approval") {
      return NextResponse.json(
        { error: `Cannot approve — status is ${exp.status}` },
        { status: 400 }
      );
    }
    if (!exp.challengerSubject || !exp.challengerBody) {
      return NextResponse.json(
        { error: "Experiment has no challenger draft" },
        { status: 400 }
      );
    }

    const deployment = await deployChallenger(
      {
        campaignExternalId: exp.campaignExternalId,
        baselineStepId: body.baselineStepExternalId,
        sequenceStep: exp.sequenceStep,
        lever: exp.lever,
        challengerSubject: exp.challengerSubject,
        challengerBody: exp.challengerBody,
        workspace: exp.workspace ?? undefined,
      },
      exp.baselineSubject ?? "",
      exp.baselineBody ?? ""
    );

    if (!deployment.ok) {
      return NextResponse.json(
        {
          error: "Deployment failed",
          validationIssues: deployment.validationIssues,
          message: deployment.error,
        },
        { status: 422 }
      );
    }

    await db
      .update(coldEmailExperiments)
      .set({
        status: "running",
        approvedAt: new Date(),
        deployedAt: new Date(),
        challengerStepExternalId: deployment.challengerStepExternalId ?? null,
        evaluateAfter: new Date(Date.now() + evalDays * 24 * 60 * 60 * 1000),
        requiresApproval: false,
        updatedAt: new Date(),
      })
      .where(eq(coldEmailExperiments.id, id));

    return NextResponse.json({
      ok: true,
      challengerStepExternalId: deployment.challengerStepExternalId,
      evaluateAfterDays: evalDays,
    });
  } catch (err) {
    captureError(err, { tags: { route: "cold-email/experiments/approve" } });
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 }
    );
  }
}
