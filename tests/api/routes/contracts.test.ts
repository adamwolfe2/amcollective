/**
 * API Route Tests — /api/contracts (GET, POST)
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
    id: "contract-001",
    contractNumber: "CONTRACT-001",
    clientId: CLIENT_ID,
    title: "Service Agreement",
    status: "draft",
    companyTag: "am_collective",
    token: "tok-abc",
    expiresAt: new Date(Date.now() + 30 * 86400000),
  },
]);

vi.mock("@/lib/db", () => ({
  db: {
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        leftJoin: vi.fn(() => ({
          orderBy: vi.fn(() => ({
            limit: vi.fn(() => Promise.resolve([])),
          })),
          where: vi.fn(() => ({
            limit: vi.fn(() => Promise.resolve([])),
          })),
        })),
        where: vi.fn(() => ({
          limit: vi.fn(() => Promise.resolve([])),
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

vi.mock("@/lib/invoices/number", () => ({
  generateContractNumber: vi.fn().mockResolvedValue("CONTRACT-2026-001"),
}));

vi.mock("@/lib/contracts/templates", () => ({
  buildSectionsFromProposal: vi.fn(() => []),
  DEFAULT_CONTRACT_SECTIONS: [{ heading: "Overview", body: "Terms..." }],
}));

vi.mock("@/lib/db/schema", async () => {
  const actual = await vi.importActual<typeof import("@/lib/db/schema")>("@/lib/db/schema");
  return {
    ...actual,
    contracts: {
      id: "id", clientId: "client_id", contractNumber: "contract_number",
      title: "title", status: "status", createdAt: "created_at",
    },
    clients: { id: "id", name: "name", companyName: "company_name", email: "email" },
    proposals: { id: "id" },
    COMPANY_TAGS: ["am_collective", "wholesail", "trackr", "cursive", "taskspace", "tbgc", "hook"],
  };
});

import { GET, POST } from "@/app/api/contracts/route";

// ─── Tests: GET /api/contracts ─────────────────────────────────────────────────

describe("GET /api/contracts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when not authenticated", async () => {
    mockCheckAdmin.mockResolvedValue(null);

    const response = await GET();

    expect(response.status).toBe(401);
    const body = await response.json();
    expect(body.error).toBe("Unauthorized");
  });

  it("returns 200 when authenticated", async () => {
    mockCheckAdmin.mockResolvedValue("user-abc");

    const response = await GET();

    expect(response.status).toBe(200);
  });
});

// ─── Tests: POST /api/contracts ────────────────────────────────────────────────

describe("POST /api/contracts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when not authenticated", async () => {
    mockCheckAdmin.mockResolvedValue(null);

    const request = new NextRequest("http://localhost/api/contracts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clientId: CLIENT_ID }),
    });

    const response = await POST(request);

    expect(response.status).toBe(401);
  });

  it("returns 400 when clientId is not a valid UUID", async () => {
    mockCheckAdmin.mockResolvedValue("user-abc");

    const request = new NextRequest("http://localhost/api/contracts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clientId: "not-a-uuid" }),
    });

    const response = await POST(request);

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toBe("Validation failed");
  });

  it("returns 400 when clientId is missing", async () => {
    mockCheckAdmin.mockResolvedValue("user-abc");

    const request = new NextRequest("http://localhost/api/contracts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "My Contract" }),
    });

    const response = await POST(request);

    expect(response.status).toBe(400);
  });

  it("returns 400 on malformed JSON", async () => {
    mockCheckAdmin.mockResolvedValue("user-abc");

    const request = new NextRequest("http://localhost/api/contracts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "bad json",
    });

    const response = await POST(request);

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toBe("Invalid JSON");
  });

  it("returns 201 and creates audit log on valid input", async () => {
    mockCheckAdmin.mockResolvedValue("user-abc");

    const request = new NextRequest("http://localhost/api/contracts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        clientId: CLIENT_ID,
        title: "Service Agreement Q2 2026",
        totalValue: 10000,
      }),
    });

    const response = await POST(request);

    expect(response.status).toBe(201);
    expect(mockCreateAuditLog).toHaveBeenCalledOnce();
    const auditArgs = mockCreateAuditLog.mock.calls[0][0];
    expect(auditArgs.action).toBe("contract.created");
    expect(auditArgs.entityType).toBe("contract");
    expect(auditArgs.metadata.contractNumber).toBeDefined();
  });

  it("rejects negative totalValue", async () => {
    mockCheckAdmin.mockResolvedValue("user-abc");

    const request = new NextRequest("http://localhost/api/contracts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clientId: CLIENT_ID, totalValue: -500 }),
    });

    const response = await POST(request);

    expect(response.status).toBe(400);
  });
});
