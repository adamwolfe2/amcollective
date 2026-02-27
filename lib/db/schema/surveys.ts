import {
  pgTable,
  uuid,
  varchar,
  text,
  timestamp,
  integer,
  index,
} from "drizzle-orm/pg-core";
import { pgEnum } from "drizzle-orm/pg-core";
import { clients } from "./crm";

// ─── Enums ──────────────────────────────────────────────────────────────────

export const surveyTypeEnum = pgEnum("survey_type", [
  "nps",
  "csat",
  "general",
]);

export const surveyStatusEnum = pgEnum("survey_status", [
  "pending",
  "sent",
  "completed",
  "expired",
]);

// ─── Tables ─────────────────────────────────────────────────────────────────

/**
 * Client satisfaction surveys.
 * Each row = one survey sent to one client.
 */
export const surveys = pgTable(
  "surveys",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    clientId: uuid("client_id")
      .notNull()
      .references(() => clients.id, { onDelete: "cascade" }),
    type: surveyTypeEnum("type").default("nps").notNull(),
    status: surveyStatusEnum("status").default("pending").notNull(),
    // NPS: 0-10 score
    score: integer("score"), // NPS: 0-10, CSAT: 1-5
    feedback: text("feedback"), // Open-ended response
    // Metadata
    sentAt: timestamp("sent_at", { mode: "date" }),
    respondedAt: timestamp("responded_at", { mode: "date" }),
    expiresAt: timestamp("expires_at", { mode: "date" }),
    sentBy: varchar("sent_by", { length: 255 }), // Clerk user ID or "system"
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
  },
  (table) => [
    index("surveys_client_id_idx").on(table.clientId),
    index("surveys_type_idx").on(table.type),
    index("surveys_status_idx").on(table.status),
    index("surveys_created_at_idx").on(table.createdAt),
  ]
);
