import {
  pgTable,
  uuid,
  varchar,
  text,
  boolean,
  timestamp,
  integer,
  index,
  numeric,
  date,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { pgEnum } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";

// ─── Enums ──────────────────────────────────────────────────────────────────

export const projectStatusEnum = pgEnum("project_status", [
  "active",
  "paused",
  "archived",
]);

export const teamRoleEnum = pgEnum("team_role", [
  "owner",
  "admin",
  "member",
]);

// ─── Tables ─────────────────────────────────────────────────────────────────

export const portfolioProjects = pgTable(
  "portfolio_projects",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: varchar("name", { length: 255 }).notNull(),
    slug: varchar("slug", { length: 255 }).notNull(),
    domain: varchar("domain", { length: 255 }),
    vercelProjectId: varchar("vercel_project_id", { length: 255 }),
    posthogProjectId: varchar("posthog_project_id", { length: 255 }),
    posthogApiKey: varchar("posthog_api_key", { length: 255 }),
    githubRepo: varchar("github_repo", { length: 255 }),
    status: projectStatusEnum("status").default("active").notNull(),
    healthScore: integer("health_score"),
    // Product lifecycle metadata
    launchDate: timestamp("launch_date", { mode: "date" }),
    productStage: varchar("product_stage", { length: 30 }),
    // "idea" | "building" | "beta" | "launched" | "scaling" | "mature"
    description: text("description"),
    targetMarket: varchar("target_market", { length: 200 }),
    monthlyGoalCents: integer("monthly_goal_cents"),
    // Materialized sprint metrics (updated by sync-project-metrics Inngest job)
    openTaskCount: integer("open_task_count").notNull().default(0),
    last30dCompletionRate: integer("last_30d_completion_rate").notNull().default(0),
    velocityLabel: varchar("velocity_label", { length: 50 }),
    metricsLastUpdatedAt: timestamp("metrics_last_updated_at", { mode: "date" }),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { mode: "date" })
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    uniqueIndex("portfolio_projects_slug_idx").on(table.slug),
    index("portfolio_projects_status_idx").on(table.status),
    index("portfolio_projects_created_at_idx").on(table.createdAt),
  ]
);

export const teamMembers = pgTable(
  "team_members",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: varchar("name", { length: 255 }).notNull(),
    email: varchar("email", { length: 255 }).notNull(),
    clerkUserId: varchar("clerk_user_id", { length: 255 }),
    role: teamRoleEnum("role").default("member").notNull(),
    title: varchar("title", { length: 255 }),
    avatarUrl: varchar("avatar_url", { length: 500 }),
    isActive: boolean("is_active").default(true).notNull(),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { mode: "date" })
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    index("team_members_email_idx").on(table.email),
    index("team_members_clerk_user_id_idx").on(table.clerkUserId),
    index("team_members_created_at_idx").on(table.createdAt),
  ]
);

export const teamAssignments = pgTable(
  "team_assignments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    teamMemberId: uuid("team_member_id")
      .notNull()
      .references(() => teamMembers.id, { onDelete: "cascade" }),
    projectId: uuid("project_id")
      .notNull()
      .references(() => portfolioProjects.id, { onDelete: "cascade" }),
    role: varchar("role", { length: 100 }),
    hoursPerWeek: numeric("hours_per_week"),
    startDate: date("start_date", { mode: "date" }),
    endDate: date("end_date", { mode: "date" }),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
  },
  (table) => [
    index("team_assignments_team_member_id_idx").on(table.teamMemberId),
    index("team_assignments_project_id_idx").on(table.projectId),
  ]
);

// ─── Relations ──────────────────────────────────────────────────────────────

export const portfolioProjectsRelations = relations(
  portfolioProjects,
  ({ many }) => ({
    teamAssignments: many(teamAssignments),
  })
);

export const teamMembersRelations = relations(teamMembers, ({ many }) => ({
  teamAssignments: many(teamAssignments),
}));

export const teamAssignmentsRelations = relations(
  teamAssignments,
  ({ one }) => ({
    teamMember: one(teamMembers, {
      fields: [teamAssignments.teamMemberId],
      references: [teamMembers.id],
    }),
    project: one(portfolioProjects, {
      fields: [teamAssignments.projectId],
      references: [portfolioProjects.id],
    }),
  })
);
