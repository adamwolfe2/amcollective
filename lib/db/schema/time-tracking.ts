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
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { clients } from "./crm";
import { portfolioProjects, teamMembers } from "./projects";
import { invoices } from "./billing";
import { companyTagEnum } from "./costs";

// ─── Tables ─────────────────────────────────────────────────────────────────

export const timeEntries = pgTable(
  "time_entries",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    clientId: uuid("client_id")
      .notNull()
      .references(() => clients.id, { onDelete: "cascade" }),
    projectId: uuid("project_id").references(() => portfolioProjects.id, {
      onDelete: "set null",
    }),
    teamMemberId: uuid("team_member_id").references(() => teamMembers.id, {
      onDelete: "set null",
    }),
    date: date("date", { mode: "date" }).notNull(),
    hours: numeric("hours", { precision: 5, scale: 2 }).notNull(), // e.g. 1.50
    description: text("description"),
    billable: boolean("billable").default(true).notNull(),
    hourlyRate: integer("hourly_rate"), // cents — null = use client/project default
    invoiceId: uuid("invoice_id").references(() => invoices.id, {
      onDelete: "set null",
    }),
    companyTag: companyTagEnum("company_tag").default("am_collective"),
    createdBy: varchar("created_by", { length: 255 }), // Clerk user ID
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { mode: "date" })
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    index("time_entries_client_id_idx").on(table.clientId),
    index("time_entries_project_id_idx").on(table.projectId),
    index("time_entries_team_member_id_idx").on(table.teamMemberId),
    index("time_entries_date_idx").on(table.date),
    index("time_entries_invoice_id_idx").on(table.invoiceId),
    index("time_entries_billable_idx").on(table.billable),
    index("time_entries_created_at_idx").on(table.createdAt),
  ]
);

// ─── Relations ──────────────────────────────────────────────────────────────

export const timeEntriesRelations = relations(timeEntries, ({ one }) => ({
  client: one(clients, {
    fields: [timeEntries.clientId],
    references: [clients.id],
  }),
  project: one(portfolioProjects, {
    fields: [timeEntries.projectId],
    references: [portfolioProjects.id],
  }),
  teamMember: one(teamMembers, {
    fields: [timeEntries.teamMemberId],
    references: [teamMembers.id],
  }),
  invoice: one(invoices, {
    fields: [timeEntries.invoiceId],
    references: [invoices.id],
  }),
}));
