/**
 * Companies schema -- relational metadata for the companyTagEnum values.
 * Bridges the enum-based multi-tenant approach to a proper relational model.
 */

import {
  pgTable,
  uuid,
  varchar,
  text,
  timestamp,
  boolean,
  jsonb,
  index,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { companyTagEnum } from "./costs";

// ─── Tables ─────────────────────────────────────────────────────────────────

export const companies = pgTable(
  "companies",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    slug: varchar("slug", { length: 50 }).notNull().unique(),
    name: varchar("name", { length: 200 }).notNull(),
    companyTag: companyTagEnum("company_tag").notNull().unique(),
    description: text("description"),
    domain: varchar("domain", { length: 200 }),
    logoUrl: text("logo_url"),
    primaryColor: varchar("primary_color", { length: 7 }),
    isActive: boolean("is_active").default(true).notNull(),
    settings: jsonb("settings").default({}),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (t) => [
    index("companies_slug_idx").on(t.slug),
    index("companies_tag_idx").on(t.companyTag),
  ]
);

export const companyMembers = pgTable(
  "company_members",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    companyId: uuid("company_id")
      .references(() => companies.id, { onDelete: "cascade" })
      .notNull(),
    userId: varchar("user_id", { length: 200 }).notNull(),
    role: varchar("role", { length: 50 }).default("member").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [
    index("company_members_company_idx").on(t.companyId),
    index("company_members_user_idx").on(t.userId),
  ]
);

// ─── Relations ──────────────────────────────────────────────────────────────

export const companiesRelations = relations(companies, ({ many }) => ({
  members: many(companyMembers),
}));

export const companyMembersRelations = relations(
  companyMembers,
  ({ one }) => ({
    company: one(companies, {
      fields: [companyMembers.companyId],
      references: [companies.id],
    }),
  })
);
