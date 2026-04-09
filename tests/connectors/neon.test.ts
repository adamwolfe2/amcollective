/**
 * Neon Connector Tests
 *
 * Tests: getProjects(), getProjectUsage(), getDatabaseSize()
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/connectors/base", () => ({
  cached: vi.fn((_key: string, fn: () => unknown) => fn()),
  safeCall: vi.fn((fn: () => unknown) =>
    Promise.resolve(fn()).then(
      (data) => ({ success: true, data, fetchedAt: new Date() }),
      (err: Error) => ({ success: false, error: err.message, fetchedAt: new Date() })
    )
  ),
  CACHE_TTL: { REALTIME: 60, STANDARD: 300, STABLE: 1800, SLOW_MOVING: 3600 },
}));

vi.mock("@/lib/errors", () => ({ captureError: vi.fn() }));

import { getProjects, getProjectUsage, getDatabaseSize } from "@/lib/connectors/neon";

const MOCK_PROJECT = {
  id: "proj-abc",
  name: "amcollective",
  region_id: "us-east-2",
  created_at: "2024-01-01T00:00:00Z",
  updated_at: "2024-06-01T00:00:00Z",
  pg_version: 16,
};

describe("getProjects", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns success:false when NEON_API_KEY is not set", async () => {
    delete process.env.NEON_API_KEY;

    const result = await getProjects();

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/NEON_API_KEY/);
  });

  it("returns projects array on success", async () => {
    process.env.NEON_API_KEY = "test-key";
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ projects: [MOCK_PROJECT] }),
      })
    );

    const result = await getProjects();

    expect(result.success).toBe(true);
    expect(result.data).toHaveLength(1);
    expect(result.data![0].id).toBe("proj-abc");
    expect(result.data![0].pg_version).toBe(16);

    vi.unstubAllGlobals();
  });

  it("returns success:false on HTTP 401", async () => {
    process.env.NEON_API_KEY = "bad-key";
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        text: () => Promise.resolve("Unauthorized"),
      })
    );

    const result = await getProjects();

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/401/);

    vi.unstubAllGlobals();
  });

  it("includes Authorization header with bearer token", async () => {
    process.env.NEON_API_KEY = "neon-key-123";
    const mockFetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ projects: [] }),
    });
    vi.stubGlobal("fetch", mockFetchSpy);

    await getProjects();

    const callOptions = mockFetchSpy.mock.calls[0][1];
    expect((callOptions.headers as Record<string, string>).Authorization).toBe("Bearer neon-key-123");

    vi.unstubAllGlobals();
  });
});

describe("getProjectUsage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns success:false when NEON_API_KEY is missing", async () => {
    delete process.env.NEON_API_KEY;

    const result = await getProjectUsage("proj-abc");

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/NEON_API_KEY/);
  });

  it("returns usage metrics on success", async () => {
    process.env.NEON_API_KEY = "test-key";
    const USAGE = {
      compute_time_seconds: 3600,
      data_storage_bytes: 1_073_741_824,
      data_transfer_bytes: 10_000_000,
      written_data_bytes: 5_000_000,
    };
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(USAGE),
      })
    );

    const result = await getProjectUsage("proj-abc");

    expect(result.success).toBe(true);
    expect(result.data!.compute_time_seconds).toBe(3600);
    expect(result.data!.data_storage_bytes).toBe(1_073_741_824);

    vi.unstubAllGlobals();
  });
});

describe("getDatabaseSize", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns success:false when NEON_API_KEY is missing", async () => {
    delete process.env.NEON_API_KEY;

    const result = await getDatabaseSize("proj-abc");

    expect(result.success).toBe(false);
  });

  it("aggregates branch logical sizes and converts to MB", async () => {
    process.env.NEON_API_KEY = "test-key";
    const branches = [
      { logical_size: 1_048_576 }, // 1 MB
      { logical_size: 2_097_152 }, // 2 MB
    ];
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ branches }),
      })
    );

    const result = await getDatabaseSize("proj-abc");

    expect(result.success).toBe(true);
    expect(result.data!.sizeBytes).toBe(3_145_728);
    expect(result.data!.sizeMB).toBe(3);

    vi.unstubAllGlobals();
  });

  it("returns 0 bytes when no branches exist", async () => {
    process.env.NEON_API_KEY = "test-key";
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ branches: [] }),
      })
    );

    const result = await getDatabaseSize("proj-abc");

    expect(result.success).toBe(true);
    expect(result.data!.sizeBytes).toBe(0);
    expect(result.data!.sizeMB).toBe(0);

    vi.unstubAllGlobals();
  });
});
