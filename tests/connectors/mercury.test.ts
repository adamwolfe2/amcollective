/**
 * Mercury Banking Connector Tests
 *
 * Tests: getAccounts(), getTransactions(), getPendingTransactions(),
 *        searchTransactions(), getTotalCash()
 * Strategy: stub `fetch` globally; mock `@/lib/connectors/base` to bypass Redis.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Mock connector base so no Redis is needed ────────────────────────────

vi.mock("@/lib/connectors/base", () => ({
  cached: vi.fn((_key: string, fn: () => unknown) => fn()),
  safeCall: vi.fn((fn: () => unknown) => {
    return Promise.resolve(fn()).then(
      (data) => ({ success: true, data, fetchedAt: new Date() }),
      (err: Error) => ({ success: false, error: err.message, fetchedAt: new Date() })
    );
  }),
  invalidateCache: vi.fn(),
  CACHE_TTL: { REALTIME: 60, STANDARD: 300, STABLE: 1800, SLOW_MOVING: 3600 },
}));

vi.mock("@/lib/errors", () => ({ captureError: vi.fn() }));

// ─── Fixture data ─────────────────────────────────────────────────────────

const RAW_ACCOUNT = {
  id: "acc-001",
  name: "Operating Checking",
  accountNumber: "123456789",
  type: "checking",
  currentBalance: 50000,
  availableBalance: 49500,
  currency: "USD",
  createdAt: "2024-01-01T00:00:00Z",
};

const RAW_TXN = {
  id: "txn-001",
  amount: 1500,
  direction: "credit",
  status: "posted",
  note: "Client payment",
  counterpartyName: "Acme Corp",
  createdAt: "2024-06-01T10:00:00Z",
  postedAt: "2024-06-01T12:00:00Z",
  kind: "ach",
};

const RAW_TXN_NO_DIRECTION = {
  id: "txn-002",
  amount: -200,
  status: "posted",
  bankDescription: "AWS charge",
  createdAt: "2024-06-02T10:00:00Z",
};

import {
  getAccounts,
  getTransactions,
  getPendingTransactions,
  searchTransactions,
  getTotalCash,
  isMercuryConfigured,
} from "@/lib/connectors/mercury";

describe("isMercuryConfigured", () => {
  it("returns false when MERCURY_API_KEY is not set", () => {
    const orig = process.env.MERCURY_API_KEY;
    delete process.env.MERCURY_API_KEY;
    expect(isMercuryConfigured()).toBe(false);
    process.env.MERCURY_API_KEY = orig;
  });

  it("returns true when MERCURY_API_KEY is set", () => {
    process.env.MERCURY_API_KEY = "test-key";
    expect(isMercuryConfigured()).toBe(true);
  });
});

describe("getAccounts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.MERCURY_API_KEY = "test-key";
  });

  it("returns success:false when MERCURY_API_KEY is missing", async () => {
    delete process.env.MERCURY_API_KEY;
    const result = await getAccounts();
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/not configured/i);
  });

  it("maps raw accounts to MercuryAccount shape with last-4 account number", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ accounts: [RAW_ACCOUNT] }),
      })
    );

    const result = await getAccounts();

    expect(result.success).toBe(true);
    expect(result.data).toHaveLength(1);
    expect(result.data![0].accountNumber).toBe("6789");
    expect(result.data![0].currentBalance).toBe(50000);
    expect(result.data![0].type).toBe("checking");

    vi.unstubAllGlobals();
  });

  it("returns success:false on HTTP 4xx", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        text: () => Promise.resolve("Unauthorized"),
      })
    );

    const result = await getAccounts();

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/401/);

    vi.unstubAllGlobals();
  });
});

describe("getTransactions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.MERCURY_API_KEY = "test-key";
  });

  it("returns success:false when MERCURY_API_KEY is missing", async () => {
    delete process.env.MERCURY_API_KEY;
    const result = await getTransactions("acc-001");
    expect(result.success).toBe(false);
  });

  it("maps transactions and infers direction from amount sign when missing", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({ transactions: [RAW_TXN, RAW_TXN_NO_DIRECTION] }),
      })
    );

    const result = await getTransactions("acc-001");

    expect(result.success).toBe(true);
    expect(result.data![0].direction).toBe("credit");
    // Negative amount without explicit direction → debit
    expect(result.data![1].direction).toBe("debit");
    expect(result.data![1].description).toBe("AWS charge");
    expect(result.data![1].counterpartyName).toBeNull();

    vi.unstubAllGlobals();
  });

  it("appends query params for start, end, and limit", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ transactions: [] }),
    });
    vi.stubGlobal("fetch", mockFetch);

    await getTransactions("acc-001", {
      start: "2024-01-01",
      end: "2024-01-31",
      limit: 50,
      offset: 100,
    });

    const calledUrl: string = mockFetch.mock.calls[0][0];
    expect(calledUrl).toContain("start=2024-01-01");
    expect(calledUrl).toContain("end=2024-01-31");
    expect(calledUrl).toContain("limit=50");
    expect(calledUrl).toContain("offset=100");

    vi.unstubAllGlobals();
  });
});

describe("getPendingTransactions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.MERCURY_API_KEY = "test-key";
  });

  it("calls the correct pending endpoint", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ transactions: [RAW_TXN] }),
    });
    vi.stubGlobal("fetch", mockFetch);

    const result = await getPendingTransactions("acc-001");

    expect(result.success).toBe(true);
    const calledUrl: string = mockFetch.mock.calls[0][0];
    expect(calledUrl).toContain("status=pending");

    vi.unstubAllGlobals();
  });
});

describe("searchTransactions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.MERCURY_API_KEY = "test-key";
  });

  it("filters by keyword (description match)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn()
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ accounts: [RAW_ACCOUNT] }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () =>
            Promise.resolve({
              transactions: [
                { ...RAW_TXN, note: "Client payment ACME" },
                { ...RAW_TXN, id: "txn-other", note: "Office supplies" },
              ],
            }),
        })
    );

    const result = await searchTransactions({ keyword: "acme" });

    expect(result.success).toBe(true);
    expect(result.data!.every((t) => t.description.toLowerCase().includes("acme") || t.counterpartyName?.toLowerCase().includes("acme"))).toBe(true);

    vi.unstubAllGlobals();
  });

  it("filters by direction", async () => {
    const creditTxn = { ...RAW_TXN, id: "txn-credit", direction: "credit" };
    const debitTxn = { ...RAW_TXN, id: "txn-debit", direction: "debit" };

    vi.stubGlobal(
      "fetch",
      vi.fn()
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ accounts: [RAW_ACCOUNT] }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () =>
            Promise.resolve({ transactions: [creditTxn, debitTxn] }),
        })
    );

    const result = await searchTransactions({ direction: "credit" });

    expect(result.success).toBe(true);
    expect(result.data!.every((t) => t.direction === "credit")).toBe(true);

    vi.unstubAllGlobals();
  });

  it("filters by minAmount and maxAmount", async () => {
    const smallTxn = { ...RAW_TXN, id: "txn-small", amount: 50 };
    const largeTxn = { ...RAW_TXN, id: "txn-large", amount: 5000 };

    vi.stubGlobal(
      "fetch",
      vi.fn()
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ accounts: [RAW_ACCOUNT] }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () =>
            Promise.resolve({ transactions: [smallTxn, largeTxn] }),
        })
    );

    const result = await searchTransactions({ minAmount: 100, maxAmount: 2000 });

    expect(result.success).toBe(true);
    expect(result.data!.length).toBe(0);

    vi.unstubAllGlobals();
  });

  it("returns success:false when MERCURY_API_KEY is missing", async () => {
    delete process.env.MERCURY_API_KEY;
    const result = await searchTransactions({ keyword: "test" });
    expect(result.success).toBe(false);
  });
});

describe("getTotalCash", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.MERCURY_API_KEY = "test-key";
  });

  it("returns sum of currentBalance across all accounts", async () => {
    const acct2 = { ...RAW_ACCOUNT, id: "acc-002", currentBalance: 30000 };

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ accounts: [RAW_ACCOUNT, acct2] }),
      })
    );

    const result = await getTotalCash();

    expect(result.success).toBe(true);
    expect(result.data).toBe(80000); // 50000 + 30000

    vi.unstubAllGlobals();
  });

  it("returns success:false when MERCURY_API_KEY is missing", async () => {
    delete process.env.MERCURY_API_KEY;
    const result = await getTotalCash();
    expect(result.success).toBe(false);
  });
});
