import {
  pgTable,
  uuid,
  varchar,
  text,
  timestamp,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";

// ─── Push Subscriptions ──────────────────────────────────────────────────────
// Stores Web Push API subscription objects per user for push notifications.

export const pushSubscriptions = pgTable(
  "push_subscriptions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: varchar("user_id", { length: 255 }).notNull(), // Clerk user ID
    endpoint: text("endpoint").notNull(),
    p256dh: text("p256dh").notNull(), // client's ECDH public key
    auth: text("auth").notNull(), // 16-byte random auth secret
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { mode: "date" })
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    index("push_subscriptions_user_id_idx").on(table.userId),
    index("push_subscriptions_created_at_idx").on(table.createdAt),
    uniqueIndex("push_subscriptions_endpoint_uniq").on(table.endpoint),
  ]
);
