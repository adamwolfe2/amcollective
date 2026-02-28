/**
 * Outreach Schema — EmailBison campaign data + webhook events
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
