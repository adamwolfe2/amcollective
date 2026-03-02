/**
 * Sprint Schema — Weekly Sprint Documents
 *
 * Replaces Notion for weekly planning. Each week has a sprint doc with
 * project sections (@mentions), assignees (@mentions), goals, and task checklists.
 *
 * v2: Canonical task identity layer — tasks live in the `tasks` table and are
 * assigned to sprints/sections via `task_sprint_assignments`. Sprint snapshots
 * capture historical completion data per project per sprint.
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
  date,
  jsonb,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { portfolioProjects, teamMembers } from "./projects";
import { tasks } from "./operations";

// ─── Weekly Sprint Document ───────────────────────────────────────────────────

export const weeklySprints = pgTable(
  "weekly_sprints",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    weekOf: date("week_of", { mode: "date" }).notNull(), // Monday of the sprint week
    title: varchar("title", { length: 255 }).notNull(),
    weeklyFocus: varchar("weekly_focus", { length: 255 }),
    topOfMind: text("top_of_mind"), // freeform bullet-point notes
    shareToken: varchar("share_token", { length: 64 }).unique(), // public share link token
    closedAt: timestamp("closed_at", { mode: "date" }), // set when sprint is closed
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { mode: "date" })
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    index("weekly_sprints_week_of_idx").on(table.weekOf),
    index("weekly_sprints_share_token_idx").on(table.shareToken),
  ]
);

// ─── Sprint Sections (per-project groupings) ──────────────────────────────────

export const sprintSections = pgTable(
  "sprint_sections",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sprintId: uuid("sprint_id")
      .notNull()
      .references(() => weeklySprints.id, { onDelete: "cascade" }),
    // @project mention — either a platform project or free-text
    projectId: uuid("project_id").references(() => portfolioProjects.id, {
      onDelete: "set null",
    }),
    projectName: varchar("project_name", { length: 255 }).notNull(),
    // @assignee mention — either a team member or free-text
    assigneeId: uuid("assignee_id").references(() => teamMembers.id, {
      onDelete: "set null",
    }),
    assigneeName: varchar("assignee_name", { length: 255 }),
    goal: text("goal"),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
  },
  (table) => [
    index("sprint_sections_sprint_id_idx").on(table.sprintId),
    index("sprint_sections_sort_order_idx").on(table.sortOrder),
  ]
);

// ─── Sprint Tasks (legacy — kept for backward compat, no new writes) ─────────

export const sprintTasks = pgTable(
  "sprint_tasks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sectionId: uuid("section_id")
      .notNull()
      .references(() => sprintSections.id, { onDelete: "cascade" }),
    content: text("content").notNull(),
    isCompleted: boolean("is_completed").notNull().default(false),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { mode: "date" })
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    index("sprint_tasks_section_id_idx").on(table.sectionId),
    index("sprint_tasks_completed_idx").on(table.isCompleted),
  ]
);

// ─── Task Sprint Assignments (canonical task → sprint/section mapping) ────────

export const taskSprintAssignments = pgTable(
  "task_sprint_assignments",
  {
    taskId: uuid("task_id")
      .notNull()
      .references(() => tasks.id, { onDelete: "cascade" }),
    sprintId: uuid("sprint_id")
      .notNull()
      .references(() => weeklySprints.id, { onDelete: "cascade" }),
    sectionId: uuid("section_id").references(() => sprintSections.id, {
      onDelete: "set null",
    }),
    addedAt: timestamp("added_at", { mode: "date" }).defaultNow().notNull(),
    removedAt: timestamp("removed_at", { mode: "date" }),
    sortOrder: integer("sort_order").notNull().default(0),
  },
  (table) => [
    index("tsa_sprint_id_idx").on(table.sprintId),
    index("tsa_task_id_idx").on(table.taskId),
    index("tsa_section_id_idx").on(table.sectionId),
  ]
  // PRIMARY KEY (task_id, sprint_id) defined in migration DDL
);

// ─── Sprint Snapshots (historical per-project completion snapshots) ────────────

export const sprintSnapshots = pgTable(
  "sprint_snapshots",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sprintId: uuid("sprint_id")
      .notNull()
      .references(() => weeklySprints.id, { onDelete: "cascade" }),
    projectId: uuid("project_id").references(() => portfolioProjects.id, {
      onDelete: "set null",
    }),
    capturedAt: timestamp("captured_at", { mode: "date" }).defaultNow().notNull(),
    totalTasks: integer("total_tasks").notNull().default(0),
    completedTasks: integer("completed_tasks").notNull().default(0),
    completionRate: integer("completion_rate").notNull().default(0),
    openTasksJson: jsonb("open_tasks_json").$type<string[]>().default([]).notNull(),
    velocityLabel: varchar("velocity_label", { length: 50 }),
    locked: boolean("locked").notNull().default(false),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
  },
  (table) => [
    index("ss_sprint_id_idx").on(table.sprintId),
    index("ss_project_id_idx").on(table.projectId),
  ]
);

// ─── Relations ────────────────────────────────────────────────────────────────

export const weeklySprintsRelations = relations(weeklySprints, ({ many }) => ({
  sections: many(sprintSections),
  taskAssignments: many(taskSprintAssignments),
  snapshots: many(sprintSnapshots),
}));

export const sprintSectionsRelations = relations(
  sprintSections,
  ({ one, many }) => ({
    sprint: one(weeklySprints, {
      fields: [sprintSections.sprintId],
      references: [weeklySprints.id],
    }),
    project: one(portfolioProjects, {
      fields: [sprintSections.projectId],
      references: [portfolioProjects.id],
    }),
    assignee: one(teamMembers, {
      fields: [sprintSections.assigneeId],
      references: [teamMembers.id],
    }),
    tasks: many(sprintTasks),
    taskAssignments: many(taskSprintAssignments),
  })
);

export const sprintTasksRelations = relations(sprintTasks, ({ one }) => ({
  section: one(sprintSections, {
    fields: [sprintTasks.sectionId],
    references: [sprintSections.id],
  }),
}));

export const taskSprintAssignmentsRelations = relations(
  taskSprintAssignments,
  ({ one }) => ({
    task: one(tasks, {
      fields: [taskSprintAssignments.taskId],
      references: [tasks.id],
    }),
    sprint: one(weeklySprints, {
      fields: [taskSprintAssignments.sprintId],
      references: [weeklySprints.id],
    }),
    section: one(sprintSections, {
      fields: [taskSprintAssignments.sectionId],
      references: [sprintSections.id],
    }),
  })
);

export const sprintSnapshotsRelations = relations(sprintSnapshots, ({ one }) => ({
  sprint: one(weeklySprints, {
    fields: [sprintSnapshots.sprintId],
    references: [weeklySprints.id],
  }),
  project: one(portfolioProjects, {
    fields: [sprintSnapshots.projectId],
    references: [portfolioProjects.id],
  }),
}));
