import {
  pgTable,
  uuid,
  varchar,
  text,
  timestamp,
  integer,
  index,
  jsonb,
  numeric,
  date,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { portfolioProjects } from "./projects";

// ─── Tables ─────────────────────────────────────────────────────────────────

export const toolAccounts = pgTable(
  "tool_accounts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: varchar("name", { length: 255 }).notNull(),
    accountId: varchar("account_id", { length: 255 }),
    apiKeyRef: varchar("api_key_ref", { length: 255 }),
    monthlyBudget: integer("monthly_budget"),
    alertThreshold: integer("alert_threshold"),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { mode: "date" })
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
  },
  (table) => [index("tool_accounts_created_at_idx").on(table.createdAt)]
);

export const toolCosts = pgTable(
  "tool_costs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    toolAccountId: uuid("tool_account_id")
      .notNull()
      .references(() => toolAccounts.id, { onDelete: "cascade" }),
    projectId: uuid("project_id").references(() => portfolioProjects.id, {
      onDelete: "set null",
    }),
    amount: integer("amount").notNull(),
    period: varchar("period", { length: 50 }),
    periodStart: date("period_start", { mode: "date" }),
    periodEnd: date("period_end", { mode: "date" }),
    metadata: jsonb("metadata"),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
  },
  (table) => [
    index("tool_costs_tool_account_id_idx").on(table.toolAccountId),
    index("tool_costs_project_id_idx").on(table.projectId),
    index("tool_costs_created_at_idx").on(table.createdAt),
  ]
);

export const apiUsage = pgTable(
  "api_usage",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    provider: varchar("provider", { length: 100 }).notNull(),
    projectId: uuid("project_id").references(() => portfolioProjects.id, {
      onDelete: "set null",
    }),
    tokensUsed: integer("tokens_used"),
    creditsUsed: numeric("credits_used"),
    cost: integer("cost"),
    date: date("date", { mode: "date" }).notNull(),
    metadata: jsonb("metadata"),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
  },
  (table) => [
    index("api_usage_provider_idx").on(table.provider),
    index("api_usage_project_id_idx").on(table.projectId),
    index("api_usage_date_idx").on(table.date),
    index("api_usage_created_at_idx").on(table.createdAt),
  ]
);

// ─── Relations ──────────────────────────────────────────────────────────────

export const toolAccountsRelations = relations(toolAccounts, ({ many }) => ({
  toolCosts: many(toolCosts),
}));

export const toolCostsRelations = relations(toolCosts, ({ one }) => ({
  toolAccount: one(toolAccounts, {
    fields: [toolCosts.toolAccountId],
    references: [toolAccounts.id],
  }),
  project: one(portfolioProjects, {
    fields: [toolCosts.projectId],
    references: [portfolioProjects.id],
  }),
}));

export const apiUsageRelations = relations(apiUsage, ({ one }) => ({
  project: one(portfolioProjects, {
    fields: [apiUsage.projectId],
    references: [portfolioProjects.id],
  }),
}));
