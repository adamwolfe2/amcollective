import {
  pgTable,
  uuid,
  varchar,
  text,
  boolean,
  timestamp,
  integer,
  index,
  date,
} from "drizzle-orm/pg-core";
import { pgEnum } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { portfolioProjects } from "./projects";

// ─── Enums ──────────────────────────────────────────────────────────────────

export const accessLevelEnum = pgEnum("access_level", [
  "viewer",
  "collaborator",
  "admin",
]);

export const engagementTypeEnum = pgEnum("engagement_type", [
  "build",
  "retainer",
  "consulting",
  "maintenance",
]);

export const engagementStatusEnum = pgEnum("engagement_status", [
  "discovery",
  "active",
  "paused",
  "completed",
  "cancelled",
]);

export const valuePeriodEnum = pgEnum("value_period", [
  "one_time",
  "monthly",
  "annual",
]);

// ─── Tables ─────────────────────────────────────────────────────────────────

export const clients = pgTable(
  "clients",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: varchar("name", { length: 255 }).notNull(),
    companyName: varchar("company_name", { length: 255 }),
    email: varchar("email", { length: 255 }),
    phone: varchar("phone", { length: 50 }),
    website: varchar("website", { length: 500 }),
    clerkUserId: varchar("clerk_user_id", { length: 255 }),
    portalAccess: boolean("portal_access").default(false).notNull(),
    accessLevel: accessLevelEnum("access_level").default("viewer").notNull(),
    notes: text("notes"),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { mode: "date" })
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    index("clients_email_idx").on(table.email),
    index("clients_clerk_user_id_idx").on(table.clerkUserId),
    index("clients_created_at_idx").on(table.createdAt),
  ]
);

export const clientProjects = pgTable(
  "client_projects",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    clientId: uuid("client_id")
      .notNull()
      .references(() => clients.id, { onDelete: "cascade" }),
    projectId: uuid("project_id")
      .notNull()
      .references(() => portfolioProjects.id, { onDelete: "cascade" }),
    role: varchar("role", { length: 100 }),
    startDate: date("start_date", { mode: "date" }),
    endDate: date("end_date", { mode: "date" }),
    status: varchar("status", { length: 50 }),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
  },
  (table) => [
    index("client_projects_client_id_idx").on(table.clientId),
    index("client_projects_project_id_idx").on(table.projectId),
    index("client_projects_status_idx").on(table.status),
  ]
);

export const engagements = pgTable(
  "engagements",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    clientId: uuid("client_id")
      .notNull()
      .references(() => clients.id, { onDelete: "cascade" }),
    projectId: uuid("project_id").references(() => portfolioProjects.id, {
      onDelete: "set null",
    }),
    title: varchar("title", { length: 255 }).notNull(),
    description: text("description"),
    type: engagementTypeEnum("type").notNull(),
    status: engagementStatusEnum("status").default("discovery").notNull(),
    startDate: date("start_date", { mode: "date" }),
    endDate: date("end_date", { mode: "date" }),
    value: integer("value"),
    valuePeriod: valuePeriodEnum("value_period"),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { mode: "date" })
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    index("engagements_client_id_idx").on(table.clientId),
    index("engagements_project_id_idx").on(table.projectId),
    index("engagements_status_idx").on(table.status),
    index("engagements_created_at_idx").on(table.createdAt),
  ]
);

// ─── Relations ──────────────────────────────────────────────────────────────

export const clientsRelations = relations(clients, ({ many }) => ({
  clientProjects: many(clientProjects),
  engagements: many(engagements),
}));

export const clientProjectsRelations = relations(
  clientProjects,
  ({ one }) => ({
    client: one(clients, {
      fields: [clientProjects.clientId],
      references: [clients.id],
    }),
    project: one(portfolioProjects, {
      fields: [clientProjects.projectId],
      references: [portfolioProjects.id],
    }),
  })
);

export const engagementsRelations = relations(engagements, ({ one }) => ({
  client: one(clients, {
    fields: [engagements.clientId],
    references: [clients.id],
  }),
  project: one(portfolioProjects, {
    fields: [engagements.projectId],
    references: [portfolioProjects.id],
  }),
}));
