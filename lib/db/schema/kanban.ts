import {
  pgTable,
  pgEnum,
  uuid,
  varchar,
  text,
  boolean,
  timestamp,
  integer,
  index,
  jsonb,
  date,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { clients } from "./crm";
import { teamMembers } from "./projects";

// ─── Enums ──────────────────────────────────────────────────────────────────

export const cardPriorityEnum = pgEnum("card_priority", [
  "low",
  "medium",
  "high",
  "urgent",
]);

// ─── Tables ─────────────────────────────────────────────────────────────────

export const kanbanColumns = pgTable(
  "kanban_columns",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    clientId: uuid("client_id")
      .notNull()
      .references(() => clients.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 100 }).notNull(),
    position: integer("position").notNull().default(0),
    color: varchar("color", { length: 7 }), // hex e.g. #3B82F6
    isDefault: boolean("is_default").notNull().default(false),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
  },
  (table) => [
    index("kanban_cols_client_id_idx").on(table.clientId),
    index("kanban_cols_position_idx").on(table.position),
  ]
);

export const kanbanCards = pgTable(
  "kanban_cards",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    columnId: uuid("column_id")
      .notNull()
      .references(() => kanbanColumns.id, { onDelete: "cascade" }),
    clientId: uuid("client_id")
      .notNull()
      .references(() => clients.id, { onDelete: "cascade" }),
    title: varchar("title", { length: 500 }).notNull(),
    description: text("description"),
    dueDate: date("due_date", { mode: "date" }),
    assigneeId: uuid("assignee_id").references(() => teamMembers.id, {
      onDelete: "set null",
    }),
    priority: cardPriorityEnum("priority").notNull().default("medium"),
    position: integer("position").notNull().default(0),
    labels: jsonb("labels").$type<string[]>(),
    completedAt: timestamp("completed_at", { mode: "date" }),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { mode: "date" })
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    index("kanban_cards_column_id_idx").on(table.columnId),
    index("kanban_cards_client_id_idx").on(table.clientId),
    index("kanban_cards_assignee_id_idx").on(table.assigneeId),
    index("kanban_cards_priority_idx").on(table.priority),
    index("kanban_cards_position_idx").on(table.position),
    index("kanban_cards_due_date_idx").on(table.dueDate),
    index("kanban_cards_created_at_idx").on(table.createdAt),
  ]
);

export const kanbanComments = pgTable(
  "kanban_comments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    cardId: uuid("card_id")
      .notNull()
      .references(() => kanbanCards.id, { onDelete: "cascade" }),
    authorId: varchar("author_id", { length: 255 }).notNull(), // Clerk user ID
    authorName: varchar("author_name", { length: 255 }),
    content: text("content").notNull(),
    isClientVisible: boolean("is_client_visible").notNull().default(true),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
  },
  (table) => [
    index("kanban_comments_card_id_idx").on(table.cardId),
    index("kanban_comments_created_at_idx").on(table.createdAt),
  ]
);

// ─── Default Columns ────────────────────────────────────────────────────────

export const DEFAULT_KANBAN_COLUMNS = [
  { name: "Lead", position: 0, color: "#6B7280" },
  { name: "Onboarding", position: 1, color: "#3B82F6" },
  { name: "In Progress", position: 2, color: "#F59E0B" },
  { name: "Review", position: 3, color: "#8B5CF6" },
  { name: "Delivered", position: 4, color: "#10B981" },
  { name: "Retained", position: 5, color: "#0A0A0A" },
] as const;

// ─── Relations ──────────────────────────────────────────────────────────────

export const kanbanColumnsRelations = relations(
  kanbanColumns,
  ({ one, many }) => ({
    client: one(clients, {
      fields: [kanbanColumns.clientId],
      references: [clients.id],
    }),
    cards: many(kanbanCards),
  })
);

export const kanbanCardsRelations = relations(
  kanbanCards,
  ({ one, many }) => ({
    column: one(kanbanColumns, {
      fields: [kanbanCards.columnId],
      references: [kanbanColumns.id],
    }),
    client: one(clients, {
      fields: [kanbanCards.clientId],
      references: [clients.id],
    }),
    assignee: one(teamMembers, {
      fields: [kanbanCards.assigneeId],
      references: [teamMembers.id],
    }),
    comments: many(kanbanComments),
  })
);

export const kanbanCommentsRelations = relations(
  kanbanComments,
  ({ one }) => ({
    card: one(kanbanCards, {
      fields: [kanbanComments.cardId],
      references: [kanbanCards.id],
    }),
  })
);
