import {
  pgTable,
  pgEnum,
  uuid,
  varchar,
  text,
  boolean,
  timestamp,
  integer,
  index,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { clients } from "./crm";
import { companyTagEnum } from "./costs";

// ─── Enums ──────────────────────────────────────────────────────────────────

export const docTypeEnum = pgEnum("doc_type", [
  "contract",
  "proposal",
  "note",
  "sop",
  "invoice",
  "brief",
  "other",
]);

// ─── Tables ─────────────────────────────────────────────────────────────────

export const documents = pgTable(
  "documents",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyTag: companyTagEnum("company_tag").notNull().default("am_collective"),
    clientId: uuid("client_id").references(() => clients.id, {
      onDelete: "set null",
    }),
    title: varchar("title", { length: 500 }).notNull(),
    content: text("content"), // rich text as HTML
    fileUrl: text("file_url"),
    fileName: text("file_name"),
    fileMimeType: varchar("file_mime_type", { length: 100 }),
    fileSizeBytes: integer("file_size_bytes"),
    docType: docTypeEnum("doc_type").notNull().default("note"),
    isClientVisible: boolean("is_client_visible").notNull().default(false),
    createdById: varchar("created_by_id", { length: 255 }).notNull(),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { mode: "date" })
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    index("documents_company_tag_idx").on(table.companyTag),
    index("documents_client_id_idx").on(table.clientId),
    index("documents_doc_type_idx").on(table.docType),
    index("documents_created_by_idx").on(table.createdById),
    index("documents_created_at_idx").on(table.createdAt),
  ]
);

export const documentTags = pgTable(
  "document_tags",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    documentId: uuid("document_id")
      .notNull()
      .references(() => documents.id, { onDelete: "cascade" }),
    tag: varchar("tag", { length: 100 }).notNull(),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
  },
  (table) => [
    index("document_tags_document_id_idx").on(table.documentId),
    index("document_tags_tag_idx").on(table.tag),
  ]
);

// ─── Relations ──────────────────────────────────────────────────────────────

export const documentsRelations = relations(documents, ({ one, many }) => ({
  client: one(clients, {
    fields: [documents.clientId],
    references: [clients.id],
  }),
  tags: many(documentTags),
}));

export const documentTagsRelations = relations(documentTags, ({ one }) => ({
  document: one(documents, {
    fields: [documentTags.documentId],
    references: [documents.id],
  }),
}));
