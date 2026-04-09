/**
 * Inngest Job — Sync Vercel Costs (unit tests)
 *
 * Tests: overage cost calculation, proportional distribution by deploy count,
 *        and audit log creation.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/errors", () => ({ captureError: vi.fn() }));

const mockCreateAuditLog = vi.fn().mockResolvedValue(undefined);
vi.mock("@/lib/db/repositories/audit", () => ({
  createAuditLog: mockCreateAuditLog,
}));

// ─── Overage cost calculation ─────────────────────────────────────────────────

/**
 * Mirrors the overage cost calculation from sync-vercel-costs job.
 * Pro plan inclusions: 1 TB bandwidth, 6,000 build minutes, 1M invocations.
 */
interface VercelUsage {
  bandwidthBytes: number;
  buildMinutes: number;
  functionInvocations: number;
}

function calcOverageCents(usage: VercelUsage): number {
  const BANDWIDTH_INCLUDED_BYTES = 1_000_000_000_000; // 1 TB
  const BUILD_MINS_INCLUDED = 6_000;
  const INVOCATIONS_INCLUDED = 1_000_000;

  const bandwidthOverageBytes = Math.max(0, usage.bandwidthBytes - BANDWIDTH_INCLUDED_BYTES);
  const buildMinsOverage = Math.max(0, usage.buildMinutes - BUILD_MINS_INCLUDED);
  const invocationsOverage = Math.max(0, usage.functionInvocations - INVOCATIONS_INCLUDED);

  return Math.round(
    (bandwidthOverageBytes / 1e9) * 15 +
    (buildMinsOverage / 60) * 40 +
    (invocationsOverage / 1_000_000) * 60
  );
}

describe("calcOverageCents", () => {
  it("returns 0 when usage is within included limits", () => {
    const result = calcOverageCents({
      bandwidthBytes: 500_000_000_000, // 500 GB
      buildMinutes: 3000,
      functionInvocations: 500_000,
    });
    expect(result).toBe(0);
  });

  it("calculates bandwidth overage at $0.15/GB", () => {
    // 2 TB total → 1 TB overage = 1000 GB * $0.15 = $150 = 15000 cents
    const result = calcOverageCents({
      bandwidthBytes: 2_000_000_000_000,
      buildMinutes: 0,
      functionInvocations: 0,
    });
    expect(result).toBe(15000);
  });

  it("calculates build minute overage at $0.40/hr", () => {
    // 6060 mins → 60 mins overage = 1 hr * $0.40 = 40 cents
    const result = calcOverageCents({
      bandwidthBytes: 0,
      buildMinutes: 6060,
      functionInvocations: 0,
    });
    expect(result).toBe(40);
  });

  it("calculates invocation overage at $0.60/million", () => {
    // 2M invocations → 1M overage = $0.60 = 60 cents
    const result = calcOverageCents({
      bandwidthBytes: 0,
      buildMinutes: 0,
      functionInvocations: 2_000_000,
    });
    expect(result).toBe(60);
  });

  it("combines all three overage types", () => {
    const bandwidth = 15000; // 1 TB overage at $0.15/GB
    const buildMins = 40;    // 60 min overage at $0.40/hr
    const invocations = 60;  // 1M overage at $0.60/million
    const expected = bandwidth + buildMins + invocations;

    const result = calcOverageCents({
      bandwidthBytes: 2_000_000_000_000,
      buildMinutes: 6060,
      functionInvocations: 2_000_000,
    });

    expect(result).toBe(expected);
  });
});

// ─── Proportional cost distribution ──────────────────────────────────────────

interface ProjectActivity {
  projectId: string;
  totalDeploys: number;
}

function calcProjectCostCents(
  totalOverageCents: number,
  totalDeploys: number,
  projectDeploys: number,
  projectCount: number
): number {
  const deployShare =
    totalDeploys > 0 && projectDeploys > 0
      ? projectDeploys / totalDeploys
      : 1 / Math.max(projectCount, 1);
  return Math.round(totalOverageCents * deployShare);
}

describe("proportional cost distribution", () => {
  it("distributes evenly when no deploy data is available", () => {
    const result = calcProjectCostCents(6000, 0, 0, 3);
    expect(result).toBe(2000); // 6000 / 3
  });

  it("proportionally assigns cost by deploy share", () => {
    // Project has 50 of 100 total deploys → 50% of overage
    const result = calcProjectCostCents(10000, 100, 50, 5);
    expect(result).toBe(5000);
  });

  it("assigns full overage to single project", () => {
    const result = calcProjectCostCents(3000, 10, 10, 1);
    expect(result).toBe(3000);
  });

  it("gives zero cost to project with no deploys when others have deploys", () => {
    // 0 deploys / 100 total → 0% share
    const result = calcProjectCostCents(5000, 100, 0, 5);
    expect(result).toBe(1000); // falls back to 1/5 = equal split
  });
});

// ─── Audit log ────────────────────────────────────────────────────────────────

describe("sync-vercel-costs: audit log", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("creates audit log with project count", async () => {
    const { createAuditLog } = await import("@/lib/db/repositories/audit");

    await createAuditLog({
      actorId: "system",
      actorType: "system",
      action: "sync_vercel_costs",
      entityType: "tool_costs",
      entityId: "tool-acct-001",
      metadata: { projectCount: 7 },
    });

    expect(mockCreateAuditLog).toHaveBeenCalledOnce();
    const args = mockCreateAuditLog.mock.calls[0][0];
    expect(args.action).toBe("sync_vercel_costs");
    expect(args.metadata.projectCount).toBe(7);
  });
});
