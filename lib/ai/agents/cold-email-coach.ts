/**
 * Cold Email Coach — "Bison"
 *
 * Continuously running optimization agent for every brand's cold-email campaigns.
 * Trained per-brand via the CampaignKnowledgeBase JSONB on outreach_campaigns,
 * and surfaces questions to the user when the KB has gaps that limit copy quality.
 *
 * Persona: Bison. Same surface as Tara/Alex/Carl (briefings + agent questions).
 *
 * Responsibilities:
 *  1. ANALYZE — for each active campaign step, identify the single biggest
 *     weakness limiting reply rate.
 *  2. CHALLENGE — generate a challenger variant that addresses ONLY that
 *     weakness (one-variable-per-iteration discipline).
 *  3. AUDIT KB — check each campaign's knowledge base for missing offer details,
 *     proof points, or ICP clarity. Surface questions where gaps exist.
 *  4. INSIGHTS — produce a short daily briefing per workspace summarizing
 *     "what Bison did overnight" for the dashboard.
 *
 * Called by:
 *  - lib/inngest/jobs/cold-email-research-loop.ts (daily cron)
 *  - CEO agent via tool calls (manual triggers from /command UI)
 *  - POST /api/cold-email/analyze (ad-hoc UI button)
 *
 * Voice: identical to reply-responder (Adam's tone) when generating challenger
 * copy. Analytical/concise when producing briefings.
 */

import { isAIConfigured, MODEL_SONNET, MODEL_HAIKU } from "../client";
import { getTrackedAnthropicClient } from "../tracked-client";
import { COLD_EMAIL_PLAYBOOK_PROMPT } from "../knowledge/cold-email-playbook";
import {
  validateSpintax,
  extractTokens,
  createCampaign as ebCreateCampaign,
  addSequenceStepGroup,
  updateSequenceStep,
  attachSenderToCampaign,
  pauseCampaign,
  resumeCampaign,
  type SequenceStepInput,
} from "@/lib/connectors/emailbison";
import type { CampaignKnowledgeBase } from "@/lib/db/schema/outreach";
import fs from "node:fs/promises";
import path from "node:path";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface CampaignMetrics {
  externalId: number;
  name: string;
  workspace?: string;
  status: string;
  totalSends: number;
  totalOpens: number;
  totalReplies: number;
  openRatePct: number;       // 0-100
  replyRatePct: number;      // 0-100
  bounceRatePct: number;     // 0-100
  /** Per-step breakdown when available */
  steps?: Array<{
    sequenceStep: number;
    variantLabel?: string;
    subject?: string;
    body?: string;
    sends: number;
    opens: number;
    replies: number;
    openRatePct: number;
    replyRatePct: number;
  }>;
}

export type WeaknessCategory =
  | "subject_line"          // low open rate vs benchmark
  | "opener"                // opens but no replies → message body weak
  | "value_prop"            // generic, not specific to ICP
  | "cta"                   // ask too big or unclear
  | "personalization"       // template-y, no persona-fit
  | "proof"                 // missing or weak social proof
  | "length"                // too long
  | "tone"                  // wrong calibration for ICP seniority
  | "deliverability"        // bounce or spam signal
  | "sample_too_small";     // not enough data yet — skip

export interface WeaknessDiagnosis {
  weakness: WeaknessCategory;
  /** Confidence 0-1 */
  confidence: number;
  /** One-paragraph explanation grounded in the metrics */
  reasoning: string;
  /** Concrete recommendation — passed to the challenger generator */
  recommendation: string;
  /** Lever to test next */
  proposedLever:
    | "subject_line"
    | "opener"
    | "body"
    | "cta"
    | "personalization_token"
    | "full_rewrite"
    | "skip";
}

export interface ChallengerVariant {
  subject: string;
  body: string;
  /** Why this challenger beats the baseline */
  rationale: string;
  /** Confidence the challenger will improve the metric (0-1) */
  expectedLiftConfidence: number;
}

export interface KnowledgeBaseAuditQuestion {
  category:
    | "offer"
    | "proof"
    | "icp"
    | "creative"
    | "deliverability"
    | "sequence"
    | "other";
  question: string;
  reasoning: string;
  suggestedAnswers?: string[];
  priority: 0 | 1 | 2;
  /** What Bison will do with the answer */
  answeredAction: {
    type: "update_kb_field" | "generate_experiment" | "pause_campaign" | "custom";
    field?: keyof CampaignKnowledgeBase | string;
    notes?: string;
  };
}

export interface DailyInsight {
  headline: string;
  body: string;
  severity: 0 | 1 | 2;
}

// ─── Bison Persona Prompt ─────────────────────────────────────────────────────

const BISON_PERSONA = `You are Bison — AM Collective's cold-email optimization agent.

Same surface as Tara (tax), Alex (records), Carl (cash). You're the one who watches every cold-email campaign across every brand in the portfolio (Cursive, CampusGTM, Wholesail, Olander, TBGC, etc.) and continuously improves them.

Voice when surfacing insights and questions to the user (Adam):
- Direct, terse, numbers-first. No fluff.
- Lead with the metric that moved. End with the specific ask.
- Lowercase ok. No emoji. No "great news" / "exciting update" energy.
- One concrete recommendation per insight. No "you might consider..." — say what to do.

Voice when generating challenger email copy: follow the Cold Email Playbook above exactly. You are writing as the founder/operator of whichever brand owns the campaign (David Byrne for Olander, Adam for CampusGTM, etc.) — peer to peer.

Discipline rules — non-negotiable:
- ONE variable changed per experiment. Never test subject + body + CTA simultaneously.
- Floor: 50 sends per arm before claiming a winner.
- Promote on ≥20% relative lift only. Below that = inconclusive.
- If the data isn't there yet, say "insufficient sample" and recommend more sends.
- If the KB is missing the info you need (no proof points, vague ICP, no offer), STOP and surface a question to the user instead of fabricating.

You speak about yourself in third person in briefings ("Bison flagged...", "Bison promoted..."). Like an internal tool, not a person.`;

// ─── 1. ANALYZE — find the single biggest weakness in a step ─────────────────

export async function analyzeCampaignStep(
  metrics: CampaignMetrics,
  step: NonNullable<CampaignMetrics["steps"]>[number],
  knowledgeBase: CampaignKnowledgeBase | null
): Promise<WeaknessDiagnosis> {
  if (!isAIConfigured()) {
    return {
      weakness: "sample_too_small",
      confidence: 0,
      reasoning: "AI not configured.",
      recommendation: "Set ANTHROPIC_API_KEY.",
      proposedLever: "skip",
    };
  }

  // Sample size guard — never analyze under 50 sends
  if (step.sends < 50) {
    return {
      weakness: "sample_too_small",
      confidence: 1,
      reasoning: `Only ${step.sends} sends on this step. Need ≥50 before evaluating.`,
      recommendation: "Continue sending; revisit once sample size hits 50.",
      proposedLever: "skip",
    };
  }

  const client = getTrackedAnthropicClient({ agent: "bison-analyzer" })!;

  const kbBlock = knowledgeBase
    ? `## Campaign knowledge base
Product: ${knowledgeBase.productName}
Value prop: ${knowledgeBase.valueProp}
ICP roles: ${knowledgeBase.icp.roles.join(", ")}
ICP industries: ${knowledgeBase.icp.industries.join(", ")}
ICP pain points: ${knowledgeBase.icp.painPoints.join("; ")}
Tone: ${knowledgeBase.toneProfile}
Proof points: ${
        knowledgeBase.proof?.map((p) => `${p.company ?? "anon"}: ${p.result}`).join(" | ") ??
        "(none on file)"
      }`
    : "## Campaign knowledge base\n(missing — flag this as an audit question)";

  const userPrompt = `Analyze this campaign step and identify the SINGLE biggest weakness limiting reply rate. Do not list multiple weaknesses — pick the one most likely to improve performance if fixed.

## Campaign
Name: ${metrics.name}
Workspace: ${metrics.workspace ?? "unknown"}
Overall reply rate: ${metrics.replyRatePct.toFixed(2)}%
Overall open rate: ${metrics.openRatePct.toFixed(2)}%
Bounce rate: ${metrics.bounceRatePct.toFixed(2)}%

## Step under review
Sequence step: ${step.sequenceStep}
Variant: ${step.variantLabel ?? "(unnamed)"}
Subject: "${step.subject ?? ""}"
Body:
"""
${step.body ?? ""}
"""

Stats for this step:
- Sends: ${step.sends}
- Opens: ${step.opens} (${step.openRatePct.toFixed(2)}%)
- Replies: ${step.replies} (${step.replyRatePct.toFixed(2)}%)

${kbBlock}

## Benchmarks for reference
- Open rate: 40-45% good, 50%+ excellent
- Reply rate: 5-10% good, 10-15% excellent
- Bounce rate: under 4% good

## Analysis frame
If open rate is below 40% → weakness is likely subject_line.
If open rate is healthy but reply rate is below 3% → weakness is in opener, body, or CTA.
If both are weak → likely value_prop or personalization mismatch with ICP.
If bounce rate >4% → deliverability (independent of copy).

Return ONLY valid JSON:
{
  "weakness": "<one of: subject_line | opener | value_prop | cta | personalization | proof | length | tone | deliverability | sample_too_small>",
  "confidence": <float 0-1>,
  "reasoning": "<2-3 sentence explanation grounded in the metrics>",
  "recommendation": "<one concrete suggestion for the challenger — what to change>",
  "proposedLever": "<one of: subject_line | opener | body | cta | personalization_token | full_rewrite | skip>"
}`;

  const message = await client.messages.create({
    model: MODEL_SONNET,
    max_tokens: 600,
    system: [
      { type: "text", text: COLD_EMAIL_PLAYBOOK_PROMPT, cache_control: { type: "ephemeral" } },
      { type: "text", text: BISON_PERSONA, cache_control: { type: "ephemeral" } },
    ],
    messages: [{ role: "user", content: userPrompt }],
  });

  const raw = message.content[0].type === "text" ? message.content[0].text : "";
  const jsonStr = raw.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "").trim();

  try {
    const parsed = JSON.parse(jsonStr) as WeaknessDiagnosis;
    return {
      weakness: parsed.weakness ?? "sample_too_small",
      confidence: typeof parsed.confidence === "number" ? parsed.confidence : 0,
      reasoning: parsed.reasoning ?? "",
      recommendation: parsed.recommendation ?? "",
      proposedLever: parsed.proposedLever ?? "skip",
    };
  } catch {
    return {
      weakness: "sample_too_small",
      confidence: 0,
      reasoning: "Analyzer returned non-JSON response.",
      recommendation: "Manual review.",
      proposedLever: "skip",
    };
  }
}

// ─── 2. CHALLENGE — generate a challenger variant ────────────────────────────

export async function generateChallenger(
  metrics: CampaignMetrics,
  step: NonNullable<CampaignMetrics["steps"]>[number],
  diagnosis: WeaknessDiagnosis,
  knowledgeBase: CampaignKnowledgeBase | null
): Promise<ChallengerVariant> {
  if (!isAIConfigured()) {
    return {
      subject: "",
      body: "",
      rationale: "AI not configured.",
      expectedLiftConfidence: 0,
    };
  }

  const client = getTrackedAnthropicClient({ agent: "bison-challenger" })!;

  const kbBlock = knowledgeBase
    ? `## Knowledge base
Product: ${knowledgeBase.productName}
Value prop: ${knowledgeBase.valueProp}
ICP: ${knowledgeBase.icp.roles.join(", ")} in ${knowledgeBase.icp.industries.join(", ")}
Pain points: ${knowledgeBase.icp.painPoints.join("; ")}
Tone: ${knowledgeBase.toneProfile}
Proof points: ${
        knowledgeBase.proof?.map((p) => `${p.company ?? "anon"}: ${p.result}`).join(" | ") ??
        "(none)"
      }`
    : "## Knowledge base\n(missing — write generically and flag this in rationale)";

  const userPrompt = `Generate a challenger variant for this campaign step. Change ONLY the element identified by the diagnosis — leave everything else intact.

## Baseline (current production)
Subject: "${step.subject ?? ""}"
Body:
"""
${step.body ?? ""}
"""

## Performance
${step.sends} sends, ${step.openRatePct.toFixed(2)}% opens, ${step.replyRatePct.toFixed(2)}% replies.

## Diagnosis
Weakness: ${diagnosis.weakness}
Reasoning: ${diagnosis.reasoning}
Recommendation: ${diagnosis.recommendation}
Lever to change: ${diagnosis.proposedLever}

${kbBlock}

## Discipline
Change ONLY the ${diagnosis.proposedLever}. If lever is "subject_line", keep the body 100% identical. If "opener", change ONLY the first sentence. If "cta", change ONLY the final ask. If "full_rewrite", you may rewrite both subject and body but stay within the playbook (peer voice, plain text, 25-75 words, single ask).

Preserve all merge tags exactly: {first_name}, {company_name}, {industry}, {cert_standard}, {cert_focus}, {job_title}, {department}, and any others present in the baseline.

Return ONLY valid JSON:
{
  "subject": "<new subject — or unchanged if lever isn't subject_line>",
  "body": "<new body — or unchanged if lever is subject_line>",
  "rationale": "<2-3 sentences on why this should beat the baseline>",
  "expectedLiftConfidence": <float 0-1>
}`;

  const message = await client.messages.create({
    model: MODEL_SONNET,
    max_tokens: 1200,
    system: [
      { type: "text", text: COLD_EMAIL_PLAYBOOK_PROMPT, cache_control: { type: "ephemeral" } },
      { type: "text", text: BISON_PERSONA, cache_control: { type: "ephemeral" } },
    ],
    messages: [{ role: "user", content: userPrompt }],
  });

  const raw = message.content[0].type === "text" ? message.content[0].text : "";
  const jsonStr = raw.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "").trim();

  try {
    const parsed = JSON.parse(jsonStr) as ChallengerVariant;
    return {
      subject: parsed.subject ?? step.subject ?? "",
      body: parsed.body ?? step.body ?? "",
      rationale: parsed.rationale ?? "",
      expectedLiftConfidence:
        typeof parsed.expectedLiftConfidence === "number" ? parsed.expectedLiftConfidence : 0,
    };
  } catch {
    return {
      subject: step.subject ?? "",
      body: step.body ?? "",
      rationale: "Challenger generator returned non-JSON response.",
      expectedLiftConfidence: 0,
    };
  }
}

// ─── 3. AUDIT KB — surface questions when KB has gaps ────────────────────────

export async function auditKnowledgeBase(
  campaignName: string,
  workspace: string | undefined,
  knowledgeBase: CampaignKnowledgeBase | null,
  recentMetrics: CampaignMetrics | null
): Promise<KnowledgeBaseAuditQuestion[]> {
  // Deterministic gap detection first — no LLM needed for obvious holes.
  const questions: KnowledgeBaseAuditQuestion[] = [];

  if (!knowledgeBase) {
    questions.push({
      category: "icp",
      question: `${campaignName} has no knowledge base on file. Want to set one up so Bison can write campaign-specific copy?`,
      reasoning: "Without a KB (ICP, value prop, proof), Bison can only produce generic copy.",
      priority: 2,
      answeredAction: { type: "custom", notes: "Trigger KB setup wizard" },
    });
    return questions;
  }

  if (!knowledgeBase.proof || knowledgeBase.proof.length === 0) {
    questions.push({
      category: "proof",
      question: `What's a named customer result we can cite in ${campaignName}? (one specific outcome with a number)`,
      reasoning: "KB has zero proof points. Without one, every email reads generic.",
      suggestedAnswers: [
        "Cut a customer's expedites 40% with VMI",
        "Reduced audit prep time from 2 weeks to 2 days",
        "Helped scale outbound from 5 to 50 reps with same headcount",
      ],
      priority: 2,
      answeredAction: { type: "update_kb_field", field: "proof" },
    });
  }

  if (!knowledgeBase.icp?.painPoints || knowledgeBase.icp.painPoints.length < 2) {
    questions.push({
      category: "icp",
      question: `What are the top 2-3 pain points ${knowledgeBase.icp?.roles?.[0] ?? "your buyers"} actually complain about for ${campaignName}?`,
      reasoning: "ICP pain points are thin (<2 entries). Persona-level resonance suffers.",
      priority: 1,
      answeredAction: { type: "update_kb_field", field: "icp.painPoints" },
    });
  }

  if (!knowledgeBase.copyGuidelines?.use || knowledgeBase.copyGuidelines.use.length === 0) {
    questions.push({
      category: "creative",
      question: `Any phrases, hooks, or angles we should always use in ${campaignName}? (e.g., "AS9100D certified", "Sunnyvale", "60 years in")`,
      reasoning: "No approved-language guidance — challenger variants may drift from brand voice.",
      priority: 0,
      answeredAction: { type: "update_kb_field", field: "copyGuidelines.use" },
    });
  }

  // Performance-triggered questions
  if (recentMetrics && recentMetrics.totalSends > 200) {
    if (recentMetrics.bounceRatePct > 4) {
      questions.push({
        category: "deliverability",
        question: `${campaignName} bounce rate is ${recentMetrics.bounceRatePct.toFixed(1)}%. Pause and re-verify the list, or push through?`,
        reasoning: `>4% bounces is a deliverability red flag. Domain reputation drops fast above 7%.`,
        suggestedAnswers: ["Pause and re-verify list", "Push through — list is good"],
        priority: 2,
        answeredAction: { type: "pause_campaign" },
      });
    }

    if (recentMetrics.openRatePct < 30) {
      questions.push({
        category: "creative",
        question: `${campaignName} open rate is ${recentMetrics.openRatePct.toFixed(1)}% (target 40%+). Want Bison to test 3 new subject-line angles?`,
        reasoning: "Open rate well below benchmark. Subject lines are the highest-leverage fix.",
        suggestedAnswers: ["Yes — generate 3 subjects", "Skip, send-from address is the issue"],
        priority: 1,
        answeredAction: { type: "generate_experiment", notes: "lever=subject_line" },
      });
    }

    if (recentMetrics.openRatePct >= 40 && recentMetrics.replyRatePct < 2) {
      questions.push({
        category: "offer",
        question: `${campaignName} gets opens (${recentMetrics.openRatePct.toFixed(1)}%) but no replies (${recentMetrics.replyRatePct.toFixed(1)}%). What's the strongest free-value offer we can lead with?`,
        reasoning: "High open + low reply = body/offer is the weak link. Need a stronger hook.",
        suggestedAnswers: [
          "Free sample box / audit",
          "60-second SKU benchmark",
          "Cert package PDF",
          "15-min walk-through",
        ],
        priority: 1,
        answeredAction: { type: "update_kb_field", field: "valueProp" },
      });
    }
  }

  return questions;
}

// ─── 4. DAILY INSIGHTS — natural-language briefing per workspace ─────────────

export async function generateDailyInsight(
  workspace: string,
  campaigns: CampaignMetrics[],
  yesterdayCampaigns?: CampaignMetrics[]
): Promise<DailyInsight | null> {
  if (campaigns.length === 0) return null;
  if (!isAIConfigured()) return null;

  const client = getTrackedAnthropicClient({ agent: "bison-insights" })!;

  // Compute simple deltas if we have yesterday's data
  const deltas = yesterdayCampaigns
    ? campaigns.map((c) => {
        const prev = yesterdayCampaigns.find((y) => y.externalId === c.externalId);
        return {
          name: c.name,
          replyRateDelta: prev ? c.replyRatePct - prev.replyRatePct : null,
          openRateDelta: prev ? c.openRatePct - prev.openRatePct : null,
          sendsDelta: prev ? c.totalSends - prev.totalSends : null,
        };
      })
    : [];

  const userPrompt = `Write today's Bison briefing for the ${workspace} workspace. One headline + 2-4 sentence body. Lead with the metric that moved most. End with one concrete recommendation.

## Today's campaign metrics
${campaigns
  .map(
    (c) =>
      `- ${c.name}: ${c.totalSends} sends, ${c.openRatePct.toFixed(1)}% opens, ${c.replyRatePct.toFixed(2)}% replies, ${c.bounceRatePct.toFixed(2)}% bounce`
  )
  .join("\n")}

${
  deltas.length > 0
    ? `## Day-over-day deltas\n${deltas
        .map(
          (d) =>
            `- ${d.name}: reply ${d.replyRateDelta != null ? (d.replyRateDelta >= 0 ? "+" : "") + d.replyRateDelta.toFixed(2) + "pp" : "—"}, opens ${d.openRateDelta != null ? (d.openRateDelta >= 0 ? "+" : "") + d.openRateDelta.toFixed(1) + "pp" : "—"}, ${d.sendsDelta ?? "—"} new sends`
        )
        .join("\n")}`
    : ""
}

Return ONLY valid JSON:
{
  "headline": "<one-line summary, max 80 chars>",
  "body": "<2-4 sentences, numbers-first, end with one specific recommendation>",
  "severity": <0 = info, 1 = action, 2 = urgent>
}`;

  const message = await client.messages.create({
    model: MODEL_HAIKU, // briefings = cheap + frequent
    max_tokens: 400,
    system: [
      { type: "text", text: BISON_PERSONA, cache_control: { type: "ephemeral" } },
    ],
    messages: [{ role: "user", content: userPrompt }],
  });

  const raw = message.content[0].type === "text" ? message.content[0].text : "";
  const jsonStr = raw.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "").trim();

  try {
    const parsed = JSON.parse(jsonStr) as DailyInsight;
    return {
      headline: parsed.headline ?? "",
      body: parsed.body ?? "",
      severity: (parsed.severity ?? 0) as 0 | 1 | 2,
    };
  } catch {
    return null;
  }
}

// ─── 5. EVALUATION — decide if an experiment is a winner ─────────────────────

export interface ExperimentEvaluationInput {
  baselineSends: number;
  baselineReplies: number;
  challengerSends: number;
  challengerReplies: number;
  minSampleSize: number;        // default 50
  minRelativeLift: number;      // default 0.20
}

export interface ExperimentEvaluationResult {
  decision: "winner_challenger" | "winner_baseline" | "inconclusive";
  baselineReplyRate: number;
  challengerReplyRate: number;
  relativeLift: number;
  notes: string;
}

/**
 * Pure-function evaluator — no LLM. Implements the MindStudio AutoResearch
 * winning threshold rule: ≥20% relative lift AND minimum 50 sends per arm.
 */
export function evaluateExperiment(input: ExperimentEvaluationInput): ExperimentEvaluationResult {
  const { baselineSends, baselineReplies, challengerSends, challengerReplies, minSampleSize, minRelativeLift } =
    input;

  const baselineReplyRate = baselineSends > 0 ? baselineReplies / baselineSends : 0;
  const challengerReplyRate = challengerSends > 0 ? challengerReplies / challengerSends : 0;
  const relativeLift =
    baselineReplyRate > 0 ? (challengerReplyRate - baselineReplyRate) / baselineReplyRate : 0;

  if (baselineSends < minSampleSize || challengerSends < minSampleSize) {
    return {
      decision: "inconclusive",
      baselineReplyRate,
      challengerReplyRate,
      relativeLift,
      notes: `Insufficient sample: baseline=${baselineSends}, challenger=${challengerSends}, need ≥${minSampleSize} each.`,
    };
  }

  if (relativeLift >= minRelativeLift) {
    return {
      decision: "winner_challenger",
      baselineReplyRate,
      challengerReplyRate,
      relativeLift,
      notes: `Challenger beat baseline by ${(relativeLift * 100).toFixed(1)}% relative lift (threshold ${(minRelativeLift * 100).toFixed(0)}%). Promote.`,
    };
  }

  if (relativeLift <= -minRelativeLift) {
    return {
      decision: "winner_baseline",
      baselineReplyRate,
      challengerReplyRate,
      relativeLift,
      notes: `Baseline beat challenger by ${(Math.abs(relativeLift) * 100).toFixed(1)}% relative — keep baseline, archive challenger.`,
    };
  }

  return {
    decision: "inconclusive",
    baselineReplyRate,
    challengerReplyRate,
    relativeLift,
    notes: `Relative lift ${(relativeLift * 100).toFixed(1)}% within noise threshold (±${(minRelativeLift * 100).toFixed(0)}%). Inconclusive.`,
  };
}

// ─── 6. DEPLOY CHALLENGER — push approved variant into EmailBison ────────────

export interface DeployChallengerInput {
  campaignExternalId: number;
  /** EmailBison's sequence step ID for the baseline this challenger competes against */
  baselineStepId?: number;
  /** Position in the sequence (1 = initial, 2 = follow-up 1, etc.) — used for the group title */
  sequenceStep: number;
  lever: string;
  challengerSubject: string;
  challengerBody: string;
  workspace?: string;
}

export interface DeployChallengerResult {
  ok: boolean;
  challengerStepExternalId?: number;
  /** When validation fails, the rewrite is blocked from deploying */
  validationIssues?: string[];
  error?: string;
}

/**
 * Push an approved challenger variant into EmailBison as a new variant on the
 * same sequence step group as the baseline. Validates spintax + token preservation
 * BEFORE deploying — silent token drops are how mass-personalized blasts break.
 */
export async function deployChallenger(
  input: DeployChallengerInput,
  baselineSubject: string,
  baselineBody: string
): Promise<DeployChallengerResult> {
  // 1. Validate spintax + that no original tokens were dropped
  const baselineTokens = [
    ...extractTokens(baselineSubject),
    ...extractTokens(baselineBody),
  ];
  const subjectCheck = validateSpintax(input.challengerSubject);
  const bodyCheck = validateSpintax(input.challengerBody, { originalTokens: baselineTokens });

  const issues = [...subjectCheck.issues, ...bodyCheck.issues];
  if (issues.length > 0) {
    return {
      ok: false,
      validationIssues: issues.map((i) => `${i.kind}: ${i.message}`),
    };
  }

  // 2. Deploy as a new variant of the existing sequence step
  try {
    const stepInput: SequenceStepInput = {
      email_subject: input.challengerSubject,
      email_body: input.challengerBody,
      wait_in_days: 1,
      variant: true,
      variant_from_step: input.baselineStepId,
    };
    const created = await addSequenceStepGroup({
      campaignId: input.campaignExternalId,
      title: `Bison challenger — ${input.lever} (step ${input.sequenceStep})`,
      steps: [stepInput],
      workspace: input.workspace,
    });
    return {
      ok: true,
      challengerStepExternalId: created[0]?.id,
    };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

// ─── 7. AUTHOR A NEW CAMPAIGN — full end-to-end from KB ──────────────────────

export interface AuthoredSequenceStep {
  label: string;
  /** Day offset from previous step */
  waitDays: number;
  threadReply: boolean;
  variants: Array<{ subject: string; body: string }>;
}

export interface AuthoredSequence {
  campaignName: string;
  steps: AuthoredSequenceStep[];
}

export interface AuthorCampaignInput {
  workspace: string;
  kb: CampaignKnowledgeBase;
  /** Defaults to: KB.productName + " — Multi-Industry Outreach" */
  campaignName?: string;
  /** Number of variants per step (default 3, breakup gets 2) */
  variantsPerStep?: number;
}

/**
 * Generate a full 4-step sequence (initial → value drop → direct offer → breakup)
 * for a brand, each step with N variants. Output is plain data — call
 * `deployAuthoredSequence()` to push it into EmailBison.
 */
export async function authorSequence(input: AuthorCampaignInput): Promise<AuthoredSequence> {
  if (!isAIConfigured()) {
    throw new Error("AI not configured");
  }
  const client = getTrackedAnthropicClient({ agent: "bison-author" })!;
  const variantsPerStep = input.variantsPerStep ?? 3;
  const breakupVariants = Math.min(variantsPerStep, 2);

  const kb = input.kb;
  const userPrompt = `Write a full 4-step cold email sequence for this brand.

## Brand knowledge base
Product: ${kb.productName}
Value proposition: ${kb.valueProp}
Tone: ${kb.toneProfile}
ICP roles: ${kb.icp.roles.join(", ")}
ICP industries: ${kb.icp.industries.join(", ")}
ICP company sizes: ${kb.icp.companySizes?.join(", ") ?? "(unspecified)"}
ICP pain points: ${kb.icp.painPoints.join("; ")}
Proof points: ${
    kb.proof?.map((p) => `${p.company ?? "anon"}: ${p.result}${p.metric ? ` (${p.metric})` : ""}`).join(" | ") ??
    "(none on file — write without specific proof, use only abstract patterns)"
  }
Approved language: ${kb.copyGuidelines?.use?.join(", ") ?? "(none specified)"}
Avoid: ${kb.copyGuidelines?.avoid?.join(", ") ?? "(none specified)"}

## Sequence structure
Step 1 — Initial Outreach (Day 0): ${variantsPerStep} variants. Identify the right contact, hint at proof, tease free value.
Step 2 — Value Drop (Day 3, thread reply): ${variantsPerStep} variants. Deliver concrete value (a stat, a 5-doc list, a how-they-did-it). One CTA.
Step 3 — Direct Offer (Day 8, thread reply): ${variantsPerStep} variants. Sample box / quote / walk-through. Clear ask.
Step 4 — Breakup (Day 13, thread reply): ${breakupVariants} variants. Acknowledge silence, leave door open.

## Token rules
Use ONLY these tokens: {first_name|there}, {company_name|your company}, {job_title|your team}, {department|supply chain}, {industry|manufacturing}. Each MUST have a fallback in pipe-syntax. Plain text only, no HTML.

Return ONLY valid JSON in this exact shape:
{
  "steps": [
    {
      "label": "Initial Outreach",
      "waitDays": 0,
      "threadReply": false,
      "variants": [{ "subject": "...", "body": "..." }, ...]
    },
    ...
  ]
}

Generate ${variantsPerStep} variants for steps 1-3 and ${breakupVariants} for step 4. Each variant must be a distinct angle (referral / peer-to-peer / question for step 1, etc.) — not a paraphrase of variant A.`;

  const message = await client.messages.create({
    model: MODEL_SONNET,
    max_tokens: 4000,
    system: [
      { type: "text", text: COLD_EMAIL_PLAYBOOK_PROMPT, cache_control: { type: "ephemeral" } },
      { type: "text", text: BISON_PERSONA, cache_control: { type: "ephemeral" } },
    ],
    messages: [{ role: "user", content: userPrompt }],
  });

  const raw = message.content[0].type === "text" ? message.content[0].text : "";
  const jsonStr = raw.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "").trim();

  const parsed = JSON.parse(jsonStr) as { steps: AuthoredSequenceStep[] };
  return {
    campaignName: input.campaignName ?? `${kb.productName} — Multi-Industry Outreach`,
    steps: parsed.steps ?? [],
  };
}

/**
 * Validate every variant of an authored sequence for spintax + tokens.
 * Returns issues per (step, variant) — call before deploying.
 */
export function validateAuthoredSequence(seq: AuthoredSequence): Array<{
  stepIndex: number;
  variantIndex: number;
  issues: string[];
}> {
  const results: Array<{ stepIndex: number; variantIndex: number; issues: string[] }> = [];
  seq.steps.forEach((step, i) => {
    step.variants.forEach((v, j) => {
      const sub = validateSpintax(v.subject);
      const bod = validateSpintax(v.body);
      const issues = [...sub.issues, ...bod.issues].map((x) => `${x.kind}: ${x.message}`);
      if (issues.length > 0) results.push({ stepIndex: i, variantIndex: j, issues });
    });
  });
  return results;
}

/**
 * Push an authored sequence into EmailBison as a brand-new campaign.
 */
export interface DeployAuthoredCampaignResult {
  ok: boolean;
  campaignId?: number;
  campaignName?: string;
  stepsCreated?: number;
  validationIssues?: ReturnType<typeof validateAuthoredSequence>;
  error?: string;
}

export async function deployAuthoredCampaign(
  workspace: string,
  authored: AuthoredSequence
): Promise<DeployAuthoredCampaignResult> {
  // 1. Validate before touching the network
  const validationIssues = validateAuthoredSequence(authored);
  if (validationIssues.length > 0) {
    return { ok: false, validationIssues };
  }

  try {
    // 2. Create the campaign
    const campaign = await ebCreateCampaign({ name: authored.campaignName, workspace });
    let stepsCreated = 0;

    // 3. Push each step as its own group with N variants
    for (const step of authored.steps) {
      const stepInputs: SequenceStepInput[] = step.variants.map((v, idx) => ({
        email_subject: v.subject,
        email_body: v.body,
        wait_in_days: step.waitDays > 0 ? step.waitDays : 1,
        thread_reply: step.threadReply || undefined,
        variant: idx > 0 ? true : undefined,
        variant_from_step: idx > 0 ? 1 : undefined,
      }));
      const created = await addSequenceStepGroup({
        campaignId: campaign.id,
        title: step.label,
        steps: stepInputs,
        workspace,
      });
      stepsCreated += created.length;
    }

    return {
      ok: true,
      campaignId: campaign.id,
      campaignName: authored.campaignName,
      stepsCreated,
    };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

// ─── 8. BRAND CONTEXT INGESTION — read context.md per brand ──────────────────
// Brand context files live at content/brands/<workspace>.md. They contain
// long-form positioning, offer details, ICP research, and approved language.
// Bison merges this into the KB's `notes` field so it's available on every call.

export interface BrandContextMergeResult {
  ok: boolean;
  workspace: string;
  bytesIngested: number;
  /** Patch to apply to the KB — caller persists this to outreach_campaigns.knowledge_base */
  kbPatch?: Partial<CampaignKnowledgeBase>;
  error?: string;
}

export async function ingestBrandContext(
  workspace: string,
  currentKb: CampaignKnowledgeBase | null
): Promise<BrandContextMergeResult> {
  const filePath = path.join(process.cwd(), "content", "brands", `${workspace}.md`);
  try {
    const md = await fs.readFile(filePath, "utf-8");
    // Merge the raw markdown into the KB's `notes` field with a header marker
    // so the AI agents have it in their context on every draft call.
    const MARKER = `\n\n<!-- bison:brand-context-${workspace} -->\n`;
    const existingNotes = currentKb?.notes ?? "";
    // Strip any prior auto-injected block before re-injecting
    const cleaned = existingNotes.replace(
      new RegExp(`${MARKER}[\\s\\S]*?(<!-- /bison:brand-context-${workspace} -->|$)`),
      ""
    );
    const updatedNotes = `${cleaned}${MARKER}${md}\n<!-- /bison:brand-context-${workspace} -->\n`;
    return {
      ok: true,
      workspace,
      bytesIngested: md.length,
      kbPatch: { notes: updatedNotes, updatedAt: new Date().toISOString() },
    };
  } catch (err) {
    return {
      ok: false,
      workspace,
      bytesIngested: 0,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

// ─── 9. CAMPAIGN CONTROL — pause / resume on Bison's recommendation ──────────

export async function bisonPauseCampaign(
  campaignExternalId: number,
  workspace: string,
  reason: string
): Promise<{ ok: boolean; error?: string; reason: string }> {
  try {
    await pauseCampaign(campaignExternalId, { workspace });
    return { ok: true, reason };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err), reason };
  }
}

export async function bisonResumeCampaign(
  campaignExternalId: number,
  workspace: string
): Promise<{ ok: boolean; error?: string }> {
  try {
    await resumeCampaign(campaignExternalId, { workspace });
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

// ─── 10. CAMPAIGN-LEVEL SETUP HELPERS ────────────────────────────────────────

export async function bisonAttachSender(
  campaignExternalId: number,
  senderEmailId: number,
  workspace: string
): Promise<{ ok: boolean; error?: string }> {
  try {
    await attachSenderToCampaign(campaignExternalId, senderEmailId, { workspace });
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
