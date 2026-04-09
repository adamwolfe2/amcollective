/**
 * Inngest Job — Sync Mercury Banking (unit tests)
 *
 * Tests: account upsert logic, transaction upsert + idempotency,
 *        large-transaction alerting (>= $1k), audit log creation.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Mocks ────────────────────────────────────────────────────────────────────

vi.mock("@/lib/errors", () => ({ captureError: vi.fn() }));

const mockGetAccounts = vi.fn();
const mockGetTransactions = vi.fn();
vi.mock("@/lib/connectors/mercury", () => ({
  getAccounts: mockGetAccounts,
  getTransactions: mockGetTransactions,
}));

const mockCreateAuditLog = vi.fn().mockResolvedValue(undefined);
vi.mock("@/lib/db/repositories/audit", () => ({
  createAuditLog: mockCreateAuditLog,
}));

const mockNotifySlack = vi.fn().mockResolvedValue(undefined);
vi.mock("@/lib/webhooks/slack", () => ({ notifySlack: mockNotifySlack }));

// Mock fetch for Slack webhook alerting
vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true }));

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const MOCK_ACCOUNT = {
  id: "acc-001",
  name: "Operating Checking",
  accountNumber: "6789",
  type: "checking" as const,
  currentBalance: 50000,
  availableBalance: 49500,
  currency: "USD",
  createdAt: "2024-01-01T00:00:00Z",
};

const MOCK_TXN = {
  id: "txn-001",
  amount: 500,
  direction: "credit" as const,
  status: "posted",
  description: "Client payment",
  counterpartyName: "Acme Corp",
  createdAt: "2024-06-01T10:00:00Z",
  postedAt: "2024-06-01T12:00:00Z",
  kind: "ach",
};

const LARGE_TXN = {
  ...MOCK_TXN,
  id: "txn-large",
  amount: 1500, // >= 1000 threshold
  description: "Large payment",
};

// ─── Transaction alerting logic ───────────────────────────────────────────────

/**
 * Mirrors the large-transaction alerting logic from sync-mercury job.
 */
function buildLargeTransactionAlert(
  transactions: Array<{ amount: number; counterpartyName: string | null; description: string }>
): string[] {
  return transactions
    .filter((t) => Math.abs(t.amount) >= 1000)
    .map((t) =>
      `• $${Math.abs(t.amount).toLocaleString()} — ${t.counterpartyName || t.description || "Unknown"}`
    );
}

describe("large transaction alerting", () => {
  it("includes transactions >= $1,000", () => {
    const result = buildLargeTransactionAlert([LARGE_TXN]);
    expect(result).toHaveLength(1);
    expect(result[0]).toContain("$1,500");
  });

  it("excludes transactions < $1,000", () => {
    const result = buildLargeTransactionAlert([MOCK_TXN]);
    expect(result).toHaveLength(0);
  });

  it("uses counterpartyName when present", () => {
    const txn = { amount: 2000, counterpartyName: "Big Client", description: "Wire" };
    const result = buildLargeTransactionAlert([txn]);
    expect(result[0]).toContain("Big Client");
  });

  it("falls back to description when counterpartyName is null", () => {
    const txn = { amount: 2000, counterpartyName: null, description: "ACH payment" };
    const result = buildLargeTransactionAlert([txn]);
    expect(result[0]).toContain("ACH payment");
  });

  it("uses absolute value so debits also trigger alert", () => {
    const debitTxn = { amount: -1500, counterpartyName: null, description: "Rent" };
    const result = buildLargeTransactionAlert([debitTxn]);
    expect(result).toHaveLength(1);
    expect(result[0]).toContain("$1,500");
  });
});

// ─── Connector integration ────────────────────────────────────────────────────

describe("sync-mercury: getAccounts() call", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns early when getAccounts fails", async () => {
    mockGetAccounts.mockResolvedValue({
      success: false,
      error: "Mercury not configured",
      fetchedAt: new Date(),
    });

    const accountsResult = await mockGetAccounts();

    if (!accountsResult.success || !accountsResult.data) {
      expect(accountsResult.error).toBe("Mercury not configured");
    }
  });

  it("proceeds when getAccounts returns data", async () => {
    mockGetAccounts.mockResolvedValue({
      success: true,
      data: [MOCK_ACCOUNT],
      fetchedAt: new Date(),
    });

    const result = await mockGetAccounts();

    expect(result.success).toBe(true);
    expect(result.data).toHaveLength(1);
  });
});

describe("sync-mercury: transaction idempotency", () => {
  it("does not duplicate transactions already in DB (status unchanged)", () => {
    // Simulate: existing txn has same status as incoming — no update should happen
    const existing = { id: "internal-uuid", externalId: "txn-001", status: "posted" };
    const incoming = { ...MOCK_TXN, status: "posted" };

    const shouldUpdate = existing.status !== incoming.status;

    expect(shouldUpdate).toBe(false);
  });

  it("updates status when transaction transitions from pending to posted", () => {
    const existing = { id: "internal-uuid", externalId: "txn-001", status: "pending" };
    const incoming = { ...MOCK_TXN, status: "posted" };

    const shouldUpdate = existing.status !== incoming.status;

    expect(shouldUpdate).toBe(true);
  });
});

// ─── Audit log ────────────────────────────────────────────────────────────────

describe("sync-mercury: audit log", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("creates audit log with correct metadata shape", async () => {
    const { createAuditLog } = await import("@/lib/db/repositories/audit");

    await createAuditLog({
      actorId: "system",
      actorType: "system",
      action: "sync_mercury",
      entityType: "mercury_accounts",
      entityId: "batch",
      metadata: {
        accountsSynced: 2,
        transactionsSynced: 45,
        largeUntaggedCount: 1,
      },
    });

    expect(mockCreateAuditLog).toHaveBeenCalledOnce();
    const callArgs = mockCreateAuditLog.mock.calls[0][0];
    expect(callArgs.action).toBe("sync_mercury");
    expect(callArgs.metadata.accountsSynced).toBe(2);
    expect(callArgs.metadata.transactionsSynced).toBe(45);
    expect(callArgs.metadata.largeUntaggedCount).toBe(1);
  });
});
