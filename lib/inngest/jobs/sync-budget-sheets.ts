/**
 * Inngest Job — Sync Budget Sheets
 *
 * Pulls every active row from budget_sheet_sources, fetches the Google Sheet
 * via Composio, and re-mirrors the rows into budget_sheet_rows. Computes
 * category rollups into budget_category_snapshots.
 *
 * Cron: every 6 hours. Also responds to `budget-sheets/sync.requested` for
 * manual triggers (e.g., from a /budget refresh button).
 *
 * Privacy: rows are written with their owner_clerk_id intact via the source
 * row. Display-time gating is enforced at the route layer.
 *
 * Sync direction: SHEETS → DB only. Adam edits the sheet on the go; we
 * snapshot. No writes back to Sheets — this avoids accidental data loss.
 */

import { inngest } from "../client";
import { captureError } from "@/lib/errors";
import { db } from "@/lib/db";
import {
  budgetSheetSources,
  budgetSheetRows,
  budgetCategorySnapshots,
} from "@/lib/db/schema";
import { fetchSheet, isConfigured } from "@/lib/connectors/google-sheets";
import { and, eq } from "drizzle-orm";

interface SyncSummary {
  sourceId: string;
  label: string;
  tabsSynced: number;
  rowsSynced: number;
  categoriesRolled: number;
  errors: Record<string, string>;
}

async function syncOne(source: {
  id: string;
  label: string;
  sheetId: string;
  tabsToSync: string[] | null;
  composioUserId: string | null;
  composioAccountId: string | null;
}): Promise<SyncSummary> {
  if (!source.composioUserId || !source.composioAccountId) {
    await db
      .update(budgetSheetSources)
      .set({
        lastSyncError:
          "Missing composioUserId/composioAccountId — connect Google Sheets in /settings/integrations",
      })
      .where(eq(budgetSheetSources.id, source.id));
    return {
      sourceId: source.id,
      label: source.label,
      tabsSynced: 0,
      rowsSynced: 0,
      categoriesRolled: 0,
      errors: { _config: "Missing Composio link" },
    };
  }

  const result = await fetchSheet({
    sheetId: source.sheetId,
    composioUserId: source.composioUserId,
    composioAccountId: source.composioAccountId,
    tabsToSync: source.tabsToSync ?? undefined,
  });

  let rowsSynced = 0;
  let categoriesRolled = 0;

  for (const tab of result.tabs) {
    // Wipe + refill rows for this (source, tab). Idempotent — entire tab
    // re-mirrored each sync. Edits in the sheet propagate immediately.
    await db
      .delete(budgetSheetRows)
      .where(
        and(
          eq(budgetSheetRows.sourceId, source.id),
          eq(budgetSheetRows.tab, tab.tab)
        )
      );

    if (tab.rows.length > 0) {
      const inserts = tab.rows.map((r) => ({
        sourceId: source.id,
        tab: tab.tab,
        rowIndex: r.rowIndex,
        rowData: r.rowData,
        category: r.category,
        description: r.description,
        amountCents: r.amountCents,
        rowDate: r.rowDate,
      }));
      // Insert in chunks of 200 to keep payload sizes reasonable
      for (let i = 0; i < inserts.length; i += 200) {
        await db.insert(budgetSheetRows).values(inserts.slice(i, i + 200));
      }
      rowsSynced += inserts.length;
    }

    // Compute category rollups for this tab
    const rollupMap = new Map<string, { rowCount: number; totalCents: number }>();
    for (const r of tab.rows) {
      const cat = r.category?.trim().toLowerCase() ?? "uncategorized";
      const cur = rollupMap.get(cat) ?? { rowCount: 0, totalCents: 0 };
      cur.rowCount += 1;
      cur.totalCents += r.amountCents ?? 0;
      rollupMap.set(cat, cur);
    }

    // Snapshot rollups (append-only — keep history). Ditch older snapshots
    // for this (source,tab) older than 90 days to bound the table.
    if (rollupMap.size > 0) {
      const snapshotInserts = Array.from(rollupMap.entries()).map(
        ([category, agg]) => ({
          sourceId: source.id,
          tab: tab.tab,
          category,
          rowCount: agg.rowCount,
          totalCents: agg.totalCents,
        })
      );
      await db.insert(budgetCategorySnapshots).values(snapshotInserts);
      categoriesRolled += snapshotInserts.length;
    }
  }

  await db
    .update(budgetSheetSources)
    .set({
      lastSyncedAt: new Date(),
      lastSyncError:
        Object.keys(result.errors).length > 0 ? JSON.stringify(result.errors) : null,
    })
    .where(eq(budgetSheetSources.id, source.id));

  return {
    sourceId: source.id,
    label: source.label,
    tabsSynced: result.tabs.length,
    rowsSynced,
    categoriesRolled,
    errors: result.errors,
  };
}

export const syncBudgetSheets = inngest.createFunction(
  {
    id: "sync-budget-sheets",
    name: "Sync Budget Sheets",
    retries: 2,
    concurrency: { limit: 1 }, // serialize to avoid hammering Composio
    onFailure: async ({ error }) => {
      captureError(error, {
        tags: { source: "inngest", job: "sync-budget-sheets" },
        level: "warning",
      });
    },
  },
  [
    { cron: "0 */6 * * *" }, // every 6 hours
    { event: "budget-sheets/sync.requested" }, // manual trigger
  ],
  async ({ step }) => {
    if (!isConfigured()) {
      return { skipped: true, reason: "Composio not configured" };
    }

    const sources = await step.run("load-sources", async () => {
      return db
        .select({
          id: budgetSheetSources.id,
          label: budgetSheetSources.label,
          sheetId: budgetSheetSources.sheetId,
          tabsToSync: budgetSheetSources.tabsToSync,
          composioUserId: budgetSheetSources.composioUserId,
          composioAccountId: budgetSheetSources.composioAccountId,
        })
        .from(budgetSheetSources)
        .where(eq(budgetSheetSources.isActive, true));
    });

    if (sources.length === 0) {
      return { skipped: true, reason: "No active budget sheet sources registered" };
    }

    const summaries: SyncSummary[] = [];
    for (const source of sources) {
      const summary = await step.run(`sync-${source.id}`, async () => {
        try {
          return await syncOne(source);
        } catch (err) {
          await db
            .update(budgetSheetSources)
            .set({
              lastSyncError: err instanceof Error ? err.message : String(err),
            })
            .where(eq(budgetSheetSources.id, source.id));
          return {
            sourceId: source.id,
            label: source.label,
            tabsSynced: 0,
            rowsSynced: 0,
            categoriesRolled: 0,
            errors: { _exception: err instanceof Error ? err.message : String(err) },
          };
        }
      });
      summaries.push(summary);
    }

    return {
      success: true,
      sourceCount: sources.length,
      totalRowsSynced: summaries.reduce((acc, s) => acc + s.rowsSynced, 0),
      summaries,
    };
  }
);
