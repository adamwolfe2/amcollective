import {
  pgTable,
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
import { pgEnum } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { portfolioProjects } from "./projects";

// ─── Enums ──────────────────────────────────────────────────────────────────

export const actorTypeEnum = pgEnum("actor_type", [
  "user",
  "system",
  "agent",
]);

export const notificationTypeEnum = pgEnum("notification_type", [
  "invoice_paid",
  "invoice_overdue",
  "client_onboarded",
  "system_alert",
  "report_ready",
  "task_assigned",
  "health_warning",
  "churn_alert",
  "cost_anomaly",
  "general",
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

export const webhookDeliveries = pgTable(
  "webhook_deliveries",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    registrationId: uuid("registration_id")
      .notNull()
      .references(() => webhookRegistrations.id, { onDelete: "cascade" }),
    eventType: varchar("event_type", { length: 255 }).notNull(),
    payload: jsonb("payload").notNull(),
    signature: varchar("signature", { length: 255 }),
    httpStatus: integer("http_status"),
    responseBody: text("response_body"),
    error: text("error"),
    attempts: integer("attempts").notNull().default(0),
    succeededAt: timestamp("succeeded_at", { mode: "date" }),
    failedAt: timestamp("failed_at", { mode: "date" }),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
  },
  (table) => [
    index("webhook_deliveries_registration_id_idx").on(table.registrationId),
    index("webhook_deliveries_event_type_idx").on(table.eventType),
    index("webhook_deliveries_created_at_idx").on(table.createdAt),
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

export const webhookEvents = pgTable(
  "webhook_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    source: varchar("source", { length: 50 }).notNull(), // "stripe", "vercel", "clerk", "project"
    externalId: varchar("external_id", { length: 255 }).notNull(), // e.g. evt_xxx from Stripe
    eventType: varchar("event_type", { length: 255 }).notNull(),
    payload: jsonb("payload"),
    processedAt: timestamp("processed_at", { mode: "date" }),
    error: text("error"),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
  },
  (table) => [
    index("webhook_events_source_idx").on(table.source),
    index("webhook_events_external_id_idx").on(table.externalId),
    index("webhook_events_created_at_idx").on(table.createdAt),
  ]
);

export const notifications = pgTable(
  "notifications",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: varchar("user_id", { length: 255 }).notNull(), // Clerk user ID
    type: notificationTypeEnum("type").default("general").notNull(),
    title: varchar("title", { length: 500 }).notNull(),
    message: text("message"),
    link: varchar("link", { length: 1000 }), // optional URL to navigate to
    isRead: boolean("is_read").default(false).notNull(),
    readAt: timestamp("read_at", { mode: "date" }),
    metadata: jsonb("metadata"),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
  },
  (table) => [
    index("notifications_user_id_idx").on(table.userId),
    index("notifications_is_read_idx").on(table.isRead),
    index("notifications_type_idx").on(table.type),
    index("notifications_created_at_idx").on(table.createdAt),
    index("notifications_user_unread_idx").on(table.userId, table.isRead),
  ]
);

// ─── Presence ───────────────────────────────────────────────────────────────

export const userPresence = pgTable(
  "user_presence",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: varchar("user_id", { length: 255 }).notNull().unique(),
    userName: varchar("user_name", { length: 255 }),
    userImageUrl: text("user_image_url"),
    status: varchar("status", { length: 20 }).default("online").notNull(),
    currentPage: varchar("current_page", { length: 500 }),
    lastHeartbeat: timestamp("last_heartbeat", { mode: "date" })
      .defaultNow()
      .notNull(),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
  },
  (table) => [
    index("user_presence_user_id_idx").on(table.userId),
    index("user_presence_heartbeat_idx").on(table.lastHeartbeat),
  ]
);

// ─── Relations ──────────────────────────────────────────────────────────────

export const webhookRegistrationsRelations = relations(
  webhookRegistrations,
  ({ one, many }) => ({
    project: one(portfolioProjects, {
      fields: [webhookRegistrations.projectId],
      references: [portfolioProjects.id],
    }),
    deliveries: many(webhookDeliveries),
  })
);

export const webhookDeliveriesRelations = relations(
  webhookDeliveries,
  ({ one }) => ({
    registration: one(webhookRegistrations, {
      fields: [webhookDeliveries.registrationId],
      references: [webhookRegistrations.id],
    }),
  })
);

export const domainsRelations = relations(domains, ({ one }) => ({
  project: one(portfolioProjects, {
    fields: [domains.projectId],
    references: [portfolioProjects.id],
  }),
}));
