/**
 * Integrations Schema — Connected external accounts (Gmail, Slack, etc.)
 *
 * Tracks OAuth connections via Composio SDK.
 */

import {
  pgTable,
  uuid,
  varchar,
  timestamp,
  jsonb,
  index,
} from "drizzle-orm/pg-core";
import { pgEnum } from "drizzle-orm/pg-core";

// ─── Enums ──────────────────────────────────────────────────────────────────

export const connectedAccountStatusEnum = pgEnum("connected_account_status", [
  "active",
  "expired",
  "disconnected",
]);

// ─── Tables ─────────────────────────────────────────────────────────────────

export const connectedAccounts = pgTable(
  "connected_accounts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: varchar("user_id", { length: 255 }).notNull(),
    provider: varchar("provider", { length: 50 }).notNull(),
    composioAccountId: varchar("composio_account_id", { length: 255 }),
    email: varchar("email", { length: 255 }),
    status: connectedAccountStatusEnum("status").notNull().default("active"),
    metadata: jsonb("metadata"),
    lastSyncAt: timestamp("last_sync_at", { mode: "date" }),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { mode: "date" })
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    index("connected_accounts_user_id_idx").on(table.userId),
    index("connected_accounts_provider_idx").on(table.provider),
    index("connected_accounts_status_idx").on(table.status),
  ]
);
