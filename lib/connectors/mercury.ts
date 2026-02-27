/**
 * AM Collective — Mercury Banking Connector
 *
 * Pulls account balances and transaction data from Mercury's REST API.
 * MERCURY_API_KEY must be set in env. Set MERCURY_SANDBOX=true for sandbox mode.
 */

import { cached, safeCall, type ConnectorResult } from "./base";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface MercuryAccount {
  id: string;
  name: string;
  accountNumber: string; // last 4 only
  type: "checking" | "savings";
  currentBalance: number;
  availableBalance: number;
  currency: string;
  createdAt: string;
}

export interface MercuryTransaction {
  id: string;
  amount: number;
  direction: "credit" | "debit";
  status: string;
  description: string;
  counterpartyName: string | null;
  createdAt: string;
  postedAt: string | null;
  kind: string;
}

// ─── Internals ───────────────────────────────────────────────────────────────

const MERCURY_API = "https://api.mercury.com/api/v1";

function getBaseUrl(): string {
  return MERCURY_API;
}

function getHeaders(): HeadersInit {
  const token = process.env.MERCURY_API_KEY;
  if (!token) throw new Error("MERCURY_API_KEY is not set");
  return {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
    Accept: "application/json",
  };
}

async function mercuryFetch<T>(path: string): Promise<T> {
  const url = `${getBaseUrl()}${path}`;
  const res = await fetch(url, { headers: getHeaders() });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Mercury API ${res.status}: ${body.slice(0, 200)}`);
  }
  return res.json() as Promise<T>;
}

// ─── Response Mappers ────────────────────────────────────────────────────────

interface MercuryAccountRaw {
  id: string;
  name: string;
  accountNumber: string;
  type: string;
  currentBalance: number;
  availableBalance: number;
  currency: string;
  createdAt: string;
}

function mapAccount(raw: MercuryAccountRaw): MercuryAccount {
  return {
    id: raw.id,
    name: raw.name,
    accountNumber: raw.accountNumber.slice(-4),
    type: (raw.type === "savings" ? "savings" : "checking") as "checking" | "savings",
    currentBalance: raw.currentBalance,
    availableBalance: raw.availableBalance,
    currency: raw.currency,
    createdAt: raw.createdAt,
  };
}

interface MercuryTransactionRaw {
  id: string;
  amount: number;
  direction: string;
  status: string;
  note?: string;
  bankDescription?: string;
  counterpartyName?: string;
  createdAt: string;
  postedAt?: string;
  kind?: string;
}

function mapTransaction(raw: MercuryTransactionRaw): MercuryTransaction {
  // Mercury may omit `direction` — infer from amount sign if missing
  const direction: "credit" | "debit" =
    raw.direction === "credit" || raw.direction === "debit"
      ? raw.direction
      : raw.amount >= 0
        ? "credit"
        : "debit";

  return {
    id: raw.id,
    amount: raw.amount,
    direction,
    status: raw.status,
    description: raw.note || raw.bankDescription || "",
    counterpartyName: raw.counterpartyName ?? null,
    createdAt: raw.createdAt,
    postedAt: raw.postedAt ?? null,
    kind: raw.kind ?? "unknown",
  };
}

// ─── Public API ──────────────────────────────────────────────────────────────

export function isMercuryConfigured(): boolean {
  return !!process.env.MERCURY_API_KEY;
}

/**
 * Get all Mercury accounts with balances.
 */
export async function getAccounts(): Promise<ConnectorResult<MercuryAccount[]>> {
  if (!isMercuryConfigured()) {
    return { success: false, error: "Mercury not configured", fetchedAt: new Date() };
  }
  return safeCall(() =>
    cached("mercury:accounts", async () => {
      const res = await mercuryFetch<{ accounts: MercuryAccountRaw[] }>(
        "/accounts"
      );
      return res.accounts.map(mapAccount);
    })
  );
}

/**
 * Get transactions for a specific account with optional filters.
 */
export async function getTransactions(
  accountId: string,
  options: {
    start?: string;
    end?: string;
    limit?: number;
    offset?: number;
  } = {}
): Promise<ConnectorResult<MercuryTransaction[]>> {
  if (!isMercuryConfigured()) {
    return { success: false, error: "Mercury not configured", fetchedAt: new Date() };
  }
  return safeCall(() =>
    cached(
      `mercury:txns:${accountId}:${JSON.stringify(options)}`,
      async () => {
        const params = new URLSearchParams();
        if (options.start) params.set("start", options.start);
        if (options.end) params.set("end", options.end);
        if (options.limit) params.set("limit", String(options.limit));
        if (options.offset) params.set("offset", String(options.offset));

        const qs = params.toString();
        const path = `/account/${accountId}/transactions${qs ? `?${qs}` : ""}`;
        const res = await mercuryFetch<{ transactions: MercuryTransactionRaw[] }>(path);
        return res.transactions.map(mapTransaction);
      },
      3 * 60 * 1000 // 3 min cache for transactions
    )
  );
}

/**
 * Get pending transactions for an account.
 */
export async function getPendingTransactions(
  accountId: string
): Promise<ConnectorResult<MercuryTransaction[]>> {
  if (!isMercuryConfigured()) {
    return { success: false, error: "Mercury not configured", fetchedAt: new Date() };
  }
  return safeCall(() =>
    cached(`mercury:pending:${accountId}`, async () => {
      const res = await mercuryFetch<{ transactions: MercuryTransactionRaw[] }>(
        `/account/${accountId}/transactions?status=pending`
      );
      return res.transactions.map(mapTransaction);
    })
  );
}

/**
 * Search transactions across all accounts with filters.
 */
export async function searchTransactions(query: {
  keyword?: string;
  minAmount?: number;
  maxAmount?: number;
  start?: string;
  end?: string;
  direction?: "credit" | "debit";
}): Promise<ConnectorResult<MercuryTransaction[]>> {
  if (!isMercuryConfigured()) {
    return { success: false, error: "Mercury not configured", fetchedAt: new Date() };
  }
  return safeCall(async () => {
    // Mercury doesn't have a global search endpoint — search per account
    const accountsResult = await getAccounts();
    if (!accountsResult.success || !accountsResult.data) {
      throw new Error(accountsResult.error ?? "Failed to fetch accounts");
    }

    const allTransactions: MercuryTransaction[] = [];

    for (const account of accountsResult.data) {
      const txnResult = await getTransactions(account.id, {
        start: query.start,
        end: query.end,
        limit: 200,
      });

      if (txnResult.success && txnResult.data) {
        allTransactions.push(...txnResult.data);
      }
    }

    // Apply client-side filters
    return allTransactions.filter((txn) => {
      if (query.keyword) {
        const kw = query.keyword.toLowerCase();
        const matchesDescription = txn.description.toLowerCase().includes(kw);
        const matchesCounterparty = txn.counterpartyName?.toLowerCase().includes(kw);
        if (!matchesDescription && !matchesCounterparty) return false;
      }
      if (query.minAmount != null && Math.abs(txn.amount) < query.minAmount) return false;
      if (query.maxAmount != null && Math.abs(txn.amount) > query.maxAmount) return false;
      if (query.direction && txn.direction !== query.direction) return false;
      return true;
    });
  });
}

/**
 * Get total cash across all accounts.
 */
export async function getTotalCash(): Promise<ConnectorResult<number>> {
  if (!isMercuryConfigured()) {
    return { success: false, error: "Mercury not configured", fetchedAt: new Date() };
  }
  return safeCall(() =>
    cached("mercury:total-cash", async () => {
      const accountsResult = await getAccounts();
      if (!accountsResult.success || !accountsResult.data) {
        throw new Error(accountsResult.error ?? "Failed to fetch accounts");
      }
      return accountsResult.data.reduce(
        (sum, a) => sum + a.currentBalance,
        0
      );
    })
  );
}
