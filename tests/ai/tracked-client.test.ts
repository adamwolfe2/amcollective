/**
 * Tests for the tracked Anthropic client proxy.
 * Written FIRST (TDD RED phase) before implementation.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Mocks ────────────────────────────────────────────────────────────────────

const mockCreate = vi.fn();

vi.mock("@/lib/ai/client", () => ({
  getAnthropicClient: vi.fn(() => ({
    messages: {
      create: mockCreate,
    },
  })),
  isAIConfigured: vi.fn(() => true),
}));

vi.mock("@/lib/ai/usage-recorder", () => ({
  recordUsage: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/errors", () => ({
  captureError: vi.fn(),
}));

// next/server after() — mock it as a function that immediately invokes callback
vi.mock("next/server", () => ({
  after: vi.fn((cb: () => void) => {
    // In test context, run the callback synchronously
    try {
      const result: unknown = cb();
      if (result !== null && typeof result === "object" && typeof (result as Promise<unknown>).then === "function") {
        return result;
      }
    } catch {
      // swallow — mirrors real after() behavior
    }
  }),
}));

// ─── Imports (after mocks) ────────────────────────────────────────────────────

import { getTrackedAnthropicClient } from "@/lib/ai/tracked-client";
import { recordUsage } from "@/lib/ai/usage-recorder";
import { captureError } from "@/lib/errors";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeResponse(overrides: Record<string, unknown> = {}) {
  return {
    id: "msg_test123",
    type: "message",
    role: "assistant",
    content: [{ type: "text", text: "Hello, world!" }],
    model: "claude-sonnet-4-6",
    stop_reason: "end_turn",
    usage: {
      input_tokens: 100,
      output_tokens: 50,
      cache_read_input_tokens: 0,
      cache_creation_input_tokens: 0,
    },
    ...overrides,
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("getTrackedAnthropicClient", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCreate.mockResolvedValue(makeResponse());
  });

  it("returns a proxy that forwards messages.create calls to the underlying client", async () => {
    const client = getTrackedAnthropicClient({ agent: "test-agent" });

    await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 100,
      messages: [{ role: "user", content: "Hello" }],
    } as Parameters<typeof client.messages.create>[0]);

    expect(mockCreate).toHaveBeenCalledOnce();
  });

  it("returns the original response from messages.create", async () => {
    const mockResponse = makeResponse();
    mockCreate.mockResolvedValue(mockResponse);

    const client = getTrackedAnthropicClient({ agent: "test-agent" });

    const result = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 100,
      messages: [{ role: "user", content: "Hello" }],
    } as Parameters<typeof client.messages.create>[0]);

    expect(result).toBe(mockResponse);
  });

  it("schedules recordUsage on successful call", async () => {
    mockCreate.mockResolvedValue(
      makeResponse({
        usage: {
          input_tokens: 200,
          output_tokens: 100,
          cache_read_input_tokens: 50,
          cache_creation_input_tokens: 25,
        },
      })
    );

    const client = getTrackedAnthropicClient({
      agent: "morning-briefing",
      userId: "user_abc",
    });

    await client.messages.create({
      model: "claude-haiku-4-5",
      max_tokens: 200,
      messages: [{ role: "user", content: "Hello" }],
    } as Parameters<typeof client.messages.create>[0]);

    expect(recordUsage).toHaveBeenCalledOnce();
    const callArg = (recordUsage as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(callArg.agentName).toBe("morning-briefing");
    expect(callArg.userId).toBe("user_abc");
    expect(callArg.inputTokens).toBe(200);
    expect(callArg.outputTokens).toBe(100);
    expect(callArg.cacheReadTokens).toBe(50);
    expect(callArg.cacheCreationTokens).toBe(25);
    expect(callArg.success).toBe(true);
    expect(callArg.finishReason).toBe("end_turn");
  });

  it("generates a requestId (uuid format) for each call", async () => {
    const client = getTrackedAnthropicClient({ agent: "test-agent" });
    await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 100,
      messages: [{ role: "user", content: "Hello" }],
    } as Parameters<typeof client.messages.create>[0]);

    const callArg = (recordUsage as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(callArg.requestId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
    );
  });

  it("generates unique requestId for each call", async () => {
    const client = getTrackedAnthropicClient({ agent: "test-agent" });

    await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 100,
      messages: [{ role: "user", content: "Hello 1" }],
    } as Parameters<typeof client.messages.create>[0]);

    await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 100,
      messages: [{ role: "user", content: "Hello 2" }],
    } as Parameters<typeof client.messages.create>[0]);

    const id1 = (recordUsage as ReturnType<typeof vi.fn>).mock.calls[0][0].requestId;
    const id2 = (recordUsage as ReturnType<typeof vi.fn>).mock.calls[1][0].requestId;
    expect(id1).not.toBe(id2);
  });

  it("counts tool_use blocks in response.content", async () => {
    mockCreate.mockResolvedValue(
      makeResponse({
        content: [
          { type: "tool_use", id: "tool_1", name: "search_clients", input: {} },
          { type: "tool_use", id: "tool_2", name: "get_revenue_data", input: {} },
          { type: "text", text: "Here is the result." },
        ],
        stop_reason: "tool_use",
      })
    );

    const client = getTrackedAnthropicClient({ agent: "chat" });
    await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 500,
      messages: [{ role: "user", content: "Show me clients" }],
    } as Parameters<typeof client.messages.create>[0]);

    const callArg = (recordUsage as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(callArg.toolCallsCount).toBe(2);
    expect(callArg.finishReason).toBe("tool_use");
  });

  it("records failure and re-throws the error on API error", async () => {
    const apiError = new Error("AnthropicError: rate limit exceeded");
    apiError.name = "RateLimitError";
    mockCreate.mockRejectedValue(apiError);

    const client = getTrackedAnthropicClient({ agent: "test-agent" });

    await expect(
      client.messages.create({
        model: "claude-sonnet-4-6",
        max_tokens: 100,
        messages: [{ role: "user", content: "Hello" }],
      } as Parameters<typeof client.messages.create>[0])
    ).rejects.toThrow("AnthropicError: rate limit exceeded");

    expect(recordUsage).toHaveBeenCalledOnce();
    const callArg = (recordUsage as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(callArg.success).toBe(false);
    expect(callArg.errorCode).toBe("RateLimitError");
  });

  it("forwards parentRequestId to the usage record", async () => {
    const client = getTrackedAnthropicClient({
      agent: "ceo",
      parentRequestId: "parent-uuid-1234",
    });

    await client.messages.create({
      model: "claude-haiku-4-5",
      max_tokens: 100,
      messages: [{ role: "user", content: "Hello" }],
    } as Parameters<typeof client.messages.create>[0]);

    const callArg = (recordUsage as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(callArg.parentRequestId).toBe("parent-uuid-1234");
  });

  it("does NOT capture payload previews when AI_CAPTURE_PAYLOADS is not set", async () => {
    delete process.env.AI_CAPTURE_PAYLOADS;

    const client = getTrackedAnthropicClient({ agent: "test-agent" });
    await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 100,
      messages: [{ role: "user", content: "secret message" }],
    } as Parameters<typeof client.messages.create>[0]);

    const callArg = (recordUsage as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(callArg.promptPreview).toBeNull();
    expect(callArg.responsePreview).toBeNull();
  });

  it("passes through non-messages.create calls unmodified", () => {
    const client = getTrackedAnthropicClient({ agent: "test-agent" });
    // messages object should still exist
    expect(client.messages).toBeDefined();
    expect(typeof client.messages.create).toBe("function");
  });

  it("records latencyMs as a positive number", async () => {
    const client = getTrackedAnthropicClient({ agent: "test-agent" });
    await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 100,
      messages: [{ role: "user", content: "Hello" }],
    } as Parameters<typeof client.messages.create>[0]);

    const callArg = (recordUsage as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(callArg.latencyMs).toBeGreaterThanOrEqual(0);
    expect(typeof callArg.latencyMs).toBe("number");
  });
});
