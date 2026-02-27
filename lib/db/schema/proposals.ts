/**
 * Proposals Schema — Scoped proposals sent to clients for review/approval.
 */

import {
  pgTable,
  pgEnum,
  uuid,
  text,
  integer,
  timestamp,
  date,
  jsonb,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { clients } from "./crm";
import { companyTagEnum } from "./costs";
import type { LineItem } from "@/lib/invoices/email";

// ─── Enums ──────────────────────────────────────────────────────────────────

export const proposalStatusEnum = pgEnum("proposal_status", [
  "draft",
  "sent",
  "viewed",
  "approved",
  "rejected",
  "expired",
]);

// ─── Types ──────────────────────────────────────────────────────────────────

export type ProposalSection = {
  title: string;
  content: string;
};

// ─── Tables ─────────────────────────────────────────────────────────────────

export const proposals = pgTable(
  "proposals",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    clientId: uuid("client_id")
      .notNull()
      .references(() => clients.id),
    companyTag: companyTagEnum("company_tag").notNull().default("am_collective"),

    title: text("title").notNull(),
    proposalNumber: text("proposal_number").notNull().unique(),
    status: proposalStatusEnum("status").notNull().default("draft"),

    // Content
    summary: text("summary"),
    scope: jsonb("scope").$type<ProposalSection[]>(),
    deliverables: jsonb("deliverables").$type<string[]>(),
    timeline: text("timeline"),

    // Pricing
    lineItems: jsonb("line_items").$type<LineItem[]>(),
    subtotal: integer("subtotal"),
    taxRate: integer("tax_rate").default(0),
    taxAmount: integer("tax_amount").default(0),
    total: integer("total"),
    paymentTerms: text("payment_terms").default(
      "50% upfront, 50% on delivery"
    ),

    // Validity
    validUntil: date("valid_until"),

    // Tracking
    sentAt: timestamp("sent_at", { mode: "date" }),
    viewedAt: timestamp("viewed_at", { mode: "date" }),
    viewCount: integer("view_count").default(0),
    approvedAt: timestamp("approved_at", { mode: "date" }),
    rejectedAt: timestamp("rejected_at", { mode: "date" }),
    rejectionReason: text("rejection_reason"),

    // After approval
    convertedToInvoiceId: uuid("converted_to_invoice_id"),
    convertedToProjectId: uuid("converted_to_project_id"),

    // Notes
    internalNotes: text("internal_notes"),

    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { mode: "date" })
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    index("proposals_client_id_idx").on(table.clientId),
    index("proposals_status_idx").on(table.status),
    uniqueIndex("proposals_number_idx").on(table.proposalNumber),
    index("proposals_created_at_idx").on(table.createdAt),
  ]
);

// ─── Relations ──────────────────────────────────────────────────────────────

export const proposalsRelations = relations(proposals, ({ one }) => ({
  client: one(clients, {
    fields: [proposals.clientId],
    references: [clients.id],
  }),
}));
