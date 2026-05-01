/**
 * Google Sheets Connector — Private budget sheet read pipe
 *
 * Pulls full sheet contents via Composio's GOOGLESHEETS_BATCH_GET tool, parses
 * the first row as column headers, normalizes amount + category fields into
 * structured columns, and returns ready-to-upsert row records.
 *
 * Auth: Composio googlesheets connection (separate from googlecalendar). Each
 * sheet source row in budget_sheet_sources stores its own composioUserId +
 * composioAccountId so multi-account is supported.
 *
 * Privacy: this connector is consumed only by sync-budget-sheets (Inngest)
 * and the (admin) /budget page. Never exposed via client portal routes.
 */

import { getComposioClient, isComposioConfigured } from "@/lib/integrations/composio";

export function isConfigured(): boolean {
  return isComposioConfigured();
}

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ParsedRow {
  /** 1-indexed row number in the sheet (1 = header, so first data row = 2) */
  rowIndex: number;
  /** Whole row keyed by header name (lowercased, trimmed) */
  rowData: Record<string, string | number | null>;
  category: string | null;
  description: string | null;
  amountCents: number | null;
  rowDate: Date | null;
}

export interface SheetTabContents {
  tab: string;
  /** First row, used as headers (lowercased, trimmed) */
  headers: string[];
  rows: ParsedRow[];
}

export interface SheetFetchResult {
  sheetId: string;
  /** Tabs that were successfully fetched */
  tabs: SheetTabContents[];
  errors: Record<string, string>;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const AMOUNT_KEYS = [
  "amount",
  "total",
  "cost",
  "spend",
  "expense",
  "price",
  "value",
  "debit",
  "credit",
];
const CATEGORY_KEYS = ["category", "type", "bucket", "tag", "label"];
const DESCRIPTION_KEYS = ["description", "note", "notes", "memo", "merchant", "vendor", "item"];
const DATE_KEYS = ["date", "transaction date", "posted", "when"];

function normalizeHeader(h: string): string {
  return h.trim().toLowerCase();
}

function findKey(row: Record<string, unknown>, candidates: string[]): string | null {
  for (const c of candidates) {
    if (Object.prototype.hasOwnProperty.call(row, c)) return c;
  }
  return null;
}

function parseAmountCents(value: unknown): number | null {
  if (value == null || value === "") return null;
  if (typeof value === "number") return Math.round(value * 100);
  const s = String(value).replace(/[$,\s]/g, "").replace(/[()]/g, "-");
  const n = parseFloat(s);
  if (Number.isNaN(n)) return null;
  return Math.round(n * 100);
}

function parseDate(value: unknown): Date | null {
  if (value == null || value === "") return null;
  const s = String(value).trim();
  // Common formats: 2026-04-30, 4/30/2026, 4/30/26
  const d = new Date(s);
  if (!Number.isNaN(d.getTime())) return d;
  return null;
}

function parseRowFromArray(
  rowArr: unknown[],
  headers: string[],
  rowIndex: number
): ParsedRow {
  const rowData: Record<string, string | number | null> = {};
  for (let i = 0; i < headers.length; i++) {
    const cell = rowArr[i];
    const key = headers[i];
    if (cell == null) {
      rowData[key] = null;
    } else if (typeof cell === "number") {
      rowData[key] = cell;
    } else {
      const s = String(cell).trim();
      rowData[key] = s.length > 0 ? s : null;
    }
  }

  const amountKey = findKey(rowData, AMOUNT_KEYS);
  const categoryKey = findKey(rowData, CATEGORY_KEYS);
  const descriptionKey = findKey(rowData, DESCRIPTION_KEYS);
  const dateKey = findKey(rowData, DATE_KEYS);

  return {
    rowIndex,
    rowData,
    category: categoryKey ? (rowData[categoryKey] as string | null) : null,
    description: descriptionKey ? (rowData[descriptionKey] as string | null) : null,
    amountCents: amountKey ? parseAmountCents(rowData[amountKey]) : null,
    rowDate: dateKey ? parseDate(rowData[dateKey]) : null,
  };
}

// ─── Public API ───────────────────────────────────────────────────────────────

export interface FetchSheetParams {
  sheetId: string;
  composioUserId: string;
  composioAccountId: string;
  /** Tab names to pull. If omitted, pulls metadata first to discover tabs. */
  tabsToSync?: string[];
}

/**
 * Fetch a Google Sheet's tabs, parse rows, and return structured content.
 * Errors per-tab are recorded but don't fail the whole fetch.
 */
export async function fetchSheet(
  params: FetchSheetParams
): Promise<SheetFetchResult> {
  if (!isConfigured()) {
    return {
      sheetId: params.sheetId,
      tabs: [],
      errors: { _global: "Composio not configured" },
    };
  }

  const composio = getComposioClient();
  const errors: Record<string, string> = {};
  const tabs: SheetTabContents[] = [];

  // 1. Resolve tabs to sync — fetch sheet metadata if not specified
  let tabsToFetch = params.tabsToSync;
  if (!tabsToFetch || tabsToFetch.length === 0) {
    try {
      const meta = await composio.tools.execute("GOOGLESHEETS_GET_SPREADSHEET_INFO", {
        userId: params.composioUserId,
        connectedAccountId: params.composioAccountId,
        arguments: {
          spreadsheet_id: params.sheetId,
        },
      });
      const data = meta.data as Record<string, unknown> | undefined;
      const sheetMetas = (data?.sheets ?? []) as Record<string, unknown>[];
      tabsToFetch = sheetMetas
        .map((s) => {
          const props = s.properties as Record<string, unknown> | undefined;
          return (props?.title as string | undefined) ?? "";
        })
        .filter((t) => t.length > 0);
    } catch (err) {
      errors._meta = err instanceof Error ? err.message : String(err);
      return { sheetId: params.sheetId, tabs: [], errors };
    }
  }

  // 2. Fetch each tab's values in parallel (capped to avoid Composio rate limits)
  const results = await Promise.allSettled(
    tabsToFetch.map(async (tab) => {
      const range = `${tab}!A1:Z`; // First 26 columns is plenty for budget rows
      const result = await composio.tools.execute("GOOGLESHEETS_BATCH_GET", {
        userId: params.composioUserId,
        connectedAccountId: params.composioAccountId,
        arguments: {
          spreadsheet_id: params.sheetId,
          ranges: [range],
        },
      });
      const data = result.data as Record<string, unknown> | undefined;
      const valueRanges = (data?.valueRanges ?? data?.value_ranges ?? []) as Record<
        string,
        unknown
      >[];
      const values =
        ((valueRanges[0]?.values as unknown[][]) ?? []) as unknown[][];
      if (values.length === 0) {
        return { tab, headers: [] as string[], rows: [] as ParsedRow[] };
      }
      const headerRow = values[0].map((h) => normalizeHeader(String(h ?? "")));
      const dataRows = values.slice(1);
      const rows: ParsedRow[] = dataRows
        .map((rowArr, idx) => parseRowFromArray(rowArr, headerRow, idx + 2))
        // Skip fully empty rows
        .filter((r) => Object.values(r.rowData).some((v) => v !== null && v !== ""));
      return { tab, headers: headerRow, rows };
    })
  );

  for (let i = 0; i < results.length; i++) {
    const r = results[i];
    const tabName = tabsToFetch[i];
    if (r.status === "fulfilled") {
      tabs.push(r.value);
    } else {
      errors[tabName] = r.reason instanceof Error ? r.reason.message : String(r.reason);
    }
  }

  return { sheetId: params.sheetId, tabs, errors };
}
