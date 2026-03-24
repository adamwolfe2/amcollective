import {
  pgTable,
  pgEnum,
  uuid,
  varchar,
  text,
  timestamp,
  integer,
  index,
  uniqueIndex,
  jsonb,
  boolean,
  numeric,
  date,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { portfolioProjects } from "./projects";

// ─── Enums ──────────────────────────────────────────────────────────────────

export const COMPANY_TAGS = [
  "trackr",
  "wholesail",
  "taskspace",
  "cursive",
  "tbgc",
  "hook",
  "myvsl",
  "am_collective",
  "personal",
  "untagged",
] as const;

export type CompanyTag = (typeof COMPANY_TAGS)[number];

export const companyTagEnum = pgEnum("company_tag", COMPANY_TAGS);

export const mercuryAccountTypeEnum = pgEnum("mercury_account_type", [
  "checking",
  "savings",
]);

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

// ─── Subscription Costs (Tool/SaaS recurring costs) ─────────────────────────

export const subscriptionCosts = pgTable(
  "subscription_costs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: varchar("name", { length: 255 }).notNull(),
    vendor: varchar("vendor", { length: 255 }).notNull(),
    companyTag: companyTagEnum("company_tag").notNull().default("am_collective"),
    projectId: uuid("project_id").references(() => portfolioProjects.id, {
      onDelete: "set null",
    }),
    amount: integer("amount").notNull(), // cents
    billingCycle: varchar("billing_cycle", { length: 20 }).notNull().default("monthly"), // monthly | annual
    nextRenewal: date("next_renewal", { mode: "date" }),
    category: varchar("category", { length: 100 }), // infrastructure, ai, marketing, etc.
    notes: text("notes"),
    isActive: boolean("is_active").notNull().default(true),
    stripeSubscriptionId: varchar("stripe_subscription_id", { length: 255 }),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { mode: "date" })
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    index("subscription_costs_company_tag_idx").on(table.companyTag),
    index("subscription_costs_project_id_idx").on(table.projectId),
    index("subscription_costs_is_active_idx").on(table.isActive),
    index("subscription_costs_next_renewal_idx").on(table.nextRenewal),
    uniqueIndex("subscription_costs_stripe_sub_id_idx").on(table.stripeSubscriptionId),
  ]
);

// ─── Snapshot Tables ────────────────────────────────────────────────────────

export const vercelProjectSnapshots = pgTable(
  "vercel_project_snapshots",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id").references(() => portfolioProjects.id, {
      onDelete: "cascade",
    }),
    vercelProjectId: varchar("vercel_project_id", { length: 255 }).notNull(),
    framework: varchar("framework", { length: 100 }),
    envVarCount: integer("env_var_count"),
    domains: jsonb("domains"),
    latestDeployState: varchar("latest_deploy_state", { length: 50 }),
    latestDeployAt: timestamp("latest_deploy_at", { mode: "date" }),
    bandwidthBytes: integer("bandwidth_bytes"),
    functionInvocations: integer("function_invocations"),
    buildMinutes: integer("build_minutes"),
    edgeRequests: integer("edge_requests"),
    snapshotDate: date("snapshot_date", { mode: "date" }).notNull(),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
  },
  (table) => [
    index("vercel_snapshots_project_id_idx").on(table.projectId),
    index("vercel_snapshots_date_idx").on(table.snapshotDate),
  ]
);

export const posthogSnapshots = pgTable(
  "posthog_snapshots",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => portfolioProjects.id, { onDelete: "cascade" }),
    dau: integer("dau"),
    wau: integer("wau"),
    mau: integer("mau"),
    totalPageviews: integer("total_pageviews"),
    topPages: jsonb("top_pages"),
    topEvents: jsonb("top_events"),
    signupCount: integer("signup_count"),
    snapshotDate: date("snapshot_date", { mode: "date" }).notNull(),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
  },
  (table) => [
    index("posthog_snapshots_project_id_idx").on(table.projectId),
    index("posthog_snapshots_date_idx").on(table.snapshotDate),
  ]
);

// ─── Mercury Tables ────────────────────────────────────────────────────────

export const mercuryAccounts = pgTable(
  "mercury_accounts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    externalId: varchar("external_id", { length: 255 }).notNull().unique(),
    name: varchar("name", { length: 255 }).notNull(),
    accountNumber: varchar("account_number", { length: 4 }).notNull(),
    type: mercuryAccountTypeEnum("type").notNull(),
    balance: numeric("balance", { precision: 14, scale: 2 }).notNull(),
    availableBalance: numeric("available_balance", { precision: 14, scale: 2 }).notNull(),
    currency: varchar("currency", { length: 3 }).notNull().default("USD"),
    lastSyncedAt: timestamp("last_synced_at", { mode: "date" }),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
  },
  (table) => [
    index("mercury_accounts_external_id_idx").on(table.externalId),
    index("mercury_accounts_created_at_idx").on(table.createdAt),
  ]
);

export const mercuryTransactions = pgTable(
  "mercury_transactions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    accountId: uuid("account_id")
      .notNull()
      .references(() => mercuryAccounts.id, { onDelete: "cascade" }),
    externalId: varchar("external_id", { length: 255 }).notNull().unique(),
    amount: numeric("amount", { precision: 14, scale: 2 }).notNull(),
    direction: varchar("direction", { length: 10 }).notNull(), // credit | debit
    status: varchar("status", { length: 50 }).notNull(),
    description: text("description"),
    counterpartyName: varchar("counterparty_name", { length: 255 }),
    companyTag: companyTagEnum("company_tag").notNull().default("untagged"),
    postedAt: timestamp("posted_at", { mode: "date" }),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
  },
  (table) => [
    index("mercury_txns_account_id_idx").on(table.accountId),
    index("mercury_txns_external_id_idx").on(table.externalId),
    index("mercury_txns_company_tag_idx").on(table.companyTag),
    index("mercury_txns_posted_at_idx").on(table.postedAt),
    index("mercury_txns_created_at_idx").on(table.createdAt),
  ]
);

// ─── Cash Snapshots (Daily runway tracking) ──────────────────────────────────

export const cashSnapshots = pgTable(
  "cash_snapshots",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    balanceCents: integer("balance_cents").notNull(),    // total Mercury balance
    burnCents: integer("burn_cents").notNull(),          // monthly infrastructure burn
    runwayMonths: numeric("runway_months", { precision: 6, scale: 2 }), // balance / burn
    recordedAt: timestamp("recorded_at", { mode: "date" }).defaultNow().notNull(),
  },
  (table) => [
    index("cash_snapshots_recorded_at_idx").on(table.recordedAt),
  ]
);

// ─── Relations ──────────────────────────────────────────────────────────────

export const subscriptionCostsRelations = relations(subscriptionCosts, ({ one }) => ({
  project: one(portfolioProjects, {
    fields: [subscriptionCosts.projectId],
    references: [portfolioProjects.id],
  }),
}));

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

export const vercelProjectSnapshotsRelations = relations(
  vercelProjectSnapshots,
  ({ one }) => ({
    project: one(portfolioProjects, {
      fields: [vercelProjectSnapshots.projectId],
      references: [portfolioProjects.id],
    }),
  })
);

export const posthogSnapshotsRelations = relations(
  posthogSnapshots,
  ({ one }) => ({
    project: one(portfolioProjects, {
      fields: [posthogSnapshots.projectId],
      references: [portfolioProjects.id],
    }),
  })
);

export const mercuryAccountsRelations = relations(
  mercuryAccounts,
  ({ many }) => ({
    transactions: many(mercuryTransactions),
  })
);

export const mercuryTransactionsRelations = relations(
  mercuryTransactions,
  ({ one }) => ({
    account: one(mercuryAccounts, {
      fields: [mercuryTransactions.accountId],
      references: [mercuryAccounts.id],
    }),
  })
);
