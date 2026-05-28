/**
 * Reply Learning — Bison's continuous improvement layer for reply drafting
 *
 * Three responsibilities:
 *
 *  1. captureTrainingExample()   — called from the send-draft route when Adam
 *                                  approves/edits/sends a reply. Persists the
 *                                  full tuple + computes edit-distance.
 *
 *  2. retrieveFewShotExamples()  — called from the reply-responder draft
 *                                  function BEFORE generation. Returns top-K
 *                                  most-similar successful examples for the
 *                                  same brand (or generally if brand-thin).
 *
 *  3. recomputeBrandVoiceStats() — called from the outcome classifier cron.
 *                                  Aggregates per-brand acceptance metrics
 *                                  and flips the voice_locked flag when the
 *                                  brand crosses the auto-send threshold.
 *
 * Voice-lock thresholds (configurable):
 *   - sampleSize     ≥ 25     (enough signal)
 *   - meanEditDist   ≤ 0.10   (drafts are sendable as-is on average)
 *   - cleanApproval  ≥ 60%    (3 of 5 drafts are sent without edits)
 *   - positiveRate   ≥ 30%    (drafts produce real outcomes)
 */

import { db } from "@/lib/db";
import {
  replyTrainingExamples,
  replyBrandVoiceStats,
  emailbisonReplies,
  outreachCampaigns,
  type NewReplyTrainingExample,
} from "@/lib/db/schema";
import { and, desc, eq, gte, inArray, sql } from "drizzle-orm";
import { generateEmbedding, storeEmbedding, searchSimilar } from "../embeddings";

// ─── 1. Capture ──────────────────────────────────────────────────────────────

export interface CaptureTrainingExampleInput {
  emailDraftId: string;
  replyExternalId: number | null;
  campaignExternalId: number | null;
  campaignName: string | null;
  workspace: string | null;
  leadEmail: string;
  leadName: string | null;
  incomingSubject: string | null;
  incomingBody: string;
  draftSubject: string | null;
  draftBody: string;
  sentSubject: string | null;
  sentBody: string;
  intent: string | null;
  confidence: number | null;
}

/**
 * Normalized character-level edit distance, ranged 0.0 (identical) → 1.0 (totally different).
 * Uses the Levenshtein distance / max(len). Cheap enough for body-length text.
 */
function normalizedEditDistance(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length && !b.length) return 0;
  const maxLen = Math.max(a.length, b.length);
  if (maxLen === 0) return 0;

  // Standard Levenshtein with a rolling 2-row buffer to keep memory linear.
  // Truncate very long bodies to 4kB so the O(n*m) cost stays bounded.
  const TRUNCATE = 4000;
  const s1 = a.length > TRUNCATE ? a.slice(0, TRUNCATE) : a;
  const s2 = b.length > TRUNCATE ? b.slice(0, TRUNCATE) : b;
  const m = s1.length;
  const n = s2.length;

  let prev = new Array<number>(n + 1);
  let curr = new Array<number>(n + 1);
  for (let j = 0; j <= n; j++) prev[j] = j;

  for (let i = 1; i <= m; i++) {
    curr[0] = i;
    for (let j = 1; j <= n; j++) {
      const cost = s1.charCodeAt(i - 1) === s2.charCodeAt(j - 1) ? 0 : 1;
      curr[j] = Math.min(
        curr[j - 1] + 1,         // insertion
        prev[j] + 1,             // deletion
        prev[j - 1] + cost       // substitution
      );
    }
    [prev, curr] = [curr, prev];
  }

  return prev[n] / Math.max(m, n);
}

/**
 * Persist a training example. Called by the send-draft route.
 * Embeds the incoming body async for nearest-neighbor retrieval later.
 */
export async function captureTrainingExample(
  input: CaptureTrainingExampleInput
): Promise<{ id: string; editDistance: number; trainingSource: string }> {
  const editDistance = normalizedEditDistance(input.draftBody, input.sentBody);

  // Classify how this draft was used
  let trainingSource: NewReplyTrainingExample["trainingSource"];
  if (editDistance < 0.02) {
    trainingSource = "approved_unedited";
  } else if (editDistance < 0.85) {
    trainingSource = "approved_edited";
  } else {
    // Adam rewrote nearly everything — treat as a "manual" example so we
    // still learn his voice but don't pretend the draft was close.
    trainingSource = "manual";
  }

  const inserted = await db
    .insert(replyTrainingExamples)
    .values({
      emailDraftId: input.emailDraftId,
      replyExternalId: input.replyExternalId,
      campaignExternalId: input.campaignExternalId,
      campaignName: input.campaignName,
      workspace: input.workspace,
      leadEmail: input.leadEmail,
      leadName: input.leadName,
      incomingSubject: input.incomingSubject,
      incomingBody: input.incomingBody,
      draftSubject: input.draftSubject,
      draftBody: input.draftBody,
      sentSubject: input.sentSubject,
      sentBody: input.sentBody,
      editDistance,
      trainingSource,
      intent: input.intent,
      confidence: input.confidence,
      outcome: "pending",
      // We mark exemplar=false until the outcome classifier confirms the
      // lead replied positively or converted. Don't pollute the few-shot
      // pool with unverified examples.
      isExemplar: false,
    })
    .returning({ id: replyTrainingExamples.id });

  const id = inserted[0]?.id;

  // Embed the incoming body so future retrieval is fast. Fire-and-forget —
  // if embedding provider is down we still keep the row.
  if (id && input.incomingBody) {
    storeEmbedding(
      input.incomingBody,
      "conversation",
      `reply-training:${id}`,
      {
        workspace: input.workspace,
        intent: input.intent,
        campaignExternalId: input.campaignExternalId,
      }
    ).catch(() => {});
  }

  return { id: id!, editDistance, trainingSource };
}

// ─── 2. Retrieve ─────────────────────────────────────────────────────────────

export interface FewShotExample {
  incomingBody: string;
  sentBody: string;
  editDistance: number;
  outcome: string;
  intent: string | null;
  similarity: number;
}

/**
 * Find the top-K most relevant exemplar replies for the current incoming
 * message. Strategy:
 *   1. Vector search across exemplar examples (isExemplar=true), same workspace if possible.
 *   2. If <K results in the same workspace, top up from any workspace.
 *   3. Filter out examples where the draft was heavily edited (we want
 *      examples where Adam *kept* the draft — those are the ones the model
 *      should emulate).
 */
export async function retrieveFewShotExamples(opts: {
  incomingBody: string;
  workspace?: string | null;
  intent?: string | null;
  k?: number;
}): Promise<FewShotExample[]> {
  const k = opts.k ?? 3;
  if (!opts.incomingBody) return [];

  // 1. Embed the incoming message and run pgvector similarity search.
  //    We stored embeddings via storeEmbedding(content, "conversation",
  //    "reply-training:<id>") — searchSimilar returns those rows.
  const similar = await searchSimilar(opts.incomingBody, k * 4, "conversation");
  const ids = similar
    .map((r) => r.sourceId?.replace(/^reply-training:/, ""))
    .filter((x): x is string => !!x);
  if (ids.length === 0) return [];

  // 2. Pull the actual training-example rows for those ids, filtered to
  //    exemplars (we only want successful, lightly-edited examples).
  const rows = await db
    .select()
    .from(replyTrainingExamples)
    .where(
      and(
        inArray(replyTrainingExamples.id, ids),
        eq(replyTrainingExamples.isExemplar, true)
      )
    );

  // 3. Score: prefer same workspace, same intent. Compute final ranking
  //    by similarity (proxied via the order in `similar`) + brand match.
  const similarityById = new Map<string, number>();
  for (const r of similar) {
    const id = r.sourceId?.replace(/^reply-training:/, "");
    if (id) similarityById.set(id, r.similarity);
  }

  const scored = rows
    .map((row) => {
      const baseSim = similarityById.get(row.id) ?? 0;
      const workspaceBonus =
        opts.workspace && row.workspace === opts.workspace ? 0.1 : 0;
      const intentBonus = opts.intent && row.intent === opts.intent ? 0.05 : 0;
      return { row, score: baseSim + workspaceBonus + intentBonus };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, k);

  return scored.map(({ row, score }) => ({
    incomingBody: row.incomingBody,
    sentBody: row.sentBody,
    editDistance: row.editDistance,
    outcome: row.outcome,
    intent: row.intent,
    similarity: score,
  }));
}

// ─── 3. Brand voice stats + voice-lock decision ──────────────────────────────

const VOICE_LOCK_THRESHOLDS = {
  windowDays: 30,
  minSampleSize: 25,
  maxMeanEditDistance: 0.10,
  minCleanApprovalRatePct: 60,
  minPositiveOutcomeRatePct: 30,
} as const;

export interface BrandVoiceStatsComputed {
  workspace: string;
  windowDays: number;
  sampleSize: number;
  meanEditDistance: number;
  medianEditDistance: number;
  cleanApprovalRatePct: number;
  positiveOutcomeRatePct: number;
  voiceLocked: boolean;
  voiceStatusNotes: string;
}

/**
 * Recompute per-brand voice stats for the given window. Persists to
 * reply_brand_voice_stats with workspace+windowDays as the unique key.
 *
 * Called by the outcome-classifier Inngest job daily.
 */
export async function recomputeBrandVoiceStats(
  workspace: string,
  windowDays: number = VOICE_LOCK_THRESHOLDS.windowDays
): Promise<BrandVoiceStatsComputed> {
  const since = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000);

  const rows = await db
    .select({
      editDistance: replyTrainingExamples.editDistance,
      outcome: replyTrainingExamples.outcome,
      trainingSource: replyTrainingExamples.trainingSource,
    })
    .from(replyTrainingExamples)
    .where(
      and(
        eq(replyTrainingExamples.workspace, workspace),
        gte(replyTrainingExamples.createdAt, since)
      )
    );

  const sampleSize = rows.length;
  if (sampleSize === 0) {
    const computed: BrandVoiceStatsComputed = {
      workspace,
      windowDays,
      sampleSize: 0,
      meanEditDistance: 0,
      medianEditDistance: 0,
      cleanApprovalRatePct: 0,
      positiveOutcomeRatePct: 0,
      voiceLocked: false,
      voiceStatusNotes: "No samples in window.",
    };
    await upsertBrandVoiceStats(computed);
    return computed;
  }

  const distances = rows.map((r) => r.editDistance).sort((a, b) => a - b);
  const mean = distances.reduce((s, v) => s + v, 0) / sampleSize;
  const median =
    sampleSize % 2 === 0
      ? (distances[sampleSize / 2 - 1] + distances[sampleSize / 2]) / 2
      : distances[Math.floor(sampleSize / 2)];

  const cleanApprovals = rows.filter((r) => r.editDistance < 0.05).length;
  const cleanApprovalRatePct = (cleanApprovals / sampleSize) * 100;

  const resolved = rows.filter((r) => r.outcome !== "pending");
  const positives = rows.filter(
    (r) => r.outcome === "won" || r.outcome === "progressed"
  ).length;
  const positiveOutcomeRatePct =
    resolved.length > 0 ? (positives / resolved.length) * 100 : 0;

  // Voice-lock decision
  const reasons: string[] = [];
  let voiceLocked = true;
  if (sampleSize < VOICE_LOCK_THRESHOLDS.minSampleSize) {
    voiceLocked = false;
    reasons.push(
      `sampleSize=${sampleSize} (need ≥${VOICE_LOCK_THRESHOLDS.minSampleSize})`
    );
  }
  if (mean > VOICE_LOCK_THRESHOLDS.maxMeanEditDistance) {
    voiceLocked = false;
    reasons.push(
      `meanEditDistance=${mean.toFixed(3)} (need ≤${VOICE_LOCK_THRESHOLDS.maxMeanEditDistance})`
    );
  }
  if (cleanApprovalRatePct < VOICE_LOCK_THRESHOLDS.minCleanApprovalRatePct) {
    voiceLocked = false;
    reasons.push(
      `cleanApproval=${cleanApprovalRatePct.toFixed(1)}% (need ≥${VOICE_LOCK_THRESHOLDS.minCleanApprovalRatePct}%)`
    );
  }
  if (
    positiveOutcomeRatePct < VOICE_LOCK_THRESHOLDS.minPositiveOutcomeRatePct &&
    resolved.length >= 10
  ) {
    voiceLocked = false;
    reasons.push(
      `positiveOutcome=${positiveOutcomeRatePct.toFixed(1)}% (need ≥${VOICE_LOCK_THRESHOLDS.minPositiveOutcomeRatePct}%, ${resolved.length} resolved)`
    );
  }

  const voiceStatusNotes = voiceLocked
    ? "Voice locked — drafts can auto-send within safety rules."
    : `Voice not locked: ${reasons.join("; ")}.`;

  const computed: BrandVoiceStatsComputed = {
    workspace,
    windowDays,
    sampleSize,
    meanEditDistance: mean,
    medianEditDistance: median,
    cleanApprovalRatePct,
    positiveOutcomeRatePct,
    voiceLocked,
    voiceStatusNotes,
  };
  await upsertBrandVoiceStats(computed);
  return computed;
}

async function upsertBrandVoiceStats(c: BrandVoiceStatsComputed): Promise<void> {
  // Check current state to decide whether to set voice_locked_at
  const [existing] = await db
    .select({ voiceLocked: replyBrandVoiceStats.voiceLocked })
    .from(replyBrandVoiceStats)
    .where(
      and(
        eq(replyBrandVoiceStats.workspace, c.workspace),
        eq(replyBrandVoiceStats.windowDays, c.windowDays)
      )
    )
    .limit(1);

  const transitionedToLocked = c.voiceLocked && !existing?.voiceLocked;

  await db
    .insert(replyBrandVoiceStats)
    .values({
      workspace: c.workspace,
      windowDays: c.windowDays,
      sampleSize: c.sampleSize,
      meanEditDistance: c.meanEditDistance,
      medianEditDistance: c.medianEditDistance,
      cleanApprovalRatePct: c.cleanApprovalRatePct,
      positiveOutcomeRatePct: c.positiveOutcomeRatePct,
      voiceLocked: c.voiceLocked,
      voiceLockedAt: transitionedToLocked ? new Date() : undefined,
      voiceStatusNotes: c.voiceStatusNotes,
      lastComputedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: [replyBrandVoiceStats.workspace, replyBrandVoiceStats.windowDays],
      set: {
        sampleSize: c.sampleSize,
        meanEditDistance: c.meanEditDistance,
        medianEditDistance: c.medianEditDistance,
        cleanApprovalRatePct: c.cleanApprovalRatePct,
        positiveOutcomeRatePct: c.positiveOutcomeRatePct,
        voiceLocked: c.voiceLocked,
        // Only set voiceLockedAt on a fresh transition; leave it alone otherwise
        ...(transitionedToLocked ? { voiceLockedAt: new Date() } : {}),
        voiceStatusNotes: c.voiceStatusNotes,
        lastComputedAt: new Date(),
      },
    });
}

/**
 * Quick lookup — is this brand voice-locked right now? Used by the
 * reply-responder to decide whether a draft can be safeToAutoSend=true.
 */
export async function isBrandVoiceLocked(
  workspace: string,
  windowDays: number = VOICE_LOCK_THRESHOLDS.windowDays
): Promise<boolean> {
  const [row] = await db
    .select({ voiceLocked: replyBrandVoiceStats.voiceLocked })
    .from(replyBrandVoiceStats)
    .where(
      and(
        eq(replyBrandVoiceStats.workspace, workspace),
        eq(replyBrandVoiceStats.windowDays, windowDays)
      )
    )
    .limit(1);
  return row?.voiceLocked ?? false;
}

// ─── 4. Workspace resolver ───────────────────────────────────────────────────
// Given a campaign external ID (from the incoming reply), find the brand
// workspace. Used so retrieval and stats keep brand-segmented.

export async function resolveCampaignWorkspace(
  campaignExternalId: number | null
): Promise<string | null> {
  if (!campaignExternalId) return null;
  const [row] = await db
    .select({
      // Workspace is stored on outreach_campaigns.metadata.workspace by the
      // multi-workspace sync — if not present we fall back to campaign tags.
      metadata: outreachCampaigns.metadata,
    })
    .from(outreachCampaigns)
    .where(eq(outreachCampaigns.externalId, campaignExternalId))
    .limit(1);
  if (!row) return null;
  const meta = row.metadata as { workspace?: string } | null;
  return meta?.workspace ?? null;
}
