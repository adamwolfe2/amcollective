import {
  pgTable,
  uuid,
  varchar,
  text,
  boolean,
  timestamp,
  index,
  jsonb,
  date,
} from "drizzle-orm/pg-core";
import { pgEnum } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { portfolioProjects } from "./projects";

// ─── Enums ──────────────────────────────────────────────────────────────────

export const actorTypeEnum = pgEnum("actor_type", [
  "user",
  "system",
  "agent",
]);

export const sslStatusEnum = pgEnum("ssl_status", [
  "active",
  "pending",
  "expired",
  "error",
]);

// ─── Tables ─────────────────────────────────────────────────────────────────

export const auditLogs = pgTable(
  "audit_logs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    actorId: varchar("actor_id", { length: 255 }).notNull(),
    actorType: actorTypeEnum("actor_type").notNull(),
    action: varchar("action", { length: 255 }).notNull(),
    entityType: varchar("entity_type", { length: 100 }).notNull(),
    entityId: varchar("entity_id", { length: 255 }).notNull(),
    metadata: jsonb("metadata"),
    ipAddress: varchar("ip_address", { length: 45 }),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
  },
  (table) => [
    index("audit_logs_actor_id_idx").on(table.actorId),
    index("audit_logs_actor_type_idx").on(table.actorType),
    index("audit_logs_entity_type_idx").on(table.entityType),
    index("audit_logs_entity_id_idx").on(table.entityId),
    index("audit_logs_action_idx").on(table.action),
    index("audit_logs_created_at_idx").on(table.createdAt),
  ]
);

export const webhookRegistrations = pgTable(
  "webhook_registrations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id").references(() => portfolioProjects.id, {
      onDelete: "set null",
    }),
    endpointUrl: varchar("endpoint_url", { length: 500 }).notNull(),
    secret: varchar("secret", { length: 255 }).notNull(),
    events: jsonb("events"),
    isActive: boolean("is_active").default(true).notNull(),
    lastPingAt: timestamp("last_ping_at", { mode: "date" }),
    lastFailureAt: timestamp("last_failure_at", { mode: "date" }),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
  },
  (table) => [
    index("webhook_registrations_project_id_idx").on(table.projectId),
    index("webhook_registrations_is_active_idx").on(table.isActive),
    index("webhook_registrations_created_at_idx").on(table.createdAt),
  ]
);

export const domains = pgTable(
  "domains",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id").references(() => portfolioProjects.id, {
      onDelete: "set null",
    }),
    name: varchar("name", { length: 255 }).notNull(),
    registrar: varchar("registrar", { length: 100 }),
    expiresAt: date("expires_at", { mode: "date" }),
    autoRenew: boolean("auto_renew").default(true).notNull(),
    sslStatus: sslStatusEnum("ssl_status"),
    dnsRecords: jsonb("dns_records"),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { mode: "date" })
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    index("domains_project_id_idx").on(table.projectId),
    index("domains_name_idx").on(table.name),
    index("domains_created_at_idx").on(table.createdAt),
  ]
);

// ─── Relations ──────────────────────────────────────────────────────────────

export const webhookRegistrationsRelations = relations(
  webhookRegistrations,
  ({ one }) => ({
    project: one(portfolioProjects, {
      fields: [webhookRegistrations.projectId],
      references: [portfolioProjects.id],
    }),
  })
);

export const domainsRelations = relations(domains, ({ one }) => ({
  project: one(portfolioProjects, {
    fields: [domains.projectId],
    references: [portfolioProjects.id],
  }),
}));
