/**
 * Inngest Job — Cold Email Research Loop ("Bison")
 *
 * Runs daily at 13:00 UTC (~6am Pacific). The continuous autoresearch agent
 * that improves every brand's cold-email reply rate by:
 *
 *  1. Pulling fresh per-step metrics from every EmailBison workspace.
 *  2. For each step with ≥50 sends, running the weakness analyzer.
 *  3. Generating challenger variants for the top weakness (one lever changed).
 *  4. Persisting experiments as pending_approval (Adam decides yes/no via UI).
 *  5. Evaluating any experiments whose evaluation window has closed.
 *  6. Auditing each campaign's KB for gaps and posting questions to the
 *     cold_email_questions queue (dashboard "AGENT QUESTIONS" widget).
 *  7. Writing a per-workspace daily insight to cold_email_insights.
 *
 * Multi-workspace via EMAILBISON_API_KEYS env var (comma-separated workspace:key
 * pairs — see lib/connectors/emailbison.ts).
 *
 * Triggered also via `cold-email/research.run` event for manual runs.
 */

import { inngest } from "../client";
import { captureError } from "@/lib/errors";
import { db } from "@/lib/db";
import {
  outreachCampaigns,
  coldEmailQuestions,
  coldEmailExperiments,
  coldEmailInsights,
  type CampaignKnowledgeBase,
} from "@/lib/db/schema";
import {
  getWorkspaceKeys,
  type EmailBisonCampaign,
} from "@/lib/connectors/emailbison";
import {
  analyzeCampaignStep,
  generateChallenger,
  auditKnowledgeBase,
  generateDailyInsight,
  evaluateExperiment,
  type CampaignMetrics,
} from "@/lib/ai/agents/cold-email-coach";
import { and, eq, lte, isNotNull, inArray } from "drizzle-orm";

const DEFAULT_BASE_URL = process.env.EMAILBISON_BASE_URL;

// ─── Fetch helpers ───────────────────────────────────────────────────────────

async function bisonFetch<T>(
  apiKey: string,
  path: string,
  baseUrlOverride?: string
): Promise<T> {
  const baseUrl = baseUrlOverride ?? DEFAULT_BASE_URL;
  if (!baseUrl) throw new Error("EMAILBISON_BASE_URL not set");
  const res = await fetch(`${baseUrl}/api${path}`, {
    headers: {
      Authorization: `Bearer ${apiKey}`,
      Accept: "application/json",
    },
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`EmailBison ${res.status}: ${path}`);
  return res.json() as Promise<T>;
}

async function fetchCampaignsForWorkspace(
  apiKey: string,
  baseUrl?: string
): Promise<EmailBisonCampaign[]> {
  const data = await bisonFetch<{ data: EmailBisonCampaign[] }>(
    apiKey,
    "/campaigns?per_page=200",
    baseUrl
  );
  return data.data ?? [];
}

interface SequenceStepResp {
  data: Array<{
    id: number;
    title: string;
    sequence_steps: Array<{
      id: number;
      email_subject: string;
      email_body: string;
      emails_sent?: number;
      opened?: number;
      replied?: number;
      variant?: boolean;
      variant_from_step?: number | null;
    }>;
  }>;
}

async function fetchSequenceSteps(
  apiKey: string,
  campaignId: number,
  baseUrl?: string
): Promise<CampaignMetrics["steps"]> {
  try {
    const data = await bisonFetch<SequenceStepResp>(
      apiKey,
      `/campaigns/${campaignId}/sequence-steps`,
      baseUrl
    );
    const steps: NonNullable<CampaignMetrics["steps"]> = [];
    for (const sequence of data.data ?? []) {
      for (const s of sequence.sequence_steps ?? []) {
        const sends = s.emails_sent ?? 0;
        const opens = s.opened ?? 0;
        const replies = s.replied ?? 0;
        steps.push({
          sequenceStep: sequence.id ?? s.id,
          variantLabel: s.variant
            ? `variant of step ${s.variant_from_step ?? "?"}`
            : "primary",
          subject: s.email_subject,
          body: s.email_body,
          sends,
          opens,
          replies,
          openRatePct: sends > 0 ? (opens / sends) * 100 : 0,
          replyRatePct: sends > 0 ? (replies / sends) * 100 : 0,
        });
      }
    }
    return steps;
  } catch {
    return [];
  }
}

// ─── The Cron Loop ───────────────────────────────────────────────────────────

export const coldEmailResearchLoop = inngest.createFunction(
  {
    id: "cold-email-research-loop",
    name: "Cold Email Research Loop (Bison)",
    retries: 1,
    onFailure: async ({ error }) => {
      captureError(error, {
        tags: { source: "inngest", job: "cold-email-research-loop" },
        level: "warning",
      });
    },
  },
  [
    { cron: "0 13 * * *" }, // daily ~6am Pacific
    { event: "cold-email/research.run" },
  ],
  async ({ step, event }) => {
    const keys = getWorkspaceKeys();
    if (keys.length === 0) return { skipped: true, reason: "No EmailBison API keys configured" };
    // We only need DEFAULT_BASE_URL if any workspace lacks its own base_url.
    if (!DEFAULT_BASE_URL && keys.some((k) => !k.baseUrl)) {
      return { skipped: true, reason: "EMAILBISON_BASE_URL missing and not all workspaces have base_url" };
    }

    const overrideWorkspace =
      typeof event?.data === "object" && event.data && "workspace" in event.data
        ? (event.data as { workspace: string }).workspace
        : null;

    const targets = overrideWorkspace
      ? keys.filter((k) => k.workspace === overrideWorkspace)
      : keys;

    const today = new Date().toISOString().slice(0, 10);
    const summary = {
      workspaces: 0,
      campaigns: 0,
      analyzedSteps: 0,
      experimentsCreated: 0,
      experimentsEvaluated: 0,
      questionsCreated: 0,
      insightsCreated: 0,
    };

    // ── Process each workspace independently ──────────────────────────────
    for (const { workspace, apiKey, baseUrl } of targets) {
      summary.workspaces++;

      // 1. Pull campaigns for this workspace
      const campaigns = await step.run(`${workspace}:fetch-campaigns`, async () => {
        try {
          return await fetchCampaignsForWorkspace(apiKey, baseUrl);
        } catch (err) {
          captureError(err, { tags: { workspace, source: "bison-loop" } });
          return [];
        }
      });

      // Only analyze active/running campaigns
      const active = campaigns.filter((c) =>
        ["active", "running", "live"].includes(c.status?.toLowerCase() ?? "")
      );

      const workspaceMetrics: CampaignMetrics[] = [];

      for (const c of active) {
        summary.campaigns++;

        const rawSteps = await step.run(
          `${workspace}:${c.id}:fetch-steps`,
          async () => fetchSequenceSteps(apiKey, c.id, baseUrl)
        );
        // step.run JSON-roundtrips its result; cast back to the expected shape.
        const steps: NonNullable<CampaignMetrics["steps"]> =
          (rawSteps ?? []) as NonNullable<CampaignMetrics["steps"]>;

        const totalSends = c.emails_sent ?? 0;
        const totalOpens = c.opened ?? 0;
        const totalReplies = c.replied ?? 0;
        const bounced = c.bounced ?? 0;
        const metrics: CampaignMetrics = {
          externalId: c.id,
          name: c.name,
          workspace,
          status: c.status,
          totalSends,
          totalOpens,
          totalReplies,
          openRatePct: totalSends > 0 ? (totalOpens / totalSends) * 100 : 0,
          replyRatePct: totalSends > 0 ? (totalReplies / totalSends) * 100 : 0,
          bounceRatePct: totalSends > 0 ? (bounced / totalSends) * 100 : 0,
          steps,
        };
        workspaceMetrics.push(metrics);

        // 2. Load local KB
        const local = await db
          .select({ knowledgeBase: outreachCampaigns.knowledgeBase })
          .from(outreachCampaigns)
          .where(eq(outreachCampaigns.externalId, c.id))
          .limit(1);
        const kb: CampaignKnowledgeBase | null = local[0]?.knowledgeBase ?? null;

        // 3. Audit KB → questions
        const auditQs = await step.run(`${workspace}:${c.id}:audit-kb`, async () =>
          auditKnowledgeBase(c.name, workspace, kb, metrics)
        );

        if (auditQs.length > 0) {
          await step.run(`${workspace}:${c.id}:insert-questions`, async () => {
            for (const q of auditQs) {
              await db
                .insert(coldEmailQuestions)
                .values({
                  campaignExternalId: c.id,
                  campaignName: c.name,
                  workspace,
                  category: q.category,
                  question: q.question,
                  reasoning: q.reasoning,
                  suggestedAnswers: q.suggestedAnswers,
                  priority: q.priority,
                  answeredAction: q.answeredAction,
                  expiresAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
                })
                .onConflictDoNothing();
              summary.questionsCreated++;
            }
          });
        }

        // 4. Analyze each step with ≥50 sends and propose challengers
        for (const s of steps) {
          if (s.sends < 50) continue;
          summary.analyzedSteps++;

          const diagnosis = await step.run(
            `${workspace}:${c.id}:step-${s.sequenceStep}:analyze`,
            async () => analyzeCampaignStep(metrics, s, kb)
          );

          // Only propose challenger if there's an actionable weakness with confidence
          if (
            diagnosis.proposedLever === "skip" ||
            diagnosis.weakness === "sample_too_small" ||
            diagnosis.confidence < 0.55
          ) {
            continue;
          }

          // Skip if there's already a running experiment on this step
          const existing = await db
            .select({ id: coldEmailExperiments.id })
            .from(coldEmailExperiments)
            .where(
              and(
                eq(coldEmailExperiments.campaignExternalId, c.id),
                eq(coldEmailExperiments.sequenceStep, s.sequenceStep),
                inArray(coldEmailExperiments.status, [
                  "pending_approval",
                  "running",
                  "evaluating",
                ])
              )
            )
            .limit(1);
          if (existing.length > 0) continue;

          const challenger = await step.run(
            `${workspace}:${c.id}:step-${s.sequenceStep}:challenger`,
            async () => generateChallenger(metrics, s, diagnosis, kb)
          );

          await db.insert(coldEmailExperiments).values({
            campaignExternalId: c.id,
            campaignName: c.name,
            workspace,
            sequenceStep: s.sequenceStep,
            lever: diagnosis.proposedLever as
              | "subject_line"
              | "opener"
              | "body"
              | "cta"
              | "personalization_token"
              | "full_rewrite",
            hypothesis: diagnosis.recommendation,
            baselineSubject: s.subject,
            baselineBody: s.body,
            baselineSends: s.sends,
            baselineOpens: s.opens,
            baselineReplies: s.replies,
            baselineReplyRate: s.replyRatePct / 100,
            challengerSubject: challenger.subject,
            challengerBody: challenger.body,
            reasoning: `${diagnosis.reasoning}\n\nChallenger rationale: ${challenger.rationale}`,
            status: "pending_approval",
            requiresApproval: true,
          });
          summary.experimentsCreated++;
        }
      }

      // 5. Evaluate experiments whose window has closed
      const evaluable = await db
        .select()
        .from(coldEmailExperiments)
        .where(
          and(
            eq(coldEmailExperiments.status, "running"),
            isNotNull(coldEmailExperiments.evaluateAfter),
            lte(coldEmailExperiments.evaluateAfter, new Date())
          )
        );

      for (const exp of evaluable) {
        const result = evaluateExperiment({
          baselineSends: exp.baselineSends ?? 0,
          baselineReplies: exp.baselineReplies ?? 0,
          challengerSends: exp.challengerSends ?? 0,
          challengerReplies: exp.challengerReplies ?? 0,
          minSampleSize: exp.minSampleSize,
          minRelativeLift: exp.minRelativeLift,
        });

        await db
          .update(coldEmailExperiments)
          .set({
            status: result.decision,
            baselineReplyRate: result.baselineReplyRate,
            challengerReplyRate: result.challengerReplyRate,
            decisionNotes: result.notes,
            evaluatedAt: new Date(),
            updatedAt: new Date(),
          })
          .where(eq(coldEmailExperiments.id, exp.id));
        summary.experimentsEvaluated++;
      }

      // 6. Daily insight per workspace
      if (workspaceMetrics.length > 0) {
        const insight = await step.run(`${workspace}:daily-insight`, async () =>
          generateDailyInsight(workspace, workspaceMetrics)
        );
        if (insight) {
          await db.insert(coldEmailInsights).values({
            forDate: today,
            workspace,
            headline: insight.headline,
            body: insight.body,
            severity: insight.severity,
            metricsSnapshot: {
              campaigns: workspaceMetrics.map((m) => ({
                id: m.externalId,
                name: m.name,
                sends: m.totalSends,
                openRate: m.openRatePct,
                replyRate: m.replyRatePct,
                bounceRate: m.bounceRatePct,
              })),
            },
          });
          summary.insightsCreated++;
        }
      }
    }

    return { ok: true, ...summary };
  }
);
