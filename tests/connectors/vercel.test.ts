/**
 * Vercel Connector Tests
 *
 * Tests: getProjects(), getDeployments(), getRecentDeployments(),
 *        getProjectDetail(), getProjectDomains(), getPortfolioActivity(),
 *        redeployProject()
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
  invalidateCache: vi.fn(),
  CACHE_TTL: { REALTIME: 60, STANDARD: 300, STABLE: 1800, SLOW_MOVING: 3600 },
}));

vi.mock("@/lib/errors", () => ({ captureError: vi.fn() }));

import {
  getProjects,
  getDeployments,
  getRecentDeployments,
  getProjectDetail,
  getProjectDomains,
  getPortfolioActivity,
  redeployProject,
} from "@/lib/connectors/vercel";

const MOCK_PROJECT = {
  id: "prj_abc123",
  name: "my-app",
  framework: "nextjs",
  updatedAt: 1700000000000,
  createdAt: 1600000000000,
};

const MOCK_DEPLOYMENT = {
  uid: "dpl_xyz",
  name: "my-app",
  url: "my-app-abc.vercel.app",
  state: "READY" as const,
  created: 1700000000000,
};

function mockFetch(response: unknown, ok = true) {
  return vi.fn().mockResolvedValue({
    ok,
    status: ok ? 200 : 500,
    json: () => Promise.resolve(response),
    text: () => Promise.resolve(JSON.stringify(response)),
  });
}

describe("getProjects", () => {
  beforeEach(() => {
    process.env.VERCEL_API_TOKEN = "test-token";
    process.env.VERCEL_TEAM_ID = "team_abc";
    vi.clearAllMocks();
  });

  it("returns list of projects on success", async () => {
    vi.stubGlobal("fetch", mockFetch({ projects: [MOCK_PROJECT] }));

    const result = await getProjects();

    expect(result.success).toBe(true);
    expect(result.data).toHaveLength(1);
    expect(result.data![0].name).toBe("my-app");

    vi.unstubAllGlobals();
  });

  it("returns success:false on HTTP 5xx", async () => {
    vi.stubGlobal("fetch", mockFetch({ error: "server error" }, false));

    const result = await getProjects();

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/500/);

    vi.unstubAllGlobals();
  });

  it("throws when VERCEL_API_TOKEN is missing", async () => {
    delete process.env.VERCEL_API_TOKEN;
    vi.stubGlobal("fetch", vi.fn());

    const result = await getProjects();

    // safeCall catches the throw from getHeaders()
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/VERCEL_API_TOKEN/);

    vi.unstubAllGlobals();
  });
});

describe("getDeployments", () => {
  beforeEach(() => {
    process.env.VERCEL_API_TOKEN = "test-token";
    vi.clearAllMocks();
  });

  it("returns deployments for a project", async () => {
    vi.stubGlobal(
      "fetch",
      mockFetch({ deployments: [MOCK_DEPLOYMENT] })
    );

    const result = await getDeployments("prj_abc123");

    expect(result.success).toBe(true);
    expect(result.data![0].state).toBe("READY");

    vi.unstubAllGlobals();
  });
});

describe("getRecentDeployments", () => {
  beforeEach(() => {
    process.env.VERCEL_API_TOKEN = "test-token";
    vi.clearAllMocks();
  });

  it("includes teamId in request URL", async () => {
    process.env.VERCEL_TEAM_ID = "team_abc";
    const mockFetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ deployments: [] }),
    });
    vi.stubGlobal("fetch", mockFetchSpy);

    await getRecentDeployments(5);

    const url: string = mockFetchSpy.mock.calls[0][0];
    expect(url).toContain("teamId=team_abc");
    expect(url).toContain("limit=5");

    vi.unstubAllGlobals();
  });
});

describe("getProjectDetail", () => {
  beforeEach(() => {
    process.env.VERCEL_API_TOKEN = "test-token";
    vi.clearAllMocks();
  });

  it("returns project detail shape", async () => {
    const detail = {
      ...MOCK_PROJECT,
      nodeVersion: "20.x",
      buildCommand: "pnpm build",
      outputDirectory: ".next",
      rootDirectory: null,
    };
    vi.stubGlobal("fetch", mockFetch(detail));

    const result = await getProjectDetail("prj_abc123");

    expect(result.success).toBe(true);
    expect(result.data!.nodeVersion).toBe("20.x");

    vi.unstubAllGlobals();
  });
});

describe("getProjectDomains", () => {
  beforeEach(() => {
    process.env.VERCEL_API_TOKEN = "test-token";
    vi.clearAllMocks();
  });

  it("returns domain list", async () => {
    const domains = [
      { name: "example.com", verified: true, redirect: null, redirectStatusCode: null, gitBranch: "main" },
    ];
    vi.stubGlobal("fetch", mockFetch({ domains }));

    const result = await getProjectDomains("prj_abc123");

    expect(result.success).toBe(true);
    expect(result.data![0].name).toBe("example.com");
    expect(result.data![0].verified).toBe(true);

    vi.unstubAllGlobals();
  });
});

describe("getPortfolioActivity", () => {
  beforeEach(() => {
    process.env.VERCEL_API_TOKEN = "test-token";
    vi.clearAllMocks();
  });

  it("calculates success rate across all portfolio projects", async () => {
    const knownProjectId = "prj_pWERrQuAlX8doYVNcMl0LrsqQuRT"; // AM Collective
    const projects = [{ ...MOCK_PROJECT, id: knownProjectId }];
    const deployments = [
      { ...MOCK_DEPLOYMENT, state: "READY" },
      { ...MOCK_DEPLOYMENT, uid: "dpl2", state: "ERROR" },
    ];

    const mockFetchSpy = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ projects }) })
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ deployments }) });

    vi.stubGlobal("fetch", mockFetchSpy);

    const result = await getPortfolioActivity();

    expect(result.success).toBe(true);
    expect(result.data!.totalDeploys).toBe(2);
    expect(result.data!.failedDeploys).toBe(1);
    expect(result.data!.successRate).toBe(50);

    vi.unstubAllGlobals();
  });

  it("handles 100% success rate when no failures", async () => {
    const knownProjectId = "prj_pWERrQuAlX8doYVNcMl0LrsqQuRT";
    const projects = [{ ...MOCK_PROJECT, id: knownProjectId }];
    const deployments = [{ ...MOCK_DEPLOYMENT, state: "READY" }];

    vi.stubGlobal(
      "fetch",
      vi.fn()
        .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ projects }) })
        .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ deployments }) })
    );

    const result = await getPortfolioActivity();

    expect(result.data!.successRate).toBe(100);

    vi.unstubAllGlobals();
  });
});

describe("redeployProject", () => {
  beforeEach(() => {
    process.env.VERCEL_API_TOKEN = "test-token";
    vi.clearAllMocks();
  });

  it("returns success:false when VERCEL_API_TOKEN is missing", async () => {
    delete process.env.VERCEL_API_TOKEN;

    const result = await redeployProject("prj_abc123");

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/VERCEL_API_TOKEN/);
  });

  it("returns success:false when no existing deployments found", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ deployments: [] }),
      })
    );

    const result = await redeployProject("prj_abc123");

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/No deployments/);

    vi.unstubAllGlobals();
  });

  it("returns new deployment on success", async () => {
    const newDeployment = { ...MOCK_DEPLOYMENT, uid: "dpl_new" };

    vi.stubGlobal(
      "fetch",
      vi.fn()
        // First call: getDeployments (list)
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ deployments: [MOCK_DEPLOYMENT] }),
        })
        // Second call: POST redeploy
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(newDeployment),
        })
    );

    const result = await redeployProject("prj_abc123");

    expect(result.success).toBe(true);
    expect(result.data!.uid).toBe("dpl_new");

    vi.unstubAllGlobals();
  });
});
