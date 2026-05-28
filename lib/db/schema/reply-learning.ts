/**
 * Reply Learning Schema — Bison's continuous improvement layer
 *
 * Every time Adam approves/edits/sends a reply draft, we capture the full
 * (incoming, draft, sent, outcome) tuple. Successful examples become few-shot
 * context for future drafts. Over time, average edit-distance per brand drops
 * toward zero — that's the success metric.
 *
 *  - reply_training_examples → individual (incoming, draft, sent, outcome) tuples
 *  - reply_outcome_signals   → downstream events per thread (lead replied again,
 *                              booked a call, opportunity created, etc.)
 *  - reply_brand_voice_stats → rolling per-brand metrics (acceptance rate,
 *                              mean edit distance, sample size, voice-locked flag)
 *
 * Together they back two reply-responder behaviors:
 *  1. Few-shot retrieval — pull top-K most-similar successful examples (same brand)
 *     and inject them as the system context for the next draft.
 *  2. Voice-locked auto-send — when a brand's stats clear the threshold, drafts
 *     for that brand get safeToAutoSend=true automatically.
 */

import {
  pgTable,
  uuid,
  varchar,
  text,
  integer,
  timestamp,
  jsonb,
  index,
  boolean,
  pgEnum,
  real,
  unique,
} from "drizzle-orm/pg-core";

// ─── Enums ──────────────────────────────────────────────────────────────────

export const replyOutcomeEnum = pgEnum("reply_outcome", [
  "pending",       // sent, awaiting downstream signal
  "won",           // lead replied positively / booked / converted
  "progressed",    // got another reply, conversation continuing
  "dead",          // no reply or polite no
  "negative",      // lead expressed dissatisfaction / unsubscribed after our reply
]);

export const replyTrainingSourceEnum = pgEnum("reply_training_source", [
  "approved_unedited", // Adam sent the draft as-is
  "approved_edited",   // Adam edited then sent
  "manual",            // Adam wrote from scratch / discarded draft
  "auto_sent",         // safeToAutoSend path
]);

// ─── Tables ─────────────────────────────────────────────────────────────────

/**
 * One row per (incoming reply, draft, sent reply, outcome) tuple.
 * `embedding` is the lead's incoming reply text — used for nearest-neighbor
 * retrieval when drafting future responses.
 */
export const replyTrainingExamples = pgTable(
  "reply_training_examples",
  {
    id: uuid("id").defaultRandom().primaryKey(),

    // Linkage back to the original entities
    emailDraftId: uuid("email_draft_id"),                  // email_drafts.id (no FK — drafts may purge)
    replyExternalId: integer("reply_external_id"),         // emailbison_replies.external_id
    campaignExternalId: integer("campaign_external_id"),
    campaignName: varchar("campaign_name", { length: 500 }),
    workspace: varchar("workspace", { length: 100 }),      // brand: olander, cursive, etc.

    // The actual content tuple
    leadEmail: varchar("lead_email", { length: 500 }).notNull(),
    leadName: varchar("lead_name", { length: 500 }),
    incomingSubject: varchar("incoming_subject", { length: 1000 }),
    incomingBody: text("incoming_body").notNull(),
    /** What Bison originally drafted */
    draftSubject: varchar("draft_subject", { length: 1000 }),
    draftBody: text("draft_body").notNull(),
    /** What Adam actually sent (may equal draft, may be edited) */
    sentSubject: varchar("sent_subject", { length: 1000 }),
    sentBody: text("sent_body").notNull(),

    // Quality signals captured at send time
    /** 0.0 = identical; 1.0 = completely rewritten. Edit-distance on body. */
    editDistance: real("edit_distance").default(0).notNull(),
    /** Approve-as-is vs edited vs manual */
    trainingSource: replyTrainingSourceEnum("training_source").notNull(),
    /** Classifier intent at draft time (interested, objection, question, etc.) */
    intent: varchar("intent", { length: 40 }),
    /** Classifier confidence at draft time, 0-100 */
    confidence: integer("confidence"),

    // Downstream outcome — set by the outcome classifier job
    outcome: replyOutcomeEnum("outcome").default("pending").notNull(),
    /** What signal we observed (e.g. "lead replied positively within 3 days") */
    outcomeNotes: text("outcome_notes"),
    /** When the outcome was last evaluated */
    outcomeEvaluatedAt: timestamp("outcome_evaluated_at", { withTimezone: true }),
    /** Days from send to outcome resolution */
    timeToOutcomeDays: integer("time_to_outcome_days"),

    // Few-shot retrieval scaffolding
    /** pgvector embedding of incomingBody — populated async after insert */
    incomingEmbedding: jsonb("incoming_embedding"),
    /** Eligible to use as few-shot context (outcome ∈ {won, progressed} AND trainingSource ≠ auto_sent) */
    isExemplar: boolean("is_exemplar").default(false).notNull(),

    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("reply_training_examples_workspace_idx").on(table.workspace),
    index("reply_training_examples_intent_idx").on(table.intent),
    index("reply_training_examples_outcome_idx").on(table.outcome),
    index("reply_training_examples_is_exemplar_idx").on(table.isExemplar),
    index("reply_training_examples_campaign_idx").on(table.campaignExternalId),
    index("reply_training_examples_lead_email_idx").on(table.leadEmail),
    index("reply_training_examples_created_idx").on(table.createdAt),
  ]
);

/**
 * Downstream signals that resolve a training example's outcome.
 * One reply may produce multiple signals over time (replied again → call booked → won).
 */
export const replyOutcomeSignals = pgTable(
  "reply_outcome_signals",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    trainingExampleId: uuid("training_example_id").notNull(),
    /** "lead_replied", "meeting_booked", "opportunity_created", "unsubscribed", etc. */
    signalType: varchar("signal_type", { length: 60 }).notNull(),
    signalValue: jsonb("signal_value"),
    /** Polarity of the signal: 1 = positive, 0 = neutral, -1 = negative */
    polarity: integer("polarity").default(0).notNull(),
    observedAt: timestamp("observed_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("reply_outcome_signals_training_example_idx").on(table.trainingExampleId),
    index("reply_outcome_signals_signal_type_idx").on(table.signalType),
    index("reply_outcome_signals_observed_at_idx").on(table.observedAt),
  ]
);

/**
 * Rolling per-brand voice stats. Updated daily by the outcome classifier job.
 * The voice-locked flag gates auto-send for that brand.
 */
export const replyBrandVoiceStats = pgTable(
  "reply_brand_voice_stats",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspace: varchar("workspace", { length: 100 }).notNull(),
    /** Trailing window in days (e.g. 30, 90) */
    windowDays: integer("window_days").notNull(),

    sampleSize: integer("sample_size").default(0).notNull(),
    meanEditDistance: real("mean_edit_distance").default(0).notNull(),
    medianEditDistance: real("median_edit_distance").default(0).notNull(),
    /** % of drafts approved without edits (editDistance < 0.05) */
    cleanApprovalRatePct: real("clean_approval_rate_pct").default(0).notNull(),
    /** % of sent replies that produced a positive downstream signal */
    positiveOutcomeRatePct: real("positive_outcome_rate_pct").default(0).notNull(),

    /** When true, drafts for this brand can be safeToAutoSend=true automatically */
    voiceLocked: boolean("voice_locked").default(false).notNull(),
    voiceLockedAt: timestamp("voice_locked_at", { withTimezone: true }),
    /** Why we locked or unlocked the voice — human-readable */
    voiceStatusNotes: text("voice_status_notes"),

    lastComputedAt: timestamp("last_computed_at", { withTimezone: true }).defaultNow().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    unique("reply_brand_voice_stats_workspace_window_uq").on(table.workspace, table.windowDays),
    index("reply_brand_voice_stats_workspace_idx").on(table.workspace),
    index("reply_brand_voice_stats_voice_locked_idx").on(table.voiceLocked),
  ]
);

// ─── Type Exports ────────────────────────────────────────────────────────────

export type ReplyTrainingExample = typeof replyTrainingExamples.$inferSelect;
export type NewReplyTrainingExample = typeof replyTrainingExamples.$inferInsert;
export type ReplyOutcomeSignal = typeof replyOutcomeSignals.$inferSelect;
export type NewReplyOutcomeSignal = typeof replyOutcomeSignals.$inferInsert;
export type ReplyBrandVoiceStats = typeof replyBrandVoiceStats.$inferSelect;
