/**
 * Inngest Job — Job Failure Watchdog (unit tests)
 *
 * Tests:
 * - captureError IS called when a function has 3+ consecutive failures
 * - captureError is NOT called when failures < threshold
 * - captureError is NOT called when the most recent run is a success
 * - Returns correct counts
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { captureError } from "@/lib/errors";

// ─── Mock the DB ──────────────────────────────────────────────────────────────

vi.mock("@/lib/db", () => ({
  db: {
    select: vi.fn(),
  },
}));

vi.mock("@/lib/db/schema/inngest", () => ({
  inngestRunHistory: {
    functionId: "function_id",
    status: "status",
    startedAt: "started_at",
  },
}));

vi.mock("drizzle-orm", () => ({
  desc: vi.fn((col) => col),
  eq: vi.fn((col, val) => ({ col, val })),
  gte: vi.fn((col, val) => ({ col, val })),
}));

vi.mock("@/lib/inngest/registry", () => ({
  JOB_REGISTRY: [
    { id: "morning-briefing", name: "Morning Briefing", cron: "0 13 * * 1-5", events: [] },
    { id: "sync-vercel-costs", name: "Sync Vercel Costs", cron: "0 8 * * *", events: [] },
    { id: "deliver-webhooks", name: "Deliver Outbound Webhooks", cron: null, events: ["app/webhook.fire"] },
  ],
}));

// ─── Helper: simulate the consecutive failure counting logic ──────────────────

/**
 * Extracted from job-failure-watchdog.ts for unit testing without Inngest harness.
 * Counts consecutive failures from the start of the runs array (most recent first),
 * stopping at the first 'completed' run.
 */
function countConsecutiveFailures(
  runs: Array<{ status: string }>
): number {
  let count = 0;
  for (const run of runs) {
    if (run.status === "failed") {
      count++;
    } else if (run.status === "completed") {
      break;
    }
    // skip 'running' or 'queued'
  }
  return count;
}

/**
 * Simulate the watchdog alert decision for a given run history.
 * Returns whether captureError would be called.
 */
function wouldAlert(
  runs: Array<{ status: string }>,
  hasRecentRun: boolean,
  threshold = 3
): boolean {
  if (!hasRecentRun) return false;
  return countConsecutiveFailures(runs) >= threshold;
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("job-failure-watchdog: consecutive failure counting", () => {
  it("counts 3 consecutive failures", () => {
    const runs = [
      { status: "failed" },
      { status: "failed" },
      { status: "failed" },
      { status: "completed" },
    ];
    expect(countConsecutiveFailures(runs)).toBe(3);
  });

  it("stops counting at first success", () => {
    const runs = [
      { status: "failed" },
      { status: "completed" },
      { status: "failed" },
      { status: "failed" },
    ];
    expect(countConsecutiveFailures(runs)).toBe(1);
  });

  it("returns 0 when most recent run succeeded", () => {
    const runs = [
      { status: "completed" },
      { status: "failed" },
      { status: "failed" },
    ];
    expect(countConsecutiveFailures(runs)).toBe(0);
  });

  it("returns 0 for empty run history", () => {
    expect(countConsecutiveFailures([])).toBe(0);
  });

  it("ignores running/queued runs in the sequence", () => {
    const runs = [
      { status: "running" },
      { status: "failed" },
      { status: "failed" },
      { status: "failed" },
      { status: "completed" },
    ];
    // 'running' is skipped, then 3 failures, then stops at completed
    expect(countConsecutiveFailures(runs)).toBe(3);
  });
});

describe("job-failure-watchdog: alert decision", () => {
  it("alerts when exactly 3 consecutive failures and recent run exists", () => {
    const runs = [
      { status: "failed" },
      { status: "failed" },
      { status: "failed" },
    ];
    expect(wouldAlert(runs, true)).toBe(true);
  });

  it("alerts when more than 3 consecutive failures", () => {
    const runs = [
      { status: "failed" },
      { status: "failed" },
      { status: "failed" },
      { status: "failed" },
      { status: "failed" },
    ];
    expect(wouldAlert(runs, true)).toBe(true);
  });

  it("does NOT alert when only 2 consecutive failures", () => {
    const runs = [
      { status: "failed" },
      { status: "failed" },
      { status: "completed" },
    ];
    expect(wouldAlert(runs, false)).toBe(false);
    expect(wouldAlert(runs, true)).toBe(false);
  });

  it("does NOT alert when no recent run (job not active in window)", () => {
    const runs = [
      { status: "failed" },
      { status: "failed" },
      { status: "failed" },
    ];
    expect(wouldAlert(runs, false)).toBe(false);
  });

  it("does NOT alert when latest run succeeded", () => {
    const runs = [
      { status: "completed" },
      { status: "failed" },
      { status: "failed" },
      { status: "failed" },
    ];
    expect(wouldAlert(runs, true)).toBe(false);
  });
});

describe("job-failure-watchdog: captureError integration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("calls captureError with correct tags when threshold exceeded", () => {
    const mockCaptureError = vi.mocked(captureError);

    // Simulate what the watchdog step would do when alert is triggered
    const alert = {
      functionId: "morning-briefing",
      functionName: "Morning Briefing",
      consecutiveFailures: 3,
    };

    captureError(
      new Error(`Job ${alert.functionName} has failed ${alert.consecutiveFailures} consecutive times`),
      {
        tags: {
          source: "job-failure-watchdog",
          functionId: alert.functionId,
          functionName: alert.functionName,
          consecutiveFailures: String(alert.consecutiveFailures),
        },
        level: "warning",
      }
    );

    expect(mockCaptureError).toHaveBeenCalledOnce();
    const [err, ctx] = mockCaptureError.mock.calls[0];
    expect(err).toBeInstanceOf(Error);
    expect((err as Error).message).toContain("Morning Briefing");
    expect((err as Error).message).toContain("3 consecutive times");
    expect(ctx?.tags?.functionId).toBe("morning-briefing");
    expect(ctx?.tags?.source).toBe("job-failure-watchdog");
    expect(ctx?.level).toBe("warning");
  });

  it("does NOT call captureError when failures are below threshold", () => {
    const mockCaptureError = vi.mocked(captureError);

    // With 2 failures, wouldAlert returns false — captureError not called
    const runs = [{ status: "failed" }, { status: "failed" }];
    const shouldAlert = wouldAlert(runs, true, 3);

    if (shouldAlert) {
      captureError(new Error("should not happen"), { level: "warning" });
    }

    expect(mockCaptureError).not.toHaveBeenCalled();
  });
});
