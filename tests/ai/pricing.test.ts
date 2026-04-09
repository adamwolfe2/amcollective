/**
 * Tests for AI pricing constants and cost calculation.
 * Written FIRST (TDD RED phase) before implementation.
 */

import { describe, it, expect } from "vitest";
import {
  MODEL_PRICING,
  calculateCostUsd,
  type TokenUsage,
} from "@/lib/ai/pricing";

describe("MODEL_PRICING", () => {
  it("contains claude-opus-4-6 rates", () => {
    expect(MODEL_PRICING["claude-opus-4-6"]).toBeDefined();
    expect(MODEL_PRICING["claude-opus-4-6"].inputPerMillion).toBe(15);
    expect(MODEL_PRICING["claude-opus-4-6"].outputPerMillion).toBe(75);
    expect(MODEL_PRICING["claude-opus-4-6"].cacheReadPerMillion).toBe(1.5);
    expect(MODEL_PRICING["claude-opus-4-6"].cacheWritePerMillion).toBe(18.75);
  });

  it("contains claude-sonnet-4-6 rates", () => {
    expect(MODEL_PRICING["claude-sonnet-4-6"]).toBeDefined();
    expect(MODEL_PRICING["claude-sonnet-4-6"].inputPerMillion).toBe(3);
    expect(MODEL_PRICING["claude-sonnet-4-6"].outputPerMillion).toBe(15);
    expect(MODEL_PRICING["claude-sonnet-4-6"].cacheReadPerMillion).toBe(0.3);
    expect(MODEL_PRICING["claude-sonnet-4-6"].cacheWritePerMillion).toBe(3.75);
  });

  it("contains claude-haiku-4-5 rates", () => {
    expect(MODEL_PRICING["claude-haiku-4-5"]).toBeDefined();
    expect(MODEL_PRICING["claude-haiku-4-5"].inputPerMillion).toBe(0.8);
    expect(MODEL_PRICING["claude-haiku-4-5"].outputPerMillion).toBe(4);
    expect(MODEL_PRICING["claude-haiku-4-5"].cacheReadPerMillion).toBe(0.08);
    expect(MODEL_PRICING["claude-haiku-4-5"].cacheWritePerMillion).toBe(1);
  });
});

describe("calculateCostUsd", () => {
  it("returns 0 for zero tokens", () => {
    const usage: TokenUsage = {
      inputTokens: 0,
      outputTokens: 0,
      cacheReadTokens: 0,
      cacheCreationTokens: 0,
    };
    expect(calculateCostUsd("claude-sonnet-4-6", usage)).toBe(0);
  });

  it("calculates input token cost correctly for sonnet", () => {
    // 1M input tokens at $3/M = $3.00
    const usage: TokenUsage = {
      inputTokens: 1_000_000,
      outputTokens: 0,
      cacheReadTokens: 0,
      cacheCreationTokens: 0,
    };
    expect(calculateCostUsd("claude-sonnet-4-6", usage)).toBeCloseTo(3, 5);
  });

  it("calculates output token cost correctly for sonnet", () => {
    // 1M output tokens at $15/M = $15.00
    const usage: TokenUsage = {
      inputTokens: 0,
      outputTokens: 1_000_000,
      cacheReadTokens: 0,
      cacheCreationTokens: 0,
    };
    expect(calculateCostUsd("claude-sonnet-4-6", usage)).toBeCloseTo(15, 5);
  });

  it("calculates cache read tokens correctly for sonnet", () => {
    // 1M cache read tokens at $0.30/M = $0.30
    const usage: TokenUsage = {
      inputTokens: 0,
      outputTokens: 0,
      cacheReadTokens: 1_000_000,
      cacheCreationTokens: 0,
    };
    expect(calculateCostUsd("claude-sonnet-4-6", usage)).toBeCloseTo(0.3, 5);
  });

  it("calculates cache creation tokens correctly for sonnet", () => {
    // 1M cache write tokens at $3.75/M = $3.75
    const usage: TokenUsage = {
      inputTokens: 0,
      outputTokens: 0,
      cacheReadTokens: 0,
      cacheCreationTokens: 1_000_000,
    };
    expect(calculateCostUsd("claude-sonnet-4-6", usage)).toBeCloseTo(3.75, 5);
  });

  it("calculates combined usage correctly", () => {
    // 100K input @ $3/M = $0.30
    // 50K output @ $15/M = $0.75
    // Total = $1.05
    const usage: TokenUsage = {
      inputTokens: 100_000,
      outputTokens: 50_000,
      cacheReadTokens: 0,
      cacheCreationTokens: 0,
    };
    expect(calculateCostUsd("claude-sonnet-4-6", usage)).toBeCloseTo(1.05, 5);
  });

  it("calculates combined usage with cache for opus", () => {
    // 10K input @ $15/M = $0.15
    // 5K output @ $75/M = $0.375
    // 20K cache read @ $1.5/M = $0.03
    // 8K cache write @ $18.75/M = $0.15
    // Total ≈ $0.705
    const usage: TokenUsage = {
      inputTokens: 10_000,
      outputTokens: 5_000,
      cacheReadTokens: 20_000,
      cacheCreationTokens: 8_000,
    };
    const cost = calculateCostUsd("claude-opus-4-6", usage);
    expect(cost).toBeCloseTo(0.705, 4);
  });

  it("returns result with 6 decimal precision", () => {
    const usage: TokenUsage = {
      inputTokens: 1,
      outputTokens: 0,
      cacheReadTokens: 0,
      cacheCreationTokens: 0,
    };
    // 1 token at $3/M = $0.000003
    const cost = calculateCostUsd("claude-sonnet-4-6", usage);
    expect(cost).toBe(0.000003);
  });

  it("throws for unknown model", () => {
    const usage: TokenUsage = {
      inputTokens: 100,
      outputTokens: 100,
      cacheReadTokens: 0,
      cacheCreationTokens: 0,
    };
    expect(() => calculateCostUsd("claude-unknown-99", usage)).toThrow();
  });

  it("throws with descriptive error for unknown model", () => {
    const usage: TokenUsage = {
      inputTokens: 100,
      outputTokens: 100,
      cacheReadTokens: 0,
      cacheCreationTokens: 0,
    };
    expect(() => calculateCostUsd("fake-model", usage)).toThrow(/fake-model/);
  });

  it("works with full model IDs that include date suffixes (haiku)", () => {
    // claude-haiku-4-5-20251001 maps to claude-haiku-4-5 key
    const usage: TokenUsage = {
      inputTokens: 1_000_000,
      outputTokens: 0,
      cacheReadTokens: 0,
      cacheCreationTokens: 0,
    };
    // Should resolve to $0.80/M
    expect(calculateCostUsd("claude-haiku-4-5", usage)).toBeCloseTo(0.8, 5);
  });

  it("handles haiku with small token count (precision check)", () => {
    // 500 input tokens at $0.80/M = 500 / 1_000_000 * 0.8 = 0.0004
    const usage: TokenUsage = {
      inputTokens: 500,
      outputTokens: 0,
      cacheReadTokens: 0,
      cacheCreationTokens: 0,
    };
    const cost = calculateCostUsd("claude-haiku-4-5", usage);
    // 500 / 1_000_000 * 0.8 = 0.0004
    expect(cost).toBeCloseTo(0.0004, 6);
  });
});
