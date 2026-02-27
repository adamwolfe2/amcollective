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
import { portfolioProjects, teamMembers } from "./projects";
import { clients } from "./crm";

// ─── Enums ──────────────────────────────────────────────────────────────────

export const taskStatusEnum = pgEnum("task_status", [
  "todo",
  "in_progress",
  "done",
]);

export const taskPriorityEnum = pgEnum("task_priority", [
  "high",
  "medium",
  "low",
]);

export const taskSourceEnum = pgEnum("task_source", [
  "manual",
  "linear",
  "voice",
  "webhook",
]);

export const messageDirectionEnum = pgEnum("message_direction", [
  "inbound",
  "outbound",
]);

export const messageChannelEnum = pgEnum("message_channel", [
  "email",
  "sms",
  "blooio",
  "slack",
]);

export const alertTypeEnum = pgEnum("alert_type", [
  "error_spike",
  "cost_anomaly",
  "build_fail",
  "health_drop",
]);

export const alertSeverityEnum = pgEnum("alert_severity", [
  "info",
  "warning",
  "critical",
]);

// ─── Tables ─────────────────────────────────────────────────────────────────

export const tasks = pgTable(
  "tasks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    title: varchar("title", { length: 500 }).notNull(),
    description: text("description"),
    status: taskStatusEnum("status").default("todo").notNull(),
    priority: taskPriorityEnum("priority").default("medium").notNull(),
    dueDate: date("due_date", { mode: "date" }),
    assigneeId: uuid("assignee_id").references(() => teamMembers.id, {
      onDelete: "set null",
    }),
    projectId: uuid("project_id").references(() => portfolioProjects.id, {
      onDelete: "set null",
    }),
    clientId: uuid("client_id").references(() => clients.id, {
      onDelete: "set null",
    }),
    source: taskSourceEnum("source").default("manual").notNull(),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { mode: "date" })
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    index("tasks_assignee_id_idx").on(table.assigneeId),
    index("tasks_project_id_idx").on(table.projectId),
    index("tasks_client_id_idx").on(table.clientId),
    index("tasks_status_idx").on(table.status),
    index("tasks_priority_idx").on(table.priority),
    index("tasks_created_at_idx").on(table.createdAt),
  ]
);

export const messages = pgTable(
  "messages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    threadId: varchar("thread_id", { length: 255 }),
    direction: messageDirectionEnum("direction").notNull(),
    channel: messageChannelEnum("channel").notNull(),
    from: varchar("from", { length: 255 }).notNull(),
    to: varchar("to", { length: 255 }).notNull(),
    subject: varchar("subject", { length: 500 }),
    body: text("body"),
    metadata: jsonb("metadata"),
    projectId: uuid("project_id").references(() => portfolioProjects.id, {
      onDelete: "set null",
    }),
    clientId: uuid("client_id").references(() => clients.id, {
      onDelete: "set null",
    }),
    isRead: boolean("is_read").default(false).notNull(),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
  },
  (table) => [
    index("messages_thread_id_idx").on(table.threadId),
    index("messages_project_id_idx").on(table.projectId),
    index("messages_client_id_idx").on(table.clientId),
    index("messages_channel_idx").on(table.channel),
    index("messages_created_at_idx").on(table.createdAt),
  ]
);

export const alerts = pgTable(
  "alerts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id").references(() => portfolioProjects.id, {
      onDelete: "set null",
    }),
    type: alertTypeEnum("type").notNull(),
    severity: alertSeverityEnum("severity").default("info").notNull(),
    title: varchar("title", { length: 500 }).notNull(),
    message: text("message"),
    metadata: jsonb("metadata"),
    isResolved: boolean("is_resolved").default(false).notNull(),
    resolvedAt: timestamp("resolved_at", { mode: "date" }),
    resolvedBy: varchar("resolved_by", { length: 255 }),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
  },
  (table) => [
    index("alerts_project_id_idx").on(table.projectId),
    index("alerts_type_idx").on(table.type),
    index("alerts_severity_idx").on(table.severity),
    index("alerts_is_resolved_idx").on(table.isResolved),
    index("alerts_created_at_idx").on(table.createdAt),
  ]
);

// ─── Relations ──────────────────────────────────────────────────────────────

export const tasksRelations = relations(tasks, ({ one }) => ({
  assignee: one(teamMembers, {
    fields: [tasks.assigneeId],
    references: [teamMembers.id],
  }),
  project: one(portfolioProjects, {
    fields: [tasks.projectId],
    references: [portfolioProjects.id],
  }),
  client: one(clients, {
    fields: [tasks.clientId],
    references: [clients.id],
  }),
}));

export const messagesRelations = relations(messages, ({ one }) => ({
  project: one(portfolioProjects, {
    fields: [messages.projectId],
    references: [portfolioProjects.id],
  }),
  client: one(clients, {
    fields: [messages.clientId],
    references: [clients.id],
  }),
}));

export const alertsRelations = relations(alerts, ({ one }) => ({
  project: one(portfolioProjects, {
    fields: [alerts.projectId],
    references: [portfolioProjects.id],
  }),
}));
