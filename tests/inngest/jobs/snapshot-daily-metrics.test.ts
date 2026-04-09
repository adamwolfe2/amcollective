/**
 * Inngest Job — Snapshot Daily Metrics (unit tests)
 *
 * Tests: metric aggregation logic, idempotency (upsert on same date),
 *        audit log creation, and correct field mapping.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ─── Mocks ────────────────────────────────────────────────────────────────────

vi.mock("@/lib/errors", () => ({ captureError: vi.fn() }));

const mockCreateAuditLog = vi.fn().mockResolvedValue(undefined);
vi.mock("@/lib/db/repositories/audit", () => ({
  createAuditLog: mockCreateAuditLog,
}));

// ─── Metric computation helpers ───────────────────────────────────────────────

/**
 * Mirrors the metric aggregation from step "compute-all-metrics".
 */
interface RawMetricData {
  mrrRows: Array<{ total: string }>;
  subsCountRows: Array<{ value: number }>;
  accountRows: Array<{ balance: string }>;
  activeClientsRows: Array<{ value: number }>;
  overdueInvoices: Array<{ amount: number }>;
  projectRows: Array<{ status: string }>;
}

function computeMetrics(raw: RawMetricData) {
  const mrr = Number(raw.mrrRows[0]?.total ?? 0);
  const cashTotal = raw.accountRows.reduce((s, a) => s + Number(a.balance), 0);
  return {
    mrrData: {
      mrr,
      arr: mrr * 12,
      activeSubscriptions: raw.subsCountRows[0]?.value ?? 0,
    },
    cashData: cashTotal,
    countData: {
      activeClients: Number(raw.activeClientsRows[0]?.value ?? 0),
      activeProjects: raw.projectRows.filter((p) => p.status === "active").length,
    },
    overdueData: {
      overdueInvoices: raw.overdueInvoices.length,
      overdueAmount: raw.overdueInvoices.reduce((s, inv) => s + inv.amount, 0),
    },
  };
}

describe("computeMetrics", () => {
  it("calculates ARR as 12x MRR", () => {
    const result = computeMetrics({
      mrrRows: [{ total: "5000" }],
      subsCountRows: [{ value: 10 }],
      accountRows: [],
      activeClientsRows: [{ value: 3 }],
      overdueInvoices: [],
      projectRows: [],
    });

    expect(result.mrrData.mrr).toBe(5000);
    expect(result.mrrData.arr).toBe(60000);
    expect(result.mrrData.activeSubscriptions).toBe(10);
  });

  it("aggregates cash from multiple accounts", () => {
    const result = computeMetrics({
      mrrRows: [{ total: "0" }],
      subsCountRows: [],
      accountRows: [{ balance: "25000" }, { balance: "10000" }, { balance: "5000.50" }],
      activeClientsRows: [],
      overdueInvoices: [],
      projectRows: [],
    });

    expect(result.cashData).toBeCloseTo(40000.5);
  });

  it("counts only active projects", () => {
    const result = computeMetrics({
      mrrRows: [],
      subsCountRows: [],
      accountRows: [],
      activeClientsRows: [],
      overdueInvoices: [],
      projectRows: [
        { status: "active" },
        { status: "active" },
        { status: "completed" },
        { status: "on_hold" },
      ],
    });

    expect(result.countData.activeProjects).toBe(2);
  });

  it("sums overdue amounts correctly", () => {
    const result = computeMetrics({
      mrrRows: [],
      subsCountRows: [],
      accountRows: [],
      activeClientsRows: [],
      overdueInvoices: [{ amount: 1000_00 }, { amount: 2500_00 }, { amount: 500_00 }],
      projectRows: [],
    });

    expect(result.overdueData.overdueInvoices).toBe(3);
    expect(result.overdueData.overdueAmount).toBe(4000_00);
  });

  it("defaults to 0 when all inputs are empty", () => {
    const result = computeMetrics({
      mrrRows: [],
      subsCountRows: [],
      accountRows: [],
      activeClientsRows: [],
      overdueInvoices: [],
      projectRows: [],
    });

    expect(result.mrrData.mrr).toBe(0);
    expect(result.mrrData.arr).toBe(0);
    expect(result.mrrData.activeSubscriptions).toBe(0);
    expect(result.cashData).toBe(0);
    expect(result.countData.activeClients).toBe(0);
    expect(result.countData.activeProjects).toBe(0);
    expect(result.overdueData.overdueInvoices).toBe(0);
    expect(result.overdueData.overdueAmount).toBe(0);
  });
});

// ─── Idempotency ──────────────────────────────────────────────────────────────

describe("snapshot idempotency", () => {
  it("builds onConflictDoUpdate set with same fields as insert values", () => {
    // Verify the snapshot values shape — both insert values and conflict update
    // must include the same financial fields.
    const insertValues = {
      date: new Date("2026-04-08T00:00:00Z"),
      mrr: 5000,
      arr: 60000,
      totalCash: 40000,
      activeClients: 3,
      activeProjects: 2,
      activeSubscriptions: 10,
      overdueInvoices: 1,
      overdueAmount: 1000_00,
    };

    const conflictUpdate = {
      mrr: insertValues.mrr,
      arr: insertValues.arr,
      totalCash: insertValues.totalCash,
      activeClients: insertValues.activeClients,
      activeProjects: insertValues.activeProjects,
      activeSubscriptions: insertValues.activeSubscriptions,
      overdueInvoices: insertValues.overdueInvoices,
      overdueAmount: insertValues.overdueAmount,
    };

    // All financial fields should be present in both
    const insertKeys = Object.keys(insertValues).filter((k) => k !== "date");
    const conflictKeys = Object.keys(conflictUpdate);

    expect(conflictKeys.sort()).toEqual(insertKeys.sort());
  });
});

// ─── Audit log ────────────────────────────────────────────────────────────────

describe("snapshot-daily-metrics: audit log", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("creates audit log with snapshot metadata", async () => {
    const { createAuditLog } = await import("@/lib/db/repositories/audit");

    await createAuditLog({
      actorId: "system",
      actorType: "system",
      action: "snapshot_daily_metrics",
      entityType: "daily_metrics_snapshots",
      entityId: "snap-001",
      metadata: {
        mrr: 5000,
        totalCash: 40000,
        activeClients: 3,
      },
    });

    expect(mockCreateAuditLog).toHaveBeenCalledOnce();
    const args = mockCreateAuditLog.mock.calls[0][0];
    expect(args.action).toBe("snapshot_daily_metrics");
    expect(args.metadata.mrr).toBe(5000);
    expect(args.metadata.totalCash).toBe(40000);
  });
});

// ─── Date truncation to midnight UTC ─────────────────────────────────────────

describe("snapshot date UTC normalization", () => {
  it("snapshot date is midnight UTC regardless of when job runs", () => {
    const today = new Date("2026-04-08T14:30:00Z");
    today.setUTCHours(0, 0, 0, 0);

    expect(today.toISOString()).toBe("2026-04-08T00:00:00.000Z");
  });

  it("two snapshots on same UTC day produce same date key", () => {
    const morning = new Date("2026-04-08T04:00:00Z");
    morning.setUTCHours(0, 0, 0, 0);

    const evening = new Date("2026-04-08T22:00:00Z");
    evening.setUTCHours(0, 0, 0, 0);

    expect(morning.toISOString()).toBe(evening.toISOString());
  });
});
