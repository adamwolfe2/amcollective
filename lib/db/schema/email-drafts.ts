import {
  pgTable,
  uuid,
  varchar,
  text,
  timestamp,
  index,
  jsonb,
  integer,
  boolean,
} from "drizzle-orm/pg-core";
import { pgEnum } from "drizzle-orm/pg-core";
import { clients } from "./crm";

// ─── Enums ──────────────────────────────────────────────────────────────────

export const emailDraftStatusEnum = pgEnum("email_draft_status", [
  "draft",
  "ready",
  "sent",
  "failed",
]);

// ─── Tables ─────────────────────────────────────────────────────────────────

/**
 * Email drafts — AI-generated or manually created email drafts.
 * ClaudeBot can create drafts; admin reviews and sends.
 */
export const emailDrafts = pgTable(
  "email_drafts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    clientId: uuid("client_id").references(() => clients.id, {
      onDelete: "set null",
    }),
    to: varchar("to", { length: 500 }).notNull(),
    cc: varchar("cc", { length: 500 }),
    subject: varchar("subject", { length: 500 }).notNull(),
    body: text("body").notNull(), // HTML body
    plainText: text("plain_text"), // Plain text fallback
    status: emailDraftStatusEnum("status").default("draft").notNull(),
    generatedBy: varchar("generated_by", { length: 100 }), // "agent", "user", etc.
    context: text("context"), // Why this email was generated
    metadata: jsonb("metadata"), // Any extra context (conversation ID, etc.)
    sentAt: timestamp("sent_at", { mode: "date" }),
    sentMessageId: varchar("sent_message_id", { length: 255 }), // Resend message ID
    createdBy: varchar("created_by", { length: 255 }), // Clerk user ID
    // Reply auto-responder linkage — null for normal drafts, populated when this
    // draft was generated in response to an EmailBison reply
    replyExternalId: integer("reply_external_id"),
    replyIntent: varchar("reply_intent", { length: 40 }), // e.g. "interested", "objection", "question"
    replyConfidence: integer("reply_confidence"), // 0-100
    replySafeToAutoSend: boolean("reply_safe_to_auto_send").default(false).notNull(),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { mode: "date" })
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    index("email_drafts_client_id_idx").on(table.clientId),
    index("email_drafts_status_idx").on(table.status),
    index("email_drafts_created_at_idx").on(table.createdAt),
    index("email_drafts_reply_external_id_idx").on(table.replyExternalId),
    index("email_drafts_reply_intent_idx").on(table.replyIntent),
  ]
);

/**
 * Sent email log — tracks all outbound emails for reference.
 */
export const sentEmails = pgTable(
  "sent_emails",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    clientId: uuid("client_id").references(() => clients.id, {
      onDelete: "set null",
    }),
    to: varchar("to", { length: 500 }).notNull(),
    cc: varchar("cc", { length: 500 }),
    subject: varchar("subject", { length: 500 }).notNull(),
    body: text("body"),
    resendMessageId: varchar("resend_message_id", { length: 255 }),
    sentBy: varchar("sent_by", { length: 255 }), // Clerk user ID or "system"
    openedAt: timestamp("opened_at", { mode: "date" }),
    clickedAt: timestamp("clicked_at", { mode: "date" }),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
  },
  (table) => [
    index("sent_emails_client_id_idx").on(table.clientId),
    index("sent_emails_created_at_idx").on(table.createdAt),
  ]
);
