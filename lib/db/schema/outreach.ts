/**
 * Outreach Schema — EmailBison campaign data, webhook events, and inbox replies
 */

// ─── Campaign Knowledge Base Type ───────────────────────────────────────────
// Stored as JSONB on outreach_campaigns.knowledge_base
// Used by the outreach agent to write campaign-specific cold emails

export interface CampaignKnowledgeBase {
  /** Product or service being promoted */
  productName: string;
  /** One-sentence value proposition */
  valueProp: string;
  /** Ideal Customer Profile — who this campaign targets */
  icp: {
    roles: string[];          // e.g. ["VP of Sales", "Head of RevOps"]
    industries: string[];     // e.g. ["B2B SaaS", "Professional Services"]
    companySizes: string[];   // e.g. ["50-200 employees", "Series A-B"]
    painPoints: string[];     // core problems they experience
  };
  /** Tone calibration based on audience seniority */
  toneProfile: "c-suite" | "mid-level" | "technical" | "founder";
  /** Social proof — case studies, metrics, credibility signals */
  proof: Array<{
    company?: string;
    result: string;           // e.g. "Reduced onboarding time by 40%"
    metric?: string;          // e.g. "$120K saved in year 1"
  }>;
  /** Approved copy guidelines and phrases to use/avoid */
  copyGuidelines?: {
    use?: string[];           // phrases, angles, hooks that work
    avoid?: string[];         // banned phrases, jargon, tired lines
  };
  /** Approved email templates — initial touch + follow-up sequence */
  templates?: Array<{
    step: number;             // 1 = initial, 2-5 = follow-ups
    label: string;            // e.g. "Initial", "Follow-up 1 — Case Study"
    subjectLine: string;
    body: string;
    notes?: string;           // when/how to use this template
  }>;
  /** Free-form notes — competitor positioning, objections, context */
  notes?: string;
  updatedAt?: string;
}

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
} from "drizzle-orm/pg-core";

// ─── Campaigns ──────────────────────────────────────────────────────────────

export const outreachCampaigns = pgTable(
  "outreach_campaigns",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    externalId: integer("external_id").notNull().unique(),
    name: varchar("name", { length: 500 }).notNull(),
    status: varchar("status", { length: 50 }).default("unknown"),
    totalLeads: integer("total_leads").default(0),
    contacted: integer("contacted").default(0),
    opened: integer("opened").default(0),
    replied: integer("replied").default(0),
    interested: integer("interested").default(0),
    bounced: integer("bounced").default(0),
    unsubscribed: integer("unsubscribed").default(0),
    metadata: jsonb("metadata"),
    // Per-campaign cold email knowledge base — set via CEO agent or UI
    // Shape: CampaignKnowledgeBase (see lib/ai/agents/outreach-agent.ts)
    knowledgeBase: jsonb("knowledge_base").$type<CampaignKnowledgeBase>(),
    lastSyncedAt: timestamp("last_synced_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("outreach_campaigns_external_id_idx").on(table.externalId),
  ]
);

// ─── Webhook Events ─────────────────────────────────────────────────────────

export const outreachEvents = pgTable(
  "outreach_events",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    eventType: varchar("event_type", { length: 100 }).notNull(),
    campaignId: integer("campaign_id"),
    campaignName: varchar("campaign_name", { length: 500 }),
    leadEmail: varchar("lead_email", { length: 500 }),
    leadName: varchar("lead_name", { length: 500 }),
    senderEmail: varchar("sender_email", { length: 500 }),
    subject: varchar("subject", { length: 1000 }),
    payload: jsonb("payload"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("outreach_events_type_idx").on(table.eventType),
    index("outreach_events_campaign_idx").on(table.campaignId),
    index("outreach_events_created_idx").on(table.createdAt),
  ]
);

// ─── Inbox Replies ───────────────────────────────────────────────────────────

export const emailbisonReplies = pgTable(
  "emailbison_replies",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    externalId: integer("external_id").notNull().unique(),
    campaignId: integer("campaign_id"),
    campaignName: varchar("campaign_name", { length: 500 }),
    leadEmail: varchar("lead_email", { length: 500 }).notNull(),
    leadName: varchar("lead_name", { length: 500 }),
    senderEmail: varchar("sender_email", { length: 500 }),
    subject: varchar("subject", { length: 1000 }),
    body: text("body"),
    isRead: boolean("is_read").default(false).notNull(),
    isInterested: boolean("is_interested").default(false).notNull(),
    receivedAt: timestamp("received_at", { withTimezone: true }),
    metadata: jsonb("metadata"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("emailbison_replies_external_id_idx").on(table.externalId),
    index("emailbison_replies_lead_email_idx").on(table.leadEmail),
    index("emailbison_replies_campaign_idx").on(table.campaignId),
    index("emailbison_replies_received_idx").on(table.receivedAt),
    index("emailbison_replies_is_read_idx").on(table.isRead),
  ]
);
