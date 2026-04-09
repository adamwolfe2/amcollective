import {
  pgTable,
  uuid,
  varchar,
  text,
  timestamp,
  index,
  uniqueIndex,
  jsonb,
} from "drizzle-orm/pg-core";
import { pgEnum } from "drizzle-orm/pg-core";

// ─── Enums ──────────────────────────────────────────────────────────────────

export const emailSuppressionReasonEnum = pgEnum("email_suppression_reason", [
  "bounce",
  "complaint",
  "unsubscribe",
]);

export const emailSuppressionSourceEnum = pgEnum("email_suppression_source", [
  "resend_webhook",
  "manual",
]);

export const emailEventTypeEnum = pgEnum("email_event_type", [
  "sent",
  "delivered",
  "opened",
  "bounced",
  "complained",
  "clicked",
]);

// ─── Tables ──────────────────────────────────────────────────────────────────

export const emailSuppressions = pgTable(
  "email_suppressions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    email: varchar("email", { length: 320 }).notNull(),
    reason: emailSuppressionReasonEnum("reason").notNull(),
    source: emailSuppressionSourceEnum("source").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
  },
  (t) => [
    uniqueIndex("email_suppressions_email_idx").on(t.email),
    index("email_suppressions_reason_idx").on(t.reason),
    index("email_suppressions_created_at_idx").on(t.createdAt),
  ]
);

export const emailEvents = pgTable(
  "email_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    messageId: varchar("message_id", { length: 255 }).notNull(),
    recipientEmail: varchar("recipient_email", { length: 320 }).notNull(),
    templateName: varchar("template_name", { length: 255 }),
    event: emailEventTypeEnum("event").notNull(),
    timestamp: timestamp("timestamp", { withTimezone: true }).notNull().defaultNow(),
    metadata: jsonb("metadata"),
  },
  (t) => [
    uniqueIndex("email_events_message_id_event_idx").on(t.messageId, t.event),
    index("email_events_recipient_email_idx").on(t.recipientEmail),
    index("email_events_event_idx").on(t.event),
    index("email_events_timestamp_idx").on(t.timestamp),
    index("email_events_template_name_idx").on(t.templateName),
  ]
);

// ─── Types ───────────────────────────────────────────────────────────────────

export type EmailSuppression = typeof emailSuppressions.$inferSelect;
export type NewEmailSuppression = typeof emailSuppressions.$inferInsert;
export type EmailEvent = typeof emailEvents.$inferSelect;
export type NewEmailEvent = typeof emailEvents.$inferInsert;
