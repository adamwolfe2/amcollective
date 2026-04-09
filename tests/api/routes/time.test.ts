/**
 * API Route Tests — /api/time (GET, POST)
 *
 * Tests: auth guard, Zod validation, happy path, audit log creation.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// ─── Hoisted mocks ────────────────────────────────────────────────────────────

const { mockCheckAdmin, mockCreateAuditLog } = vi.hoisted(() => ({
  mockCheckAdmin: vi.fn(),
  mockCreateAuditLog: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/auth", () => ({
  checkAdmin: mockCheckAdmin,
}));

// ─── DB mock ───────────────────────────────────────────────────────────────────

const CLIENT_ID = "550e8400-e29b-41d4-a716-446655440000";

const mockInsertReturning = vi.fn().mockResolvedValue([
  {
    id: "entry-001",
    clientId: CLIENT_ID,
    hours: "2",
    billable: true,
    date: new Date("2026-04-08"),
    companyTag: "am_collective",
    createdBy: "user-abc",
  },
]);

vi.mock("@/lib/db", () => ({
  db: {
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        leftJoin: vi.fn((_, __: unknown) => ({
          leftJoin: vi.fn((_2: unknown, __2: unknown) => ({
            leftJoin: vi.fn((_3: unknown, __3: unknown) => ({
              where: vi.fn(() => ({
                orderBy: vi.fn(() => ({
                  limit: vi.fn(() => Promise.resolve([])),
                })),
              })),
              orderBy: vi.fn(() => ({
                limit: vi.fn(() => Promise.resolve([])),
              })),
            })),
            where: vi.fn(() => ({
              orderBy: vi.fn(() => ({
                limit: vi.fn(() => Promise.resolve([])),
              })),
            })),
            orderBy: vi.fn(() => ({
              limit: vi.fn(() => Promise.resolve([])),
            })),
          })),
        })),
      })),
    })),
    insert: vi.fn(() => ({
      values: vi.fn(() => ({
        returning: mockInsertReturning,
      })),
    })),
  },
}));

vi.mock("@/lib/db/repositories/audit", () => ({
  createAuditLog: mockCreateAuditLog,
}));

vi.mock("@/lib/errors", () => ({ captureError: vi.fn() }));

vi.mock("@/lib/db/schema", async () => {
  const actual = await vi.importActual<typeof import("@/lib/db/schema")>("@/lib/db/schema");
  return {
    ...actual,
    timeEntries: {
      id: "id", clientId: "client_id", projectId: "project_id",
      teamMemberId: "team_member_id", date: "date", hours: "hours",
      billable: "billable", invoiceId: "invoice_id",
    },
    clients: { id: "id", name: "name" },
    portfolioProjects: { id: "id", name: "name" },
    teamMembers: { id: "id", name: "name" },
    COMPANY_TAGS: ["am_collective", "wholesail", "trackr", "cursive", "taskspace", "tbgc", "hook"],
  };
});

import { GET, POST } from "@/app/api/time/route";

// ─── Tests: GET /api/time ─────────────────────────────────────────────────────

describe("GET /api/time", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when not authenticated", async () => {
    mockCheckAdmin.mockResolvedValue(null);

    const request = new NextRequest("http://localhost/api/time");
    const response = await GET(request);

    expect(response.status).toBe(401);
    const body = await response.json();
    expect(body.error).toBe("Unauthorized");
  });

  it("returns 200 when authenticated", async () => {
    mockCheckAdmin.mockResolvedValue("user-abc");

    const request = new NextRequest("http://localhost/api/time");
    const response = await GET(request);

    expect(response.status).toBe(200);
  });
});

// ─── Tests: POST /api/time ─────────────────────────────────────────────────────

describe("POST /api/time", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when not authenticated", async () => {
    mockCheckAdmin.mockResolvedValue(null);

    const request = new NextRequest("http://localhost/api/time", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clientId: CLIENT_ID, date: "2026-04-08", hours: 2 }),
    });

    const response = await POST(request);

    expect(response.status).toBe(401);
  });

  it("returns 400 when clientId is missing", async () => {
    mockCheckAdmin.mockResolvedValue("user-abc");

    const request = new NextRequest("http://localhost/api/time", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ date: "2026-04-08", hours: 2 }),
    });

    const response = await POST(request);

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toBe("Validation failed");
  });

  it("returns 400 when clientId is not a valid UUID", async () => {
    mockCheckAdmin.mockResolvedValue("user-abc");

    const request = new NextRequest("http://localhost/api/time", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clientId: "not-a-uuid", date: "2026-04-08", hours: 2 }),
    });

    const response = await POST(request);

    expect(response.status).toBe(400);
  });

  it("returns 400 when date is missing", async () => {
    mockCheckAdmin.mockResolvedValue("user-abc");

    const request = new NextRequest("http://localhost/api/time", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clientId: CLIENT_ID, hours: 2 }),
    });

    const response = await POST(request);

    expect(response.status).toBe(400);
  });

  it("returns 400 when hours is 0", async () => {
    mockCheckAdmin.mockResolvedValue("user-abc");

    const request = new NextRequest("http://localhost/api/time", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clientId: CLIENT_ID, date: "2026-04-08", hours: 0 }),
    });

    const response = await POST(request);

    expect(response.status).toBe(400);
  });

  it("returns 400 when hours exceeds 24", async () => {
    mockCheckAdmin.mockResolvedValue("user-abc");

    const request = new NextRequest("http://localhost/api/time", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clientId: CLIENT_ID, date: "2026-04-08", hours: 25 }),
    });

    const response = await POST(request);

    expect(response.status).toBe(400);
  });

  it("returns 400 on malformed JSON", async () => {
    mockCheckAdmin.mockResolvedValue("user-abc");

    const request = new NextRequest("http://localhost/api/time", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{ broken",
    });

    const response = await POST(request);

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toBe("Invalid JSON");
  });

  it("returns 201 and creates audit log on valid input", async () => {
    mockCheckAdmin.mockResolvedValue("user-abc");

    const request = new NextRequest("http://localhost/api/time", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        clientId: CLIENT_ID,
        date: "2026-04-08",
        hours: 2.5,
        billable: true,
        hourlyRate: 150,
      }),
    });

    const response = await POST(request);

    expect(response.status).toBe(201);
    expect(mockCreateAuditLog).toHaveBeenCalledOnce();
    const auditArgs = mockCreateAuditLog.mock.calls[0][0];
    expect(auditArgs.action).toBe("time_entry.created");
    expect(auditArgs.entityType).toBe("time_entry");
    expect(auditArgs.metadata.clientId).toBe(CLIENT_ID);
    expect(auditArgs.metadata.hours).toBe(2.5);
    expect(auditArgs.metadata.billable).toBe(true);
  });

  it("rejects negative hourlyRate", async () => {
    mockCheckAdmin.mockResolvedValue("user-abc");

    const request = new NextRequest("http://localhost/api/time", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clientId: CLIENT_ID, date: "2026-04-08", hours: 2, hourlyRate: -50 }),
    });

    const response = await POST(request);

    expect(response.status).toBe(400);
  });
});
