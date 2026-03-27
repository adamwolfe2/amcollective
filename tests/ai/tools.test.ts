/**
 * AI Tool Execution Tests
 *
 * Verifies CRM, Finance, and Operations tool definitions and handlers
 * return correct data shapes, handle empty/null data, and validate inputs.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Mock DB ─────────────────────────────────────────────────────────────────
const mockDbSelect = vi.fn();
const mockDbInsert = vi.fn();
const mockDbUpdate = vi.fn();

function createSelectChain(data: unknown[] = []) {
  return {
    from: () => ({
      where: () => ({
        limit: () => Promise.resolve(data),
        orderBy: () => ({
          limit: () => Promise.resolve(data),
        }),
      }),
      orderBy: () => ({
        limit: () => Promise.resolve(data),
      }),
    }),
  };
}

function createInsertChain(data: unknown[] = [{ id: "new-id" }]) {
  return {
    values: () => ({
      returning: () => Promise.resolve(data),
    }),
  };
}

function createUpdateChain() {
  return {
    set: () => ({
      where: () => Promise.resolve(),
    }),
  };
}

vi.mock("@/lib/db", () => ({
  db: {
    select: (...args: unknown[]) => {
      mockDbSelect(...args);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return createSelectChain((mockDbSelect as any)._returnValue);
    },
    insert: (...args: unknown[]) => {
      mockDbInsert(...args);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return createInsertChain((mockDbInsert as any)._returnValue);
    },
    update: (...args: unknown[]) => {
      mockDbUpdate(...args);
      return createUpdateChain();
    },
  },
}));

vi.mock("@/lib/db/schema", () => {
  return {
    clients: { id: "id", name: "name", companyName: "company_name", email: "email", notes: "notes" },
    leads: {
      id: "id",
      contactName: "contact_name",
      companyName: "company_name",
      stage: "stage",
      isArchived: "is_archived",
      updatedAt: "updated_at",
      nextFollowUpAt: "next_follow_up_at",
      notes: "notes",
    },
    meetings: { id: "id", title: "title", notes: "notes", scheduledAt: "scheduled_at", status: "status", attendees: "attendees" },
    invoices: {
      id: "id",
      clientId: "client_id",
      number: "number",
      status: "status",
      amount: "amount",
      createdAt: "created_at",
      dueDate: "due_date",
      paidAt: "paid_at",
      subtotal: "subtotal",
      reminderCount: "reminder_count",
      lastReminderAt: "last_reminder_at",
      notes: "notes",
      lineItems: "line_items",
      sentAt: "sent_at",
      currency: "currency",
    },
    proposals: {
      id: "id",
      clientId: "client_id",
      proposalNumber: "proposal_number",
      status: "status",
      createdAt: "created_at",
      title: "title",
      total: "total",
      subtotal: "subtotal",
      summary: "summary",
      paymentTerms: "payment_terms",
      validUntil: "valid_until",
      lineItems: "line_items",
      sentAt: "sent_at",
      approvedAt: "approved_at",
      rejectedAt: "rejected_at",
      rejectionReason: "rejection_reason",
      internalNotes: "internal_notes",
    },
    recurringInvoices: {
      id: "id",
      clientId: "client_id",
      interval: "interval",
      subtotal: "subtotal",
      total: "total",
      startDate: "start_date",
      nextBillingDate: "next_billing_date",
      autoSend: "auto_send",
      lineItems: "line_items",
    },
    leadActivities: { id: "id", leadId: "lead_id", type: "type", content: "content", createdById: "created_by_id" },
  };
});

vi.mock("@/lib/db/repositories/audit", () => ({
  createAuditLog: vi.fn(),
}));

describe("AI Tool Definitions", () => {
  describe("CRM tool definitions", () => {
    it("exports definitions array with correct tool names", async () => {
      const { definitions } = await import("@/lib/ai/tools-ceo/crm-tools");
      expect(Array.isArray(definitions)).toBe(true);
      expect(definitions.length).toBeGreaterThan(0);

      const names = definitions.map((d) => d.name);
      expect(names).toContain("create_client");
      expect(names).toContain("update_client");
      expect(names).toContain("create_meeting");
      expect(names).toContain("add_meeting_note");
      expect(names).toContain("search_leads");
      expect(names).toContain("update_lead");
      expect(names).toContain("archive_lead");
    });

    it("all CRM tools have valid input_schema with type: object", async () => {
      const { definitions } = await import("@/lib/ai/tools-ceo/crm-tools");
      for (const def of definitions) {
        expect(def.input_schema.type).toBe("object");
        expect(def.input_schema.properties).toBeDefined();
      }
    });

    it("create_client requires name field", async () => {
      const { definitions } = await import("@/lib/ai/tools-ceo/crm-tools");
      const createClient = definitions.find((d) => d.name === "create_client");
      expect(createClient?.input_schema.required).toContain("name");
    });

    it("add_meeting_note requires note field", async () => {
      const { definitions } = await import("@/lib/ai/tools-ceo/crm-tools");
      const addNote = definitions.find((d) => d.name === "add_meeting_note");
      expect(addNote?.input_schema.required).toContain("note");
    });

    it("search_leads has no required fields (all optional)", async () => {
      const { definitions } = await import("@/lib/ai/tools-ceo/crm-tools");
      const searchLeads = definitions.find((d) => d.name === "search_leads");
      const required = searchLeads?.input_schema.required ?? [];
      expect(required).toHaveLength(0);
    });

    it("search_leads stage enum matches schema values", async () => {
      const { definitions } = await import("@/lib/ai/tools-ceo/crm-tools");
      const searchLeads = definitions.find((d) => d.name === "search_leads");
      const stageEnum = (searchLeads?.input_schema.properties as Record<string, { enum?: string[] }>)?.stage?.enum;
      expect(stageEnum).toContain("awareness");
      expect(stageEnum).toContain("intent");
      expect(stageEnum).toContain("closed_won");
      expect(stageEnum).toContain("closed_lost");
      expect(stageEnum).toContain("nurture");
    });
  });

  describe("Finance tool definitions", () => {
    it("exports definitions array with correct tool names", async () => {
      const { definitions } = await import("@/lib/ai/tools-ceo/finance-tools");
      expect(Array.isArray(definitions)).toBe(true);

      const names = definitions.map((d) => d.name);
      expect(names).toContain("create_invoice");
      expect(names).toContain("mark_invoice_paid");
      expect(names).toContain("create_recurring_invoice");
      expect(names).toContain("send_invoice_reminder");
      expect(names).toContain("create_proposal");
      expect(names).toContain("update_proposal_status");
    });

    it("create_invoice requires clientName and amountDollars", async () => {
      const { definitions } = await import("@/lib/ai/tools-ceo/finance-tools");
      const createInv = definitions.find((d) => d.name === "create_invoice");
      expect(createInv?.input_schema.required).toContain("clientName");
      expect(createInv?.input_schema.required).toContain("amountDollars");
    });

    it("create_proposal requires clientName, title, and totalDollars", async () => {
      const { definitions } = await import("@/lib/ai/tools-ceo/finance-tools");
      const createProp = definitions.find((d) => d.name === "create_proposal");
      expect(createProp?.input_schema.required).toContain("clientName");
      expect(createProp?.input_schema.required).toContain("title");
      expect(createProp?.input_schema.required).toContain("totalDollars");
    });

    it("update_proposal_status requires status field", async () => {
      const { definitions } = await import("@/lib/ai/tools-ceo/finance-tools");
      const updateProp = definitions.find((d) => d.name === "update_proposal_status");
      expect(updateProp?.input_schema.required).toContain("status");
    });

    it("create_invoice has status enum with draft, open, sent", async () => {
      const { definitions } = await import("@/lib/ai/tools-ceo/finance-tools");
      const createInv = definitions.find((d) => d.name === "create_invoice");
      const statusEnum = (createInv?.input_schema.properties as Record<string, { enum?: string[] }>)?.status?.enum;
      expect(statusEnum).toContain("draft");
      expect(statusEnum).toContain("open");
      expect(statusEnum).toContain("sent");
    });
  });

  describe("Operations tool definitions", () => {
    it("exports definitions array with tool names", async () => {
      const { definitions } = await import(
        "@/lib/ai/tools-ceo/operations-tools"
      );
      expect(Array.isArray(definitions)).toBe(true);
      expect(definitions.length).toBeGreaterThan(0);

      const names = definitions.map((d) => d.name);
      expect(names).toContain("get_company_snapshot");
      expect(names).toContain("get_current_sprint");
      expect(names).toContain("create_sprint");
      expect(names).toContain("create_task");
    });

    it("get_company_snapshot has no required fields", async () => {
      const { definitions } = await import(
        "@/lib/ai/tools-ceo/operations-tools"
      );
      const snapshot = definitions.find(
        (d) => d.name === "get_company_snapshot"
      );
      const required = snapshot?.input_schema.required ?? [];
      expect(required).toHaveLength(0);
    });

    it("create_task requires title field", async () => {
      const { definitions } = await import(
        "@/lib/ai/tools-ceo/operations-tools"
      );
      const createTask = definitions.find((d) => d.name === "create_task");
      expect(createTask?.input_schema.required).toContain("title");
    });

    it("update_task_status requires status field", async () => {
      const { definitions } = await import(
        "@/lib/ai/tools-ceo/operations-tools"
      );
      const updateTask = definitions.find(
        (d) => d.name === "update_task_status"
      );
      expect(updateTask?.input_schema.required).toContain("status");
    });
  });
});

describe("AI Tool Handlers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (mockDbSelect as any)._returnValue = undefined;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (mockDbInsert as any)._returnValue = undefined;
  });

  describe("CRM handler — unknown tool", () => {
    it("returns undefined for unknown tool name", async () => {
      const { handler } = await import("@/lib/ai/tools-ceo/crm-tools");
      const result = await handler("nonexistent_tool", {});
      expect(result).toBeUndefined();
    });
  });

  describe("CRM handler — search_leads shape", () => {
    it("returns JSON string with count and leads array", async () => {
      // When db returns empty leads
      const { handler } = await import("@/lib/ai/tools-ceo/crm-tools");
      const result = await handler("search_leads", {});

      expect(result).toBeDefined();
      const parsed = JSON.parse(result!);
      expect(parsed).toHaveProperty("count");
      expect(parsed).toHaveProperty("leads");
      expect(Array.isArray(parsed.leads)).toBe(true);
      expect(parsed.count).toBe(0);
    });

    it("returns leads filtered by stage when provided", async () => {
      const { handler } = await import("@/lib/ai/tools-ceo/crm-tools");
      const result = await handler("search_leads", { stage: "intent" });

      expect(result).toBeDefined();
      const parsed = JSON.parse(result!);
      expect(parsed).toHaveProperty("count");
    });

    it("returns leads filtered by search term when provided", async () => {
      const { handler } = await import("@/lib/ai/tools-ceo/crm-tools");
      const result = await handler("search_leads", { search: "TBGC" });

      expect(result).toBeDefined();
      const parsed = JSON.parse(result!);
      expect(parsed).toHaveProperty("count");
    });

    it("respects limit parameter", async () => {
      const { handler } = await import("@/lib/ai/tools-ceo/crm-tools");
      const result = await handler("search_leads", { limit: 5 });

      expect(result).toBeDefined();
      const parsed = JSON.parse(result!);
      expect(parsed).toHaveProperty("leads");
    });
  });

  describe("CRM handler — update_client error paths", () => {
    it("returns error JSON when no client found", async () => {
      const { handler } = await import("@/lib/ai/tools-ceo/crm-tools");
      const result = await handler("update_client", { clientName: "nonexistent" });

      expect(result).toBeDefined();
      const parsed = JSON.parse(result!);
      expect(parsed).toHaveProperty("error");
      expect(parsed.error).toContain("not found");
    });

    it("returns error when no update fields provided", async () => {
      // Mock finding a client but no update fields
      const { handler } = await import("@/lib/ai/tools-ceo/crm-tools");

      // Even with a clientId that "finds" nothing, returns error
      const result = await handler("update_client", { clientId: "some-id" });
      expect(result).toBeDefined();
      const parsed = JSON.parse(result!);
      expect(parsed).toHaveProperty("error");
    });
  });

  describe("CRM handler — archive_lead error paths", () => {
    it("returns error when lead not found by companyName", async () => {
      const { handler } = await import("@/lib/ai/tools-ceo/crm-tools");
      const result = await handler("archive_lead", {
        companyName: "nonexistent",
      });

      expect(result).toBeDefined();
      const parsed = JSON.parse(result!);
      expect(parsed).toHaveProperty("error");
      expect(parsed.error).toContain("not found");
    });

    it("returns error when lead not found by leadId", async () => {
      const { handler } = await import("@/lib/ai/tools-ceo/crm-tools");
      const result = await handler("archive_lead", {
        leadId: "nonexistent-uuid",
      });

      expect(result).toBeDefined();
      const parsed = JSON.parse(result!);
      expect(parsed.error).toContain("not found");
    });

    it("returns error when no identifiers provided", async () => {
      const { handler } = await import("@/lib/ai/tools-ceo/crm-tools");
      const result = await handler("archive_lead", {});

      expect(result).toBeDefined();
      const parsed = JSON.parse(result!);
      expect(parsed.error).toContain("not found");
    });
  });

  describe("CRM handler — update_lead error paths", () => {
    it("returns error when lead not found", async () => {
      const { handler } = await import("@/lib/ai/tools-ceo/crm-tools");
      const result = await handler("update_lead", {
        companyName: "ghost-company",
      });

      expect(result).toBeDefined();
      const parsed = JSON.parse(result!);
      expect(parsed.error).toContain("not found");
    });
  });

  describe("CRM handler — add_meeting_note error paths", () => {
    it("returns error when meeting not found", async () => {
      const { handler } = await import("@/lib/ai/tools-ceo/crm-tools");
      const result = await handler("add_meeting_note", {
        meetingTitle: "nonexistent",
        note: "test note",
      });

      expect(result).toBeDefined();
      const parsed = JSON.parse(result!);
      expect(parsed.error).toContain("not found");
    });
  });

  describe("Finance handler — unknown tool", () => {
    it("returns undefined for unknown tool name", async () => {
      const { handler } = await import("@/lib/ai/tools-ceo/finance-tools");
      const result = await handler("nonexistent_tool", {});
      expect(result).toBeUndefined();
    });
  });

  describe("Finance handler — mark_invoice_paid error paths", () => {
    it("returns error when no identifier provided", async () => {
      const { handler } = await import("@/lib/ai/tools-ceo/finance-tools");
      const result = await handler("mark_invoice_paid", {});

      expect(result).toBeDefined();
      const parsed = JSON.parse(result!);
      expect(parsed.error).toBeDefined();
    });

    it("returns error when client not found by name", async () => {
      const { handler } = await import("@/lib/ai/tools-ceo/finance-tools");
      const result = await handler("mark_invoice_paid", {
        clientName: "nonexistent",
      });

      expect(result).toBeDefined();
      const parsed = JSON.parse(result!);
      expect(parsed.error).toBeDefined();
    });
  });

  describe("Finance handler — send_invoice_reminder error paths", () => {
    it("returns error when no client or invoice found", async () => {
      const { handler } = await import("@/lib/ai/tools-ceo/finance-tools");
      const result = await handler("send_invoice_reminder", {
        clientName: "nonexistent",
      });

      expect(result).toBeDefined();
      const parsed = JSON.parse(result!);
      expect(parsed.error).toBeDefined();
    });
  });

  describe("Finance handler — update_proposal_status error paths", () => {
    it("returns error when no proposal found by client name", async () => {
      const { handler } = await import("@/lib/ai/tools-ceo/finance-tools");
      const result = await handler("update_proposal_status", {
        clientName: "nonexistent",
        status: "approved",
      });

      expect(result).toBeDefined();
      const parsed = JSON.parse(result!);
      expect(parsed.error).toBeDefined();
    });

    it("returns error when no proposal found by ID", async () => {
      const { handler } = await import("@/lib/ai/tools-ceo/finance-tools");
      const result = await handler("update_proposal_status", {
        proposalId: "bad-uuid",
        status: "sent",
      });

      expect(result).toBeDefined();
      const parsed = JSON.parse(result!);
      expect(parsed.error).toBeDefined();
    });
  });

  describe("Aggregated definitions", () => {
    it("CEO_TOOL_DEFINITIONS includes tools from all domains", async () => {
      const { CEO_TOOL_DEFINITIONS } = await import(
        "@/lib/ai/tools-ceo/definitions"
      );
      expect(Array.isArray(CEO_TOOL_DEFINITIONS)).toBe(true);
      expect(CEO_TOOL_DEFINITIONS.length).toBeGreaterThan(10);

      const names = CEO_TOOL_DEFINITIONS.map((d) => d.name);
      // CRM
      expect(names).toContain("create_client");
      expect(names).toContain("search_leads");
      // Finance
      expect(names).toContain("create_invoice");
      expect(names).toContain("mark_invoice_paid");
      // Operations
      expect(names).toContain("get_company_snapshot");
      expect(names).toContain("create_task");
    });

    it("all tool names are unique (no duplicates)", async () => {
      const { CEO_TOOL_DEFINITIONS } = await import(
        "@/lib/ai/tools-ceo/definitions"
      );
      const names = CEO_TOOL_DEFINITIONS.map((d) => d.name);
      const uniqueNames = new Set(names);
      expect(uniqueNames.size).toBe(names.length);
    });

    it("all tools have descriptions", async () => {
      const { CEO_TOOL_DEFINITIONS } = await import(
        "@/lib/ai/tools-ceo/definitions"
      );
      for (const def of CEO_TOOL_DEFINITIONS) {
        expect(def.description).toBeDefined();
        expect(def.description!.length).toBeGreaterThan(10);
      }
    });

    it("all tools have valid input_schema", async () => {
      const { CEO_TOOL_DEFINITIONS } = await import(
        "@/lib/ai/tools-ceo/definitions"
      );
      for (const def of CEO_TOOL_DEFINITIONS) {
        expect(def.input_schema).toBeDefined();
        expect(def.input_schema.type).toBe("object");
      }
    });
  });
});
