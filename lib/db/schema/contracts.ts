/**
 * Contracts Schema -- auto-generated from approved proposals, client e-signing.
 */

import {
  pgTable,
  pgEnum,
  uuid,
  text,
  integer,
  timestamp,
  date,
  boolean,
  jsonb,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { clients } from "./crm";
import { proposals } from "./proposals";
import { invoices } from "./billing";
import { companyTagEnum } from "./costs";

// -- Enums --

export const contractStatusEnum = pgEnum("contract_status", [
  "draft",
  "sent",
  "viewed",
  "signed",
  "countersigned",
  "active",
  "expired",
  "terminated",
]);

// -- Types --

export type ContractSection = {
  title: string;
  content: string;
  isRequired: boolean;
};

// -- Tables --

export const contracts = pgTable(
  "contracts",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    clientId: uuid("client_id")
      .notNull()
      .references(() => clients.id),
    proposalId: uuid("proposal_id").references(() => proposals.id),
    companyTag: companyTagEnum("company_tag")
      .notNull()
      .default("am_collective"),

    contractNumber: text("contract_number").notNull().unique(),
    title: text("title").notNull(),
    status: contractStatusEnum("status").notNull().default("draft"),

    // Contract body
    sections: jsonb("sections").$type<ContractSection[]>(),
    terms: text("terms"),

    // Parties
    clientSignatoryName: text("client_signatory_name"),
    clientSignatoryTitle: text("client_signatory_title"),

    // Value
    totalValue: integer("total_value"), // cents
    startDate: date("start_date"),
    endDate: date("end_date"),

    // Signing
    token: text("token").unique().notNull(),
    sentAt: timestamp("sent_at", { mode: "date" }),
    viewedAt: timestamp("viewed_at", { mode: "date" }),
    signedAt: timestamp("signed_at", { mode: "date" }),
    signatureData: text("signature_data"), // base64 drawn signature
    signerIp: text("signer_ip"),
    signerUserAgent: text("signer_user_agent"),
    countersignedAt: timestamp("countersigned_at", { mode: "date" }),

    // Storage
    pdfUrl: text("pdf_url"),

    // Linked invoice
    invoiceId: uuid("invoice_id").references(() => invoices.id),
    autoInvoiceOnSign: boolean("auto_invoice_on_sign").default(true),

    expiresAt: timestamp("expires_at", { mode: "date" }),

    createdAt: timestamp("created_at", { mode: "date" })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { mode: "date" })
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    index("contracts_client_id_idx").on(table.clientId),
    index("contracts_proposal_id_idx").on(table.proposalId),
    index("contracts_status_idx").on(table.status),
    uniqueIndex("contracts_token_idx").on(table.token),
    index("contracts_created_at_idx").on(table.createdAt),
  ]
);

// -- Relations --

export const contractsRelations = relations(contracts, ({ one }) => ({
  client: one(clients, {
    fields: [contracts.clientId],
    references: [clients.id],
  }),
  proposal: one(proposals, {
    fields: [contracts.proposalId],
    references: [proposals.id],
  }),
  invoice: one(invoices, {
    fields: [contracts.invoiceId],
    references: [invoices.id],
  }),
}));
