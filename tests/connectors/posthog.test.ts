/**
 * PostHog Connector Tests
 *
 * Tests: getActiveUsers(), getTopEvents(), getPageviews(),
 *        getActiveUsersForProject(), getTopEventsForProject()
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

import {
  getActiveUsers,
  getTopEvents,
  getPageviews,
  getActiveUsersForProject,
  getTopEventsForProject,
} from "@/lib/connectors/posthog";

function posthogFetchOk(results: unknown[][]) {
  return vi.fn().mockResolvedValue({
    ok: true,
    json: () => Promise.resolve({ results }),
  });
}

function posthogFetchError(status = 403) {
  return vi.fn().mockResolvedValue({
    ok: false,
    status,
    text: () => Promise.resolve("Forbidden"),
  });
}

describe("getActiveUsers (global env wrapper)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns success:false when POSTHOG_PERSONAL_API_KEY is missing", async () => {
    delete process.env.POSTHOG_PERSONAL_API_KEY;
    delete process.env.POSTHOG_PROJECT_ID;

    const result = await getActiveUsers();

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/not configured/i);
  });

  it("maps HogQL results to DAU/WAU/MAU", async () => {
    process.env.POSTHOG_PERSONAL_API_KEY = "phx_key";
    process.env.POSTHOG_PROJECT_ID = "12345";

    vi.stubGlobal("fetch", posthogFetchOk([[120, 450, 1800]]));

    const result = await getActiveUsers();

    expect(result.success).toBe(true);
    expect(result.data!.dau).toBe(120);
    expect(result.data!.wau).toBe(450);
    expect(result.data!.mau).toBe(1800);

    vi.unstubAllGlobals();
  });

  it("defaults to 0 when results array is empty", async () => {
    process.env.POSTHOG_PERSONAL_API_KEY = "phx_key";
    process.env.POSTHOG_PROJECT_ID = "12345";

    vi.stubGlobal("fetch", posthogFetchOk([]));

    const result = await getActiveUsers();

    expect(result.success).toBe(true);
    expect(result.data!.dau).toBe(0);
    expect(result.data!.mau).toBe(0);

    vi.unstubAllGlobals();
  });

  it("returns success:false on HTTP 403", async () => {
    process.env.POSTHOG_PERSONAL_API_KEY = "phx_key";
    process.env.POSTHOG_PROJECT_ID = "12345";

    vi.stubGlobal("fetch", posthogFetchError(403));

    const result = await getActiveUsers();

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/403/);

    vi.unstubAllGlobals();
  });
});

describe("getTopEvents (global env wrapper)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns success:false when not configured", async () => {
    delete process.env.POSTHOG_PERSONAL_API_KEY;

    const result = await getTopEvents();

    expect(result.success).toBe(false);
  });

  it("maps event/count pairs from HogQL results", async () => {
    process.env.POSTHOG_PERSONAL_API_KEY = "phx_key";
    process.env.POSTHOG_PROJECT_ID = "12345";

    vi.stubGlobal(
      "fetch",
      posthogFetchOk([["$pageview", 5000], ["button_click", 1200]])
    );

    const result = await getTopEvents(2);

    expect(result.success).toBe(true);
    expect(result.data).toHaveLength(2);
    expect(result.data![0]).toEqual({ event: "$pageview", count: 5000 });
    expect(result.data![1]).toEqual({ event: "button_click", count: 1200 });

    vi.unstubAllGlobals();
  });
});

describe("getPageviews (global env wrapper)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns success:false when not configured", async () => {
    delete process.env.POSTHOG_PERSONAL_API_KEY;

    const result = await getPageviews();

    expect(result.success).toBe(false);
  });

  it("maps date/count pairs to PageviewTrend array", async () => {
    process.env.POSTHOG_PERSONAL_API_KEY = "phx_key";
    process.env.POSTHOG_PROJECT_ID = "12345";

    vi.stubGlobal(
      "fetch",
      posthogFetchOk([["2024-06-01", 300], ["2024-06-02", 450]])
    );

    const result = await getPageviews(7);

    expect(result.success).toBe(true);
    expect(result.data).toHaveLength(2);
    expect(result.data![0]).toEqual({ date: "2024-06-01", count: 300 });

    vi.unstubAllGlobals();
  });
});

describe("getActiveUsersForProject (per-project API)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("uses provided apiKey and projectId in Authorization header", async () => {
    const mockFetchSpy = posthogFetchOk([[10, 50, 200]]);
    vi.stubGlobal("fetch", mockFetchSpy);

    await getActiveUsersForProject("phx_project_key", "proj-999");

    const callOptions = mockFetchSpy.mock.calls[0][1];
    expect((callOptions.headers as Record<string, string>).Authorization).toBe("Bearer phx_project_key");

    const calledUrl: string = mockFetchSpy.mock.calls[0][0];
    expect(calledUrl).toContain("proj-999");

    vi.unstubAllGlobals();
  });

  it("returns correct DAU/WAU/MAU data", async () => {
    vi.stubGlobal("fetch", posthogFetchOk([[25, 100, 400]]));

    const result = await getActiveUsersForProject("key", "proj-123");

    expect(result.success).toBe(true);
    expect(result.data!.dau).toBe(25);
    expect(result.data!.wau).toBe(100);
    expect(result.data!.mau).toBe(400);

    vi.unstubAllGlobals();
  });
});

describe("getTopEventsForProject (per-project API)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns top events array for project", async () => {
    vi.stubGlobal(
      "fetch",
      posthogFetchOk([["login", 800], ["logout", 600]])
    );

    const result = await getTopEventsForProject("key", "proj-123", 5);

    expect(result.success).toBe(true);
    expect(result.data![0].event).toBe("login");
    expect(result.data![0].count).toBe(800);

    vi.unstubAllGlobals();
  });

  it("returns empty array when results are null/undefined", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ results: null }),
      })
    );

    const result = await getTopEventsForProject("key", "proj-123");

    expect(result.success).toBe(true);
    expect(result.data).toEqual([]);

    vi.unstubAllGlobals();
  });
});
