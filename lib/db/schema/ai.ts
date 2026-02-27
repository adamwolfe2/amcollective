import {
  pgTable,
  uuid,
  varchar,
  text,
  timestamp,
  integer,
  index,
  jsonb,
  customType,
} from "drizzle-orm/pg-core";
import { pgEnum } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";

// ─── Custom Types ───────────────────────────────────────────────────────────

const vector = customType<{
  data: number[];
  driverParam: string;
  config: { dimensions: number };
}>({
  dataType(config) {
    return `vector(${config?.dimensions ?? 1536})`;
  },
  toDriver(value: number[]): string {
    return `[${value.join(",")}]`;
  },
  fromDriver(value: unknown): number[] {
    // Postgres returns vectors as "[0.1,0.2,...]"
    const str = value as string;
    return str
      .replace(/^\[/, "")
      .replace(/\]$/, "")
      .split(",")
      .map(Number);
  },
});

// ─── Enums ──────────────────────────────────────────────────────────────────

export const aiMessageRoleEnum = pgEnum("ai_message_role", [
  "user",
  "assistant",
  "system",
  "tool",
]);

export const embeddingSourceTypeEnum = pgEnum("embedding_source_type", [
  "sop",
  "client_note",
  "project_doc",
  "invoice",
  "meeting",
]);

// ─── Tables ─────────────────────────────────────────────────────────────────

export const aiConversations = pgTable(
  "ai_conversations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: varchar("user_id", { length: 255 }).notNull(),
    title: varchar("title", { length: 500 }),
    model: varchar("model", { length: 100 }),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { mode: "date" })
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    index("ai_conversations_user_id_idx").on(table.userId),
    index("ai_conversations_created_at_idx").on(table.createdAt),
  ]
);

export const aiMessages = pgTable(
  "ai_messages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    conversationId: uuid("conversation_id")
      .notNull()
      .references(() => aiConversations.id, { onDelete: "cascade" }),
    role: aiMessageRoleEnum("role").notNull(),
    content: text("content"),
    toolCalls: jsonb("tool_calls"),
    tokenCount: integer("token_count"),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
  },
  (table) => [
    index("ai_messages_conversation_id_idx").on(table.conversationId),
    index("ai_messages_created_at_idx").on(table.createdAt),
  ]
);

export const embeddings = pgTable(
  "embeddings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    content: text("content").notNull(),
    embedding: vector("embedding", { dimensions: 1536 }).notNull(),
    sourceType: embeddingSourceTypeEnum("source_type").notNull(),
    sourceId: varchar("source_id", { length: 255 }),
    metadata: jsonb("metadata"),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
  },
  (table) => [
    index("embeddings_source_type_idx").on(table.sourceType),
    index("embeddings_source_id_idx").on(table.sourceId),
    index("embeddings_created_at_idx").on(table.createdAt),
  ]
);

// ─── Relations ──────────────────────────────────────────────────────────────

export const aiConversationsRelations = relations(
  aiConversations,
  ({ many }) => ({
    messages: many(aiMessages),
  })
);

export const aiMessagesRelations = relations(aiMessages, ({ one }) => ({
  conversation: one(aiConversations, {
    fields: [aiMessages.conversationId],
    references: [aiConversations.id],
  }),
}));
