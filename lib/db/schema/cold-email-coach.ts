/**
 * Cold Email Coach ("Bison") Schema
 *
 * Tables backing the continuous cold-email optimization agent:
 *
 *  - cold_email_questions  → questions Bison asks the user (offer clarity,
 *                            proof points, ICP refinement, missing creative)
 *                            Surface on the AM Collective dashboard alongside
 *                            Tara/Alex/Carl in the "AGENT QUESTIONS" widget.
 *
 *  - cold_email_experiments → every A/B test Bison runs against a campaign step.
 *                             Tracks baseline + challenger metrics, status, and
 *                             promotion decisions. The audit trail for the
 *                             AutoResearch loop.
 *
 *  - cold_email_insights   → daily natural-language briefing from Bison.
 *                             "Olander step 1 reply rate dropped to 1.8%, suggest
 *                             rewriting the Variant A opener — see exp_abc123."
 *
 * Foreign keys point at outreach_campaigns.external_id (EmailBison campaign id)
 * rather than the internal uuid so we don't lose history when campaigns are
 * re-synced.
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
} from "drizzle-orm/pg-core";

// ─── Enums ──────────────────────────────────────────────────────────────────

export const coldEmailQuestionStatusEnum = pgEnum("cold_email_question_status", [
  "open",       // surfaced, awaiting answer
  "answered",   // user provided answer, KB will update
  "dismissed",  // user dismissed without answering
  "expired",    // auto-expired after N days untouched
]);

export const coldEmailQuestionCategoryEnum = pgEnum("cold_email_question_category", [
  "offer",          // "What's your strongest free-value offer for aerospace ICP?"
  "proof",          // "Do you have a named customer reference for medical device shops?"
  "icp",            // "Should we exclude shops under $5M revenue from the Olander list?"
  "creative",       // "Want me to test a contrarian subject line for step 1?"
  "deliverability", // "Bounce rate on inbox X is 5.2% — should we pause warmup?"
  "sequence",       // "Want me to add a 5th touch (Day 21) before the breakup?"
  "other",
]);

export const coldEmailExperimentStatusEnum = pgEnum("cold_email_experiment_status", [
  "pending_approval", // challenger drafted, awaiting user OK before deploy
  "running",          // challenger live in EmailBison, collecting data
  "evaluating",       // sample size hit, awaiting evaluation window close
  "winner_challenger",// challenger beat baseline by ≥20% relative lift → promoted
  "winner_baseline",  // baseline held; challenger archived
  "inconclusive",     // not enough signal, archived
  "aborted",          // user killed it
]);

export const coldEmailExperimentLeverEnum = pgEnum("cold_email_experiment_lever", [
  "subject_line",
  "opener",
  "body",
  "cta",
  "personalization_token",
  "send_time",
  "sequence_step_addition",
  "full_rewrite",
]);

// ─── Tables ─────────────────────────────────────────────────────────────────

/**
 * Questions Bison surfaces to the user to improve a campaign.
 *
 * UX: shown in the AGENT QUESTIONS widget on the AMC dashboard.
 * Answered questions trigger a KB update via the answeredAction payload.
 */
export const coldEmailQuestions = pgTable(
  "cold_email_questions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    /** EmailBison campaign id (null = workspace-wide question) */
    campaignExternalId: integer("campaign_external_id"),
    campaignName: varchar("campaign_name", { length: 500 }),
    /** Workspace / brand the question is about ("olander", "cursive", "campusgtm") */
    workspace: varchar("workspace", { length: 100 }),
    category: coldEmailQuestionCategoryEnum("category").notNull(),
    /** The actual question shown to the user */
    question: text("question").notNull(),
    /** Why Bison is asking — included in expanded view */
    reasoning: text("reasoning"),
    /** Optional suggested answers (chip-style chooser in UI) */
    suggestedAnswers: jsonb("suggested_answers").$type<string[]>(),
    /** 0 = nice-to-have, 1 = should-have, 2 = blocking */
    priority: integer("priority").default(1).notNull(),
    status: coldEmailQuestionStatusEnum("status").default("open").notNull(),
    /** User's answer once provided */
    answerText: text("answer_text"),
    /** What Bison should do with the answer — typed JSON payload */
    answeredAction: jsonb("answered_action").$type<{
      type: "update_kb_field" | "generate_experiment" | "pause_campaign" | "custom";
      field?: string;
      experimentLever?: string;
      notes?: string;
    }>(),
    answeredAt: timestamp("answered_at", { withTimezone: true }),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("cold_email_questions_status_idx").on(table.status),
    index("cold_email_questions_campaign_idx").on(table.campaignExternalId),
    index("cold_email_questions_workspace_idx").on(table.workspace),
    index("cold_email_questions_priority_idx").on(table.priority),
    index("cold_email_questions_created_idx").on(table.createdAt),
  ]
);

/**
 * Each A/B experiment Bison runs against a sequence step.
 * Baseline = current production variant. Challenger = Bison's proposed rewrite.
 */
export const coldEmailExperiments = pgTable(
  "cold_email_experiments",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    campaignExternalId: integer("campaign_external_id").notNull(),
    campaignName: varchar("campaign_name", { length: 500 }),
    workspace: varchar("workspace", { length: 100 }),
    /** Which sequence step (1-indexed) */
    sequenceStep: integer("sequence_step").notNull(),
    /** The single variable being tested */
    lever: coldEmailExperimentLeverEnum("lever").notNull(),
    /** Plain-English summary of the hypothesis */
    hypothesis: text("hypothesis").notNull(),

    // ─── Baseline (current production) ─────────────────────────────────
    baselineSubject: text("baseline_subject"),
    baselineBody: text("baseline_body"),
    baselineSends: integer("baseline_sends").default(0),
    baselineOpens: integer("baseline_opens").default(0),
    baselineReplies: integer("baseline_replies").default(0),
    /** As of last evaluation */
    baselineReplyRate: real("baseline_reply_rate"),

    // ─── Challenger (Bison's proposal) ─────────────────────────────────
    challengerSubject: text("challenger_subject"),
    challengerBody: text("challenger_body"),
    challengerSends: integer("challenger_sends").default(0),
    challengerOpens: integer("challenger_opens").default(0),
    challengerReplies: integer("challenger_replies").default(0),
    challengerReplyRate: real("challenger_reply_rate"),
    /** EmailBison sequence_step id once deployed */
    challengerStepExternalId: integer("challenger_step_external_id"),

    // ─── Evaluation criteria ────────────────────────────────────────────
    /** Minimum sends per arm before evaluating (default 50) */
    minSampleSize: integer("min_sample_size").default(50).notNull(),
    /** Required relative lift for challenger to win (default 0.20 = 20%) */
    minRelativeLift: real("min_relative_lift").default(0.20).notNull(),
    /** When the experiment can be evaluated */
    evaluateAfter: timestamp("evaluate_after", { withTimezone: true }),

    status: coldEmailExperimentStatusEnum("status").default("pending_approval").notNull(),
    /** Reasoning Bison provided for the proposal */
    reasoning: text("reasoning"),
    /** Final decision rationale once evaluated */
    decisionNotes: text("decision_notes"),

    requiresApproval: boolean("requires_approval").default(true).notNull(),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    deployedAt: timestamp("deployed_at", { withTimezone: true }),
    evaluatedAt: timestamp("evaluated_at", { withTimezone: true }),

    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("cold_email_experiments_campaign_idx").on(table.campaignExternalId),
    index("cold_email_experiments_status_idx").on(table.status),
    index("cold_email_experiments_workspace_idx").on(table.workspace),
    index("cold_email_experiments_evaluate_after_idx").on(table.evaluateAfter),
    index("cold_email_experiments_created_idx").on(table.createdAt),
  ]
);

/**
 * Daily natural-language insight stream from Bison. Surface in dashboard
 * alongside the Tara/Alex/Carl briefings.
 */
export const coldEmailInsights = pgTable(
  "cold_email_insights",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    /** YYYY-MM-DD */
    forDate: varchar("for_date", { length: 10 }).notNull(),
    workspace: varchar("workspace", { length: 100 }),
    campaignExternalId: integer("campaign_external_id"),
    campaignName: varchar("campaign_name", { length: 500 }),
    /** Short headline ("Olander step 1 reply rate dropped 47% wk-over-wk") */
    headline: varchar("headline", { length: 500 }).notNull(),
    /** Detailed read with numbers + recommendation */
    body: text("body").notNull(),
    /** Linked experiment id if Bison proposed one */
    experimentId: uuid("experiment_id"),
    /** Linked question id if Bison needs an answer */
    questionId: uuid("question_id"),
    /** 0=info, 1=action, 2=urgent */
    severity: integer("severity").default(0).notNull(),
    /** Raw metrics snapshot for audit */
    metricsSnapshot: jsonb("metrics_snapshot"),
    dismissedAt: timestamp("dismissed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("cold_email_insights_for_date_idx").on(table.forDate),
    index("cold_email_insights_campaign_idx").on(table.campaignExternalId),
    index("cold_email_insights_severity_idx").on(table.severity),
    index("cold_email_insights_workspace_idx").on(table.workspace),
  ]
);

// ─── Type Exports ───────────────────────────────────────────────────────────

export type ColdEmailQuestion = typeof coldEmailQuestions.$inferSelect;
export type NewColdEmailQuestion = typeof coldEmailQuestions.$inferInsert;
export type ColdEmailExperiment = typeof coldEmailExperiments.$inferSelect;
export type NewColdEmailExperiment = typeof coldEmailExperiments.$inferInsert;
export type ColdEmailInsight = typeof coldEmailInsights.$inferSelect;
export type NewColdEmailInsight = typeof coldEmailInsights.$inferInsert;
