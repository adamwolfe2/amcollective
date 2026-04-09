/**
 * API Route Tests — /api/admin/jobs and /api/admin/jobs/[id]/runs
 *
 * Verifies:
 * - 401 for unauthenticated requests
 * - 200 with job data for admin users
 * - 404 for unknown function IDs
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// ─── Mock auth ───────────────────────────────────────────────────────────────

vi.mock("@/lib/auth", () => ({
  checkAdmin: vi.fn(),
}));

// ─── Mock DB ─────────────────────────────────────────────────────────────────

vi.mock("@/lib/db", () => ({
  db: {
    select: vi.fn(),
    selectDistinctOn: vi.fn(),
    execute: vi.fn(),
  },
}));

vi.mock("@/lib/db/schema/inngest", () => ({
  inngestRunHistory: {
    functionId: "function_id",
    status: "status",
    startedAt: "started_at",
    completedAt: "completed_at",
    durationMs: "duration_ms",
    error: "error",
    attemptNumber: "attempt_number",
    runId: "run_id",
    trigger: "trigger",
    id: "id",
  },
}));

vi.mock("drizzle-orm", () => ({
  desc: vi.fn((col) => col),
  eq: vi.fn((col, val) => ({ col, val })),
  gte: vi.fn((col, val) => ({ col, val })),
  and: vi.fn((...args) => args),
  sql: Object.assign(
    (strings: TemplateStringsArray) => ({ strings }),
    { raw: vi.fn() }
  ),
}));

// ─── Import after mocks ──────────────────────────────────────────────────────

import { GET as jobsGET } from "@/app/api/admin/jobs/route";
import { GET as runsGET } from "@/app/api/admin/jobs/[id]/runs/route";
import { checkAdmin } from "@/lib/auth";
import { db } from "@/lib/db";

const mockCheckAdmin = vi.mocked(checkAdmin);
const mockDb = vi.mocked(db);

function makeSelectDistinctResult(): ReturnType<typeof db.selectDistinctOn> {
  const chain = {
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockResolvedValue([]),
  };
  return chain as never;
}

function makeSelectResult(rows: unknown[] = []): ReturnType<typeof db.select> {
  const chain = {
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    groupBy: vi.fn().mockResolvedValue(rows),
    orderBy: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue(rows),
  };
  return chain as never;
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("GET /api/admin/jobs", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDb.selectDistinctOn.mockReturnValue(makeSelectDistinctResult());
    mockDb.select.mockReturnValue(makeSelectResult());
    mockDb.execute.mockResolvedValue({ rows: [] } as never);
  });

  it("returns 401 when not authenticated", async () => {
    mockCheckAdmin.mockResolvedValue(null);
    const res = await jobsGET();
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe("Unauthorized");
  });

  it("returns 200 with jobs array for admin", async () => {
    mockCheckAdmin.mockResolvedValue("user-123");
    const res = await jobsGET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty("jobs");
    expect(Array.isArray(body.jobs)).toBe(true);
    expect(body.jobs.length).toBeGreaterThanOrEqual(40);
  });

  it("jobs array includes required fields", async () => {
    mockCheckAdmin.mockResolvedValue("user-123");
    const res = await jobsGET();
    expect(res.status).toBe(200);
    const body = await res.json();
    const job = body.jobs[0];
    expect(job).toHaveProperty("id");
    expect(job).toHaveProperty("name");
    expect(job).toHaveProperty("lastRunAt");
    expect(job).toHaveProperty("lastRunStatus");
    expect(job).toHaveProperty("successRate24h");
    expect(job).toHaveProperty("p50Ms");
    expect(job).toHaveProperty("p95Ms");
    expect(job).toHaveProperty("retries24h");
  });
});

describe("GET /api/admin/jobs/[id]/runs", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDb.select.mockReturnValue(makeSelectResult());
  });

  function makeRequest(id: string): NextRequest {
    return new NextRequest(`http://localhost/api/admin/jobs/${id}/runs`);
  }

  it("returns 401 when not authenticated", async () => {
    mockCheckAdmin.mockResolvedValue(null);
    const res = await runsGET(makeRequest("morning-briefing"), {
      params: Promise.resolve({ id: "morning-briefing" }),
    });
    expect(res.status).toBe(401);
  });

  it("returns 404 for unknown function ID", async () => {
    mockCheckAdmin.mockResolvedValue("user-123");
    const res = await runsGET(makeRequest("does-not-exist"), {
      params: Promise.resolve({ id: "does-not-exist" }),
    });
    expect(res.status).toBe(404);
  });

  it("returns 200 with runs array for valid function", async () => {
    mockCheckAdmin.mockResolvedValue("user-123");
    const res = await runsGET(makeRequest("morning-briefing"), {
      params: Promise.resolve({ id: "morning-briefing" }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty("functionId", "morning-briefing");
    expect(body).toHaveProperty("runs");
    expect(Array.isArray(body.runs)).toBe(true);
  });
});
