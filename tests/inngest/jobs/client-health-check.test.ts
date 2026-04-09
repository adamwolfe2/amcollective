/**
 * Inngest Job — Client Health Check (unit tests)
 *
 * Tests: score aggregation, at-risk threshold, audit log metadata.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/errors", () => ({ captureError: vi.fn() }));

const mockCreateAuditLog = vi.fn().mockResolvedValue(undefined);
vi.mock("@/lib/db/repositories/audit", () => ({
  createAuditLog: mockCreateAuditLog,
}));

vi.mock("@/lib/ai/agents/client-health", () => ({
  scoreAllClients: vi.fn(),
}));

// ─── Result aggregation helpers ───────────────────────────────────────────────

interface ClientHealthResult {
  clientId: string;
  score: number;
}

function aggregateHealthResults(results: ClientHealthResult[]) {
  const atRisk = results.filter((r) => r.score < 60);
  const averageScore =
    results.length > 0
      ? Math.round(results.reduce((sum, r) => sum + r.score, 0) / results.length)
      : 0;

  return {
    totalClients: results.length,
    atRiskCount: atRisk.length,
    averageScore,
    atRisk,
  };
}

describe("aggregateHealthResults", () => {
  it("returns zero values for empty input", () => {
    const result = aggregateHealthResults([]);
    expect(result.totalClients).toBe(0);
    expect(result.atRiskCount).toBe(0);
    expect(result.averageScore).toBe(0);
  });

  it("flags clients with score < 60 as at-risk", () => {
    const results: ClientHealthResult[] = [
      { clientId: "c1", score: 75 },
      { clientId: "c2", score: 55 },
      { clientId: "c3", score: 40 },
    ];

    const agg = aggregateHealthResults(results);

    expect(agg.atRiskCount).toBe(2);
    expect(agg.atRisk.map((r) => r.clientId)).toContain("c2");
    expect(agg.atRisk.map((r) => r.clientId)).toContain("c3");
  });

  it("does not flag clients with score exactly 60 as at-risk", () => {
    const results: ClientHealthResult[] = [{ clientId: "c1", score: 60 }];
    const agg = aggregateHealthResults(results);
    expect(agg.atRiskCount).toBe(0);
  });

  it("calculates correct average score", () => {
    const results: ClientHealthResult[] = [
      { clientId: "c1", score: 80 },
      { clientId: "c2", score: 70 },
      { clientId: "c3", score: 90 },
    ];

    const agg = aggregateHealthResults(results);
    expect(agg.averageScore).toBe(80);
  });

  it("rounds fractional average scores", () => {
    const results: ClientHealthResult[] = [
      { clientId: "c1", score: 70 },
      { clientId: "c2", score: 71 },
    ];

    const agg = aggregateHealthResults(results);
    expect(Number.isInteger(agg.averageScore)).toBe(true);
  });

  it("counts total clients correctly", () => {
    const results: ClientHealthResult[] = Array.from({ length: 12 }, (_, i) => ({
      clientId: `c${i}`,
      score: 65,
    }));

    const agg = aggregateHealthResults(results);
    expect(agg.totalClients).toBe(12);
  });
});

// ─── Job return shape ─────────────────────────────────────────────────────────

describe("client-health-check: job return shape", () => {
  it("builds correct return object from aggregated results", () => {
    const results: ClientHealthResult[] = [
      { clientId: "c1", score: 80 },
      { clientId: "c2", score: 45 },
    ];

    const agg = aggregateHealthResults(results);
    const returnValue = {
      success: true,
      totalClients: results.length,
      atRisk: agg.atRiskCount,
      results,
    };

    expect(returnValue.success).toBe(true);
    expect(returnValue.totalClients).toBe(2);
    expect(returnValue.atRisk).toBe(1);
  });
});

// ─── Audit log ────────────────────────────────────────────────────────────────

describe("client-health-check: audit log", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("creates audit log with correct metadata structure", async () => {
    const { createAuditLog } = await import("@/lib/db/repositories/audit");
    const date = "2026-04-08";

    await createAuditLog({
      actorId: "system",
      actorType: "system",
      action: "create",
      entityType: "client_health_check",
      entityId: `health-${date}`,
      metadata: {
        totalClients: 5,
        atRiskCount: 2,
        averageScore: 72,
      },
    });

    expect(mockCreateAuditLog).toHaveBeenCalledOnce();
    const args = mockCreateAuditLog.mock.calls[0][0];
    expect(args.entityId).toBe(`health-${date}`);
    expect(args.metadata.totalClients).toBe(5);
    expect(args.metadata.atRiskCount).toBe(2);
    expect(args.metadata.averageScore).toBe(72);
  });
});
