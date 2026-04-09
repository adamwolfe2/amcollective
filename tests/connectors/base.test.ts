/**
 * Connector Base Framework Tests
 *
 * Tests: cached(), safeCall(), getCachedAt(), invalidateCache()
 * All Redis and error-capture calls are mocked.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Mock Upstash Redis ────────────────────────────────────────────────────

const mockGet = vi.fn();
const mockSet = vi.fn();
const mockDel = vi.fn();

vi.mock("@upstash/redis", () => ({
  Redis: {
    fromEnv: vi.fn(() => ({
      get: mockGet,
      set: mockSet,
      del: mockDel,
    })),
  },
}));

vi.mock("@/lib/errors", () => ({
  captureError: vi.fn(),
}));

// Force Redis to be initialised by setting env vars before import
process.env.UPSTASH_REDIS_REST_URL = "https://redis.example.com";
process.env.UPSTASH_REDIS_REST_TOKEN = "token-abc";

// Dynamically import so the module-level singleton picks up the env vars
const { cached, safeCall, getCachedAt, invalidateCache } = await import(
  "@/lib/connectors/base"
);

describe("safeCall", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns success:true with data when the function resolves", async () => {
    const result = await safeCall(() => Promise.resolve({ value: 42 }));

    expect(result.success).toBe(true);
    expect(result.data).toEqual({ value: 42 });
    expect(result.fetchedAt).toBeInstanceOf(Date);
  });

  it("returns success:false with error message when the function throws", async () => {
    const result = await safeCall(() =>
      Promise.reject(new Error("network timeout"))
    );

    expect(result.success).toBe(false);
    expect(result.error).toBe("network timeout");
    expect(result.data).toBeUndefined();
  });

  it("captures non-Error throws as generic message", async () => {
    const result = await safeCall(() => Promise.reject("raw string error"));

    expect(result.success).toBe(false);
    expect(result.error).toBe("Unknown connector error");
  });

  it("calls captureError when the function throws", async () => {
    const { captureError } = await import("@/lib/errors");
    await safeCall(() => Promise.reject(new Error("boom")));

    expect(captureError).toHaveBeenCalledOnce();
  });
});

describe("cached", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns cached value from Redis when hit", async () => {
    mockGet.mockResolvedValueOnce({ d: { name: "cached" }, t: Date.now() });

    const fetcher = vi.fn(() => Promise.resolve({ name: "fresh" }));
    const result = await cached("test:key", fetcher, 300);

    expect(result).toEqual({ name: "cached" });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("calls fetcher on Redis cache miss and stores result", async () => {
    mockGet.mockResolvedValueOnce(null);
    mockSet.mockResolvedValue("OK");

    const fetcher = vi.fn(() => Promise.resolve({ name: "fresh" }));
    const result = await cached("test:miss", fetcher, 300);

    expect(result).toEqual({ name: "fresh" });
    expect(fetcher).toHaveBeenCalledOnce();
    // set is fire-and-forget; give the microtask queue a tick
    await Promise.resolve();
    expect(mockSet).toHaveBeenCalled();
  });

  it("falls through to fetcher when Redis get throws", async () => {
    mockGet.mockRejectedValueOnce(new Error("Redis down"));
    mockSet.mockResolvedValue("OK");

    const fetcher = vi.fn(() => Promise.resolve("fallback"));
    const result = await cached("test:error", fetcher, 60);

    expect(result).toBe("fallback");
    expect(fetcher).toHaveBeenCalledOnce();
  });
});

describe("getCachedAt", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns Date when entry exists in Redis with timestamp", async () => {
    const ts = Date.now();
    mockGet.mockResolvedValueOnce({ d: "data", t: ts });

    const result = await getCachedAt("some:key");

    expect(result).toBeInstanceOf(Date);
    expect(result!.getTime()).toBe(ts);
  });

  it("returns null when Redis returns null", async () => {
    mockGet.mockResolvedValueOnce(null);

    const result = await getCachedAt("missing:key");

    expect(result).toBeNull();
  });

  it("returns null when Redis throws", async () => {
    mockGet.mockRejectedValueOnce(new Error("connection refused"));

    const result = await getCachedAt("error:key");

    expect(result).toBeNull();
  });
});

describe("invalidateCache", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("calls redis.del with prefixed key", async () => {
    mockDel.mockResolvedValue(1);

    await invalidateCache("my:key");

    expect(mockDel).toHaveBeenCalledWith("amc:conn:my:key");
  });

  it("does not throw when Redis del rejects", async () => {
    mockDel.mockRejectedValueOnce(new Error("del failed"));

    await expect(invalidateCache("bad:key")).resolves.toBeUndefined();
  });
});
