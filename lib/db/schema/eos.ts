/**
 * EOS Schema — Rocks, Scorecard, Meetings, EOD Reports
 *
 * Adapted from TaskSpace EOS patterns (~/aimseod/lib/db/schema.sql,
 * ~/aimseod/migrations/1736779200004_scorecard.sql, etc.)
 */

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
  numeric,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { pgEnum } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { portfolioProjects, teamMembers } from "./projects";

// ─── Enums ──────────────────────────────────────────────────────────────────

export const rockStatusEnum = pgEnum("rock_status", [
  "on_track",
  "at_risk",
  "off_track",
  "done",
]);

export const meetingStatusEnum = pgEnum("meeting_status", [
  "scheduled",
  "in_progress",
  "completed",
  "cancelled",
]);

export const targetDirectionEnum = pgEnum("target_direction", [
  "above",
  "below",
  "exact",
]);

// ─── Rocks ──────────────────────────────────────────────────────────────────

export const rocks = pgTable(
  "rocks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    title: varchar("title", { length: 500 }).notNull(),
    description: text("description"),
    ownerId: uuid("owner_id").references(() => teamMembers.id, {
      onDelete: "set null",
    }),
    projectId: uuid("project_id").references(() => portfolioProjects.id, {
      onDelete: "set null",
    }),
    quarter: varchar("quarter", { length: 10 }).notNull(), // e.g. "Q1 2026"
    status: rockStatusEnum("status").default("on_track").notNull(),
    progress: integer("progress").default(0).notNull(), // 0-100
    dueDate: date("due_date", { mode: "date" }),
    completedAt: timestamp("completed_at", { mode: "date" }),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { mode: "date" })
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    index("rocks_owner_id_idx").on(table.ownerId),
    index("rocks_quarter_idx").on(table.quarter),
    index("rocks_status_idx").on(table.status),
    index("rocks_created_at_idx").on(table.createdAt),
  ]
);

// ─── Scorecard ──────────────────────────────────────────────────────────────

export const scorecardMetrics = pgTable(
  "scorecard_metrics",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: varchar("name", { length: 255 }).notNull(),
    description: text("description"),
    ownerId: uuid("owner_id").references(() => teamMembers.id, {
      onDelete: "set null",
    }),
    targetValue: numeric("target_value"),
    targetDirection: targetDirectionEnum("target_direction").default("above"),
    unit: varchar("unit", { length: 50 }),
    frequency: varchar("frequency", { length: 20 }).default("weekly"),
    displayOrder: integer("display_order").default(0),
    isActive: boolean("is_active").default(true).notNull(),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
  },
  (table) => [
    index("scorecard_metrics_owner_id_idx").on(table.ownerId),
    index("scorecard_metrics_active_idx").on(table.isActive),
  ]
);

export const scorecardEntries = pgTable(
  "scorecard_entries",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    metricId: uuid("metric_id")
      .notNull()
      .references(() => scorecardMetrics.id, { onDelete: "cascade" }),
    weekStart: date("week_start", { mode: "date" }).notNull(), // always Monday
    value: numeric("value"),
    notes: text("notes"),
    enteredBy: uuid("entered_by").references(() => teamMembers.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("scorecard_entries_metric_week_idx").on(
      table.metricId,
      table.weekStart
    ),
    index("scorecard_entries_week_idx").on(table.weekStart),
  ]
);

// ─── Meetings ───────────────────────────────────────────────────────────────

export const meetings = pgTable(
  "meetings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    title: varchar("title", { length: 255 }).default("L10 Meeting").notNull(),
    status: meetingStatusEnum("status").default("scheduled").notNull(),
    scheduledAt: timestamp("scheduled_at", { mode: "date" }),
    startedAt: timestamp("started_at", { mode: "date" }),
    endedAt: timestamp("ended_at", { mode: "date" }),
    attendees: jsonb("attendees"), // array of { id, name }
    notes: text("notes"),
    actionItems: jsonb("action_items"), // array of { text, assigneeId, done }
    rating: integer("rating"), // 1-10
    createdBy: uuid("created_by").references(() => teamMembers.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { mode: "date" })
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    index("meetings_status_idx").on(table.status),
    index("meetings_scheduled_at_idx").on(table.scheduledAt),
    index("meetings_created_at_idx").on(table.createdAt),
  ]
);

// ─── EOD Reports ────────────────────────────────────────────────────────────

export const eodReports = pgTable(
  "eod_reports",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    authorId: uuid("author_id")
      .notNull()
      .references(() => teamMembers.id, { onDelete: "cascade" }),
    date: date("date", { mode: "date" }).notNull(),
    tasksCompleted: jsonb("tasks_completed"), // array of { text, projectId? }
    blockers: text("blockers"),
    tomorrowPlan: jsonb("tomorrow_plan"), // array of { text }
    needsEscalation: boolean("needs_escalation").default(false),
    escalationNote: text("escalation_note"),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
  },
  (table) => [
    index("eod_reports_author_id_idx").on(table.authorId),
    index("eod_reports_date_idx").on(table.date),
    uniqueIndex("eod_reports_author_date_idx").on(table.authorId, table.date),
  ]
);

// ─── Relations ──────────────────────────────────────────────────────────────

export const rocksRelations = relations(rocks, ({ one }) => ({
  owner: one(teamMembers, {
    fields: [rocks.ownerId],
    references: [teamMembers.id],
  }),
  project: one(portfolioProjects, {
    fields: [rocks.projectId],
    references: [portfolioProjects.id],
  }),
}));

export const scorecardMetricsRelations = relations(
  scorecardMetrics,
  ({ one, many }) => ({
    owner: one(teamMembers, {
      fields: [scorecardMetrics.ownerId],
      references: [teamMembers.id],
    }),
    entries: many(scorecardEntries),
  })
);

export const scorecardEntriesRelations = relations(
  scorecardEntries,
  ({ one }) => ({
    metric: one(scorecardMetrics, {
      fields: [scorecardEntries.metricId],
      references: [scorecardMetrics.id],
    }),
    enteredByMember: one(teamMembers, {
      fields: [scorecardEntries.enteredBy],
      references: [teamMembers.id],
    }),
  })
);

export const meetingsRelations = relations(meetings, ({ one }) => ({
  creator: one(teamMembers, {
    fields: [meetings.createdBy],
    references: [teamMembers.id],
  }),
}));

export const eodReportsRelations = relations(eodReports, ({ one }) => ({
  author: one(teamMembers, {
    fields: [eodReports.authorId],
    references: [teamMembers.id],
  }),
}));
