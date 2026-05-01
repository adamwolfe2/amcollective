/**
 * Budget Schema — Private Google Sheets sync target
 *
 * Mirrors Adam's personal budget tracking sheets into Neon for cross-portfolio
 * visibility. PRIVATE: rows are guarded by the (admin) route group (Clerk
 * owner/admin only). Never exposed via client portal routes.
 *
 * Design:
 *   - budgetSheetSources — registry of sheets to sync (URL, sheet_id, tabs)
 *   - budgetSheetRows    — append-only row snapshots (re-pulled each sync,
 *     rows replaced by sheet+tab+rowIndex composite key)
 *   - budgetCategorySnapshots — rollup totals per (sheet, tab, category)
 *     computed at sync time for fast /command widget queries
 *
 * Sync direction: READ-ONLY from sheets → Neon. Adam edits in the sheet on
 * the go; the cron pulls every 6 hours.
 */

import {
  pgTable,
  uuid,
  varchar,
  text,
  timestamp,
  jsonb,
  integer,
  boolean,
  index,
} from "drizzle-orm/pg-core";

// ─── Sheet sources (which sheets to sync) ────────────────────────────────────

export const budgetSheetSources = pgTable(
  "budget_sheet_sources",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** Display label, e.g. "Personal Budget Q2 2026" */
    label: varchar("label", { length: 255 }).notNull(),
    /** Google Sheets file id (the long string in the URL) */
    sheetId: varchar("sheet_id", { length: 255 }).notNull().unique(),
    /** URL to original sheet for click-through */
    sourceUrl: text("source_url").notNull(),
    /** Which tabs to sync — null = all visible tabs */
    tabsToSync: jsonb("tabs_to_sync").$type<string[]>(),
    /** Composio user_id and connected_account_id for auth */
    composioUserId: varchar("composio_user_id", { length: 255 }),
    composioAccountId: varchar("composio_account_id", { length: 255 }),
    /** Owner Clerk user id — only this user can see the data */
    ownerClerkId: varchar("owner_clerk_id", { length: 255 }).notNull(),
    /** Disable a sheet without deleting the registry row */
    isActive: boolean("is_active").notNull().default(true),
    lastSyncedAt: timestamp("last_synced_at", { mode: "date" }),
    lastSyncError: text("last_sync_error"),
    metadata: jsonb("metadata"),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { mode: "date" })
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    index("budget_sheet_sources_owner_idx").on(table.ownerClerkId),
    index("budget_sheet_sources_active_idx").on(table.isActive),
  ]
);

// ─── Synced rows (mirror of sheet contents) ──────────────────────────────────

export const budgetSheetRows = pgTable(
  "budget_sheet_rows",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sourceId: uuid("source_id")
      .notNull()
      .references(() => budgetSheetSources.id, { onDelete: "cascade" }),
    tab: varchar("tab", { length: 255 }).notNull(),
    rowIndex: integer("row_index").notNull(),
    /** Whole row as { columnName: value }. Column names come from row 1 of the tab. */
    rowData: jsonb("row_data").$type<Record<string, string | number | null>>().notNull(),
    /** Convenience extracted fields (best-effort — not always present) */
    category: varchar("category", { length: 255 }),
    description: text("description"),
    /** Stored as cents to avoid float drift; null if row has no amount column */
    amountCents: integer("amount_cents"),
    /** Date column on the row, if any */
    rowDate: timestamp("row_date", { mode: "date" }),
    syncedAt: timestamp("synced_at", { mode: "date" }).defaultNow().notNull(),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
  },
  (table) => [
    index("budget_sheet_rows_source_tab_idx").on(table.sourceId, table.tab),
    index("budget_sheet_rows_source_row_unique_idx").on(
      table.sourceId,
      table.tab,
      table.rowIndex
    ),
    index("budget_sheet_rows_category_idx").on(table.category),
    index("budget_sheet_rows_row_date_idx").on(table.rowDate),
  ]
);

// ─── Category rollups (computed at sync time) ────────────────────────────────

export const budgetCategorySnapshots = pgTable(
  "budget_category_snapshots",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sourceId: uuid("source_id")
      .notNull()
      .references(() => budgetSheetSources.id, { onDelete: "cascade" }),
    tab: varchar("tab", { length: 255 }).notNull(),
    category: varchar("category", { length: 255 }).notNull(),
    rowCount: integer("row_count").notNull().default(0),
    totalCents: integer("total_cents").notNull().default(0),
    snapshotAt: timestamp("snapshot_at", { mode: "date" }).defaultNow().notNull(),
  },
  (table) => [
    index("budget_category_snapshots_source_idx").on(table.sourceId),
    index("budget_category_snapshots_at_idx").on(table.snapshotAt),
  ]
);
