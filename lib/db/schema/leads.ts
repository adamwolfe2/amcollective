/**
 * Leads Schema -- CRM pipeline for tracking prospects before they become clients.
 */

import {
  pgTable,
  pgEnum,
  uuid,
  text,
  integer,
  timestamp,
  date,
  boolean,
  jsonb,
  index,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { clients } from "./crm";
import { companyTagEnum } from "./costs";

// -- Enums --

export const leadStageEnum = pgEnum("lead_stage", [
  "awareness",
  "interest",
  "consideration",
  "intent",
  "closed_won",
  "closed_lost",
  "nurture",
  // Tracker-grid stages (2026-07 CRM refresh — see .claude/specs/2026-07-02-crm-refresh.md)
  "prospect",
  "active",
  "proposal",
]);

/** Confidence of a row's data until confirmed against Mercury or a signed doc. */
export const dataConfidenceEnum = pgEnum("data_confidence", [
  "verified",
  "provisional",
  "stale",
]);

export const leadSourceEnum = pgEnum("lead_source", [
  "referral",
  "inbound",
  "outbound",
  "conference",
  "social",
  "university",
  "other",
]);

// -- Tables --

export const leads = pgTable(
  "leads",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    companyTag: companyTagEnum("company_tag").notNull().default("am_collective"),

    // Contact info
    contactName: text("contact_name").notNull(),
    companyName: text("company_name"),
    email: text("email"),
    phone: text("phone"),
    linkedinUrl: text("linkedin_url"),
    website: text("website"),

    // Pipeline
    stage: leadStageEnum("stage").notNull().default("awareness"),
    source: leadSourceEnum("source"),
    assignedTo: text("assigned_to"),

    // Opportunity sizing
    estimatedValue: integer("estimated_value"), // cents
    probability: integer("probability"), // 0-100
    expectedCloseDate: date("expected_close_date"),

    // Tracker grid (2026-07 CRM refresh)
    priority: text("priority"), // "P0" | "P1" | "P2"
    nextStep: text("next_step"),
    lastStepDate: date("last_step_date"), // distinct from lastContactedAt
    ownerSecondary: text("owner_secondary"),
    correctEmail: text("correct_email"), // verified-correct email when `email` is suspect
    payStatus: text("pay_status"), // "on_track" | "pending" | "overdue" | "paid"
    totalValue: integer("total_value"), // cents — engagement total
    mrr: integer("mrr"), // cents
    collected: integer("collected"), // cents — remaining = totalValue - collected
    ipOrLegalFlag: boolean("ip_or_legal_flag").default(false).notNull(),
    dataConfidence: dataConfidenceEnum("data_confidence")
      .default("provisional")
      .notNull(),

    // Enrichment
    industry: text("industry"),
    companySize: text("company_size"),
    notes: text("notes"),
    tags: jsonb("tags").$type<string[]>(),

    // Conversion
    convertedToClientId: uuid("converted_to_client_id").references(
      () => clients.id
    ),
    convertedAt: timestamp("converted_at", { mode: "date" }),

    // Tracking
    lastContactedAt: timestamp("last_contacted_at", { mode: "date" }),
    nextFollowUpAt: timestamp("next_follow_up_at", { mode: "date" }),

    isArchived: boolean("is_archived").default(false).notNull(),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { mode: "date" })
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    index("leads_stage_idx").on(table.stage),
    index("leads_company_tag_idx").on(table.companyTag),
    index("leads_next_follow_up_idx").on(table.nextFollowUpAt),
    index("leads_source_idx").on(table.source),
    index("leads_is_archived_idx").on(table.isArchived),
    index("leads_created_at_idx").on(table.createdAt),
    index("leads_updated_at_idx").on(table.updatedAt),
    index("leads_priority_idx").on(table.priority),
    index("leads_last_step_date_idx").on(table.lastStepDate),
    index("leads_pay_status_idx").on(table.payStatus),
  ]
);

export const leadActivities = pgTable(
  "lead_activities",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    leadId: uuid("lead_id")
      .notNull()
      .references(() => leads.id, { onDelete: "cascade" }),
    type: text("type").notNull(), // "note" | "email" | "call" | "meeting" | "stage_change"
    content: text("content"),
    createdById: text("created_by_id"),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
  },
  (table) => [
    index("lead_activities_lead_id_idx").on(table.leadId),
    index("lead_activities_created_at_idx").on(table.createdAt),
  ]
);

// -- Relations --

export const leadsRelations = relations(leads, ({ one, many }) => ({
  client: one(clients, {
    fields: [leads.convertedToClientId],
    references: [clients.id],
  }),
  activities: many(leadActivities),
}));

export const leadActivitiesRelations = relations(
  leadActivities,
  ({ one }) => ({
    lead: one(leads, {
      fields: [leadActivities.leadId],
      references: [leads.id],
    }),
  })
);
