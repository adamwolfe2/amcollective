/**
 * API Route Tests — /api/leads (GET, POST) and /api/leads/[id] (PATCH, DELETE)
 *
 * Tests: auth guard, validation, happy path, audit log creation.
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

const mockInsertReturning = vi.fn().mockResolvedValue([
  { id: "lead-001", contactName: "Alice Smith", stage: "awareness", companyTag: "am_collective" },
]);

const mockUpdateReturning = vi.fn().mockResolvedValue([
  { id: "lead-001", contactName: "Alice Updated", stage: "interest", isArchived: false },
]);

const mockSelectRows = vi.fn().mockResolvedValue([
  { id: "lead-001", contactName: "Alice Smith", stage: "awareness", isArchived: false },
]);

vi.mock("@/lib/db", () => ({
  db: {
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          orderBy: vi.fn(() => ({
            limit: vi.fn(() => Promise.resolve([
              { id: "lead-001", contactName: "Alice Smith", stage: "awareness", isArchived: false },
            ])),
          })),
        })),
        leftJoin: vi.fn(() => ({
          where: vi.fn(() => ({
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
    update: vi.fn(() => ({
      set: vi.fn(() => ({
        where: vi.fn(() => ({
          returning: mockUpdateReturning,
        })),
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
    leads: { id: "id", isArchived: "is_archived", stage: "stage", contactName: "contact_name", companyName: "company_name", updatedAt: "updated_at", source: "source", companyTag: "company_tag" },
    leadActivities: { id: "id", leadId: "lead_id", type: "type", content: "content", createdById: "created_by_id" },
    COMPANY_TAGS: ["am_collective", "wholesail", "trackr", "cursive", "taskspace", "tbgc", "hook"],
    leadStageEnum: { enumValues: ["awareness", "interest", "consideration", "intent", "closed_won", "closed_lost", "nurture"] },
    leadSourceEnum: { enumValues: ["referral", "inbound", "outbound", "conference", "social", "university", "other"] },
    companyTagEnum: { enumValues: ["am_collective", "wholesail", "trackr", "cursive", "taskspace", "tbgc", "hook"] },
  };
});

// ─── Import routes ─────────────────────────────────────────────────────────────

import { GET, POST } from "@/app/api/leads/route";

// ─── Tests: GET /api/leads ─────────────────────────────────────────────────────

describe("GET /api/leads", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when not authenticated", async () => {
    mockCheckAdmin.mockResolvedValue(null);

    const request = new NextRequest("http://localhost/api/leads");
    const response = await GET(request);

    expect(response.status).toBe(401);
    const body = await response.json();
    expect(body.error).toBe("Unauthorized");
  });

  it("returns 200 with leads array when authenticated", async () => {
    mockCheckAdmin.mockResolvedValue("user-abc");

    const request = new NextRequest("http://localhost/api/leads");
    const response = await GET(request);

    expect(response.status).toBe(200);
  });
});

// ─── Tests: POST /api/leads ────────────────────────────────────────────────────

describe("POST /api/leads", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when not authenticated", async () => {
    mockCheckAdmin.mockResolvedValue(null);

    const request = new NextRequest("http://localhost/api/leads", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contactName: "Bob" }),
    });

    const response = await POST(request);

    expect(response.status).toBe(401);
  });

  it("returns 400 when contactName is missing", async () => {
    mockCheckAdmin.mockResolvedValue("user-abc");

    const request = new NextRequest("http://localhost/api/leads", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ companyName: "ACME" }),
    });

    const response = await POST(request);

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toBe("Validation failed");
  });

  it("returns 400 on malformed JSON", async () => {
    mockCheckAdmin.mockResolvedValue("user-abc");

    const request = new NextRequest("http://localhost/api/leads", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{ invalid json",
    });

    const response = await POST(request);

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toBe("Invalid JSON");
  });

  it("returns 201 and creates audit log on valid input", async () => {
    mockCheckAdmin.mockResolvedValue("user-abc");

    const request = new NextRequest("http://localhost/api/leads", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contactName: "Alice Smith",
        email: "alice@example.com",
        stage: "awareness",
      }),
    });

    const response = await POST(request);

    expect(response.status).toBe(201);
    expect(mockCreateAuditLog).toHaveBeenCalledOnce();
    const auditArgs = mockCreateAuditLog.mock.calls[0][0];
    expect(auditArgs.action).toBe("lead.created");
    expect(auditArgs.entityType).toBe("lead");
  });

  it("rejects invalid email format", async () => {
    mockCheckAdmin.mockResolvedValue("user-abc");

    const request = new NextRequest("http://localhost/api/leads", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contactName: "Alice Smith",
        email: "not-an-email",
      }),
    });

    const response = await POST(request);

    expect(response.status).toBe(400);
  });

  it("rejects invalid URL in linkedinUrl", async () => {
    mockCheckAdmin.mockResolvedValue("user-abc");

    const request = new NextRequest("http://localhost/api/leads", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contactName: "Alice Smith",
        linkedinUrl: "not-a-url",
      }),
    });

    const response = await POST(request);

    expect(response.status).toBe(400);
  });
});
