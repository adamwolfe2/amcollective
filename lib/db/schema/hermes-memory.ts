/**
 * Hermes Memory Schema — persistent, cost-controlled memory in Neon
 *
 * Replaces Hermes' built-in fluid memory (which racked up $200/mo because it
 * silently injects context into every LLM call). This table-backed memory:
 *
 *   - Lives in Neon (free under our existing plan)
 *   - Only loaded into Hermes context when it explicitly calls memory.recall
 *   - Bounded by category + tags so retrieval stays cheap
 *   - Audit-trail friendly (createdBy, sourceTool, conversation_id)
 *
 * Categories are open-ended strings for flexibility. Common ones:
 *   - "principal_preference"  — Adam's stated preferences ("never CC Maggie on X")
 *   - "client_context"        — observations about specific clients
 *   - "venture_context"       — observations about ventures
 *   - "interaction_outcome"   — what happened after a previous action
 *   - "self_improvement"      — Hermes' own reflections on what worked
 *   - "decision_log"          — strategic decisions with reasoning
 *   - "pinned"                — never-expire facts (like operator brief addenda)
 */

import {
  pgTable,
  uuid,
  varchar,
  text,
  timestamp,
  jsonb,
  integer,
  boolean,
  index,
} from "drizzle-orm/pg-core";

// ─── Memory entries ───────────────────────────────────────────────────────────

export const hermesMemory = pgTable(
  "hermes_memory",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** Open-ended category for filtering — see common values in file header */
    category: varchar("category", { length: 64 }).notNull(),
    /** Short summary line — surfaced in memory.list / memory.search results */
    summary: varchar("summary", { length: 500 }).notNull(),
    /** Full content — markdown ok */
    content: text("content").notNull(),
    /** Free-form tags for cross-filtering (venture, client, person names) */
    tags: jsonb("tags").$type<string[]>().default([]).notNull(),
    /** Importance 1-10. memory.recall sorts by this when fresh items aren't enough */
    importance: integer("importance").notNull().default(5),
    /** Pin to never expire / always surface — used for principal preferences */
    pinned: boolean("pinned").notNull().default(false),
    /** What surfaced this memory — "hermes-cron-eod", "hermes-chat", "manual", etc. */
    sourceTool: varchar("source_tool", { length: 100 }),
    /** Optional Slack conversation/thread id where this came from */
    conversationId: varchar("conversation_id", { length: 200 }),
    /** Optional Slack user id who triggered this memory write */
    actorSlackId: varchar("actor_slack_id", { length: 50 }),
    /** Last time this memory was retrieved — boosts ranking on subsequent recalls */
    lastAccessedAt: timestamp("last_accessed_at", { mode: "date" }),
    /** Number of times this memory has been recalled */
    accessCount: integer("access_count").notNull().default(0),
    /** Optional expiration — null = never expires */
    expiresAt: timestamp("expires_at", { mode: "date" }),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { mode: "date" })
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    index("hermes_memory_category_idx").on(table.category),
    index("hermes_memory_pinned_idx").on(table.pinned),
    index("hermes_memory_importance_idx").on(table.importance),
    index("hermes_memory_created_at_idx").on(table.createdAt),
    index("hermes_memory_last_accessed_idx").on(table.lastAccessedAt),
    index("hermes_memory_expires_idx").on(table.expiresAt),
  ]
);

// ─── Self-improvement reflections ────────────────────────────────────────────
// Hermes writes here at end-of-day to capture what worked / didn't work.
// memory.recall surfaces top reflections when Hermes starts a new task.

export const hermesReflections = pgTable(
  "hermes_reflections",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** "what_worked" | "what_didnt" | "pattern_observed" | "rule_proposed" */
    kind: varchar("kind", { length: 40 }).notNull(),
    summary: varchar("summary", { length: 500 }).notNull(),
    content: text("content").notNull(),
    /** Linked to a specific Slack interaction or cron run if known */
    sourceConversationId: varchar("source_conversation_id", { length: 200 }),
    sourceJobName: varchar("source_job_name", { length: 100 }),
    /** Tag with venture/client this reflection is about, if applicable */
    tags: jsonb("tags").$type<string[]>().default([]).notNull(),
    /** Has this reflection been promoted to a SOUL.md rule? */
    promotedToRule: boolean("promoted_to_rule").notNull().default(false),
    /** When promoted, link to the rule text */
    promotedRuleText: text("promoted_rule_text"),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
  },
  (table) => [
    index("hermes_reflections_kind_idx").on(table.kind),
    index("hermes_reflections_created_at_idx").on(table.createdAt),
    index("hermes_reflections_promoted_idx").on(table.promotedToRule),
  ]
);
