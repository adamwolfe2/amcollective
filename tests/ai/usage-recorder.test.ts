/**
 * Tests for the AI usage recorder (write path).
 * Written FIRST (TDD RED phase) before implementation.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Mocks ────────────────────────────────────────────────────────────────────

vi.mock("@/lib/db", () => ({
  db: {
    insert: vi.fn(() => ({
      values: vi.fn().mockResolvedValue([]),
    })),
  },
}));

vi.mock("@/lib/errors", () => ({
  captureError: vi.fn(),
}));

// ─── Imports (after mocks) ────────────────────────────────────────────────────

import { recordUsage, type RecordUsageInput } from "@/lib/ai/usage-recorder";
import { db } from "@/lib/db";
import { captureError } from "@/lib/errors";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeInput(overrides: Partial<RecordUsageInput> = {}): RecordUsageInput {
  return {
    agentName: "test-agent",
    model: "claude-sonnet-4-6",
    userId: "user_123",
    organizationId: null,
    inputTokens: 1000,
    outputTokens: 500,
    cacheReadTokens: 0,
    cacheCreationTokens: 0,
    latencyMs: 1200,
    success: true,
    errorCode: null,
    requestId: "00000000-0000-0000-0000-000000000001",
    parentRequestId: null,
    toolCallsCount: 0,
    finishReason: "end_turn",
    promptPreview: null,
    responsePreview: null,
    metadata: null,
    ...overrides,
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("recordUsage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Re-setup the mock chain after clearAllMocks
    (db.insert as ReturnType<typeof vi.fn>).mockReturnValue({
      values: vi.fn().mockResolvedValue([]),
    });
  });

  it("inserts a row into aiUsage table", async () => {
    await recordUsage(makeInput());

    expect(db.insert).toHaveBeenCalledOnce();
  });

  it("computes cost from raw token counts, not from caller", async () => {
    const valuesMock = vi.fn().mockResolvedValue([]);
    (db.insert as ReturnType<typeof vi.fn>).mockReturnValue({
      values: valuesMock,
    });

    await recordUsage(
      makeInput({
        model: "claude-sonnet-4-6",
        inputTokens: 1_000_000, // $3 at sonnet rates
        outputTokens: 0,
        cacheReadTokens: 0,
        cacheCreationTokens: 0,
      })
    );

    expect(valuesMock).toHaveBeenCalledOnce();
    const insertedRow = valuesMock.mock.calls[0][0];
    // $3.00 for 1M input tokens at sonnet pricing
    expect(Number(insertedRow.totalCostUsd)).toBeCloseTo(3, 4);
  });

  it("includes all required fields in the inserted row", async () => {
    const valuesMock = vi.fn().mockResolvedValue([]);
    (db.insert as ReturnType<typeof vi.fn>).mockReturnValue({
      values: valuesMock,
    });

    const input = makeInput({
      agentName: "morning-briefing",
      model: "claude-haiku-4-5",
      userId: "user_abc",
      latencyMs: 800,
      toolCallsCount: 3,
      finishReason: "tool_use",
    });

    await recordUsage(input);

    const row = valuesMock.mock.calls[0][0];
    expect(row.agentName).toBe("morning-briefing");
    expect(row.model).toBe("claude-haiku-4-5");
    expect(row.userId).toBe("user_abc");
    expect(row.latencyMs).toBe(800);
    expect(row.toolCallsCount).toBe(3);
    expect(row.finishReason).toBe("tool_use");
    expect(row.success).toBe(true);
    expect(row.requestId).toBe("00000000-0000-0000-0000-000000000001");
  });

  it("does NOT throw when the DB insert fails", async () => {
    (db.insert as ReturnType<typeof vi.fn>).mockReturnValue({
      values: vi.fn().mockRejectedValue(new Error("DB connection refused")),
    });

    // Should resolve without throwing
    await expect(recordUsage(makeInput())).resolves.toBeUndefined();
  });

  it("calls captureError with correct tag when DB insert fails", async () => {
    const dbError = new Error("DB connection refused");
    (db.insert as ReturnType<typeof vi.fn>).mockReturnValue({
      values: vi.fn().mockRejectedValue(dbError),
    });

    await recordUsage(makeInput());

    expect(captureError).toHaveBeenCalledOnce();
    const [err, ctx] = (captureError as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(err).toBe(dbError);
    expect(ctx.tags).toMatchObject({ source: "ai_usage_write_failed" });
  });

  it("records failed requests (success=false) with error code", async () => {
    const valuesMock = vi.fn().mockResolvedValue([]);
    (db.insert as ReturnType<typeof vi.fn>).mockReturnValue({
      values: valuesMock,
    });

    await recordUsage(
      makeInput({
        success: false,
        errorCode: "AuthenticationError",
        inputTokens: 0,
        outputTokens: 0,
      })
    );

    const row = valuesMock.mock.calls[0][0];
    expect(row.success).toBe(false);
    expect(row.errorCode).toBe("AuthenticationError");
  });

  it("handles null userId for system/cron jobs", async () => {
    const valuesMock = vi.fn().mockResolvedValue([]);
    (db.insert as ReturnType<typeof vi.fn>).mockReturnValue({
      values: valuesMock,
    });

    await recordUsage(makeInput({ userId: undefined }));

    const row = valuesMock.mock.calls[0][0];
    expect(row.userId).toBeUndefined();
  });

  it("computes cost correctly for opus model", async () => {
    const valuesMock = vi.fn().mockResolvedValue([]);
    (db.insert as ReturnType<typeof vi.fn>).mockReturnValue({
      values: valuesMock,
    });

    await recordUsage(
      makeInput({
        model: "claude-opus-4-6",
        inputTokens: 10_000,   // 10K @ $15/M = $0.15
        outputTokens: 5_000,   // 5K @ $75/M = $0.375
        cacheReadTokens: 0,
        cacheCreationTokens: 0,
      })
    );

    const row = valuesMock.mock.calls[0][0];
    expect(Number(row.totalCostUsd)).toBeCloseTo(0.525, 5);
  });
});
