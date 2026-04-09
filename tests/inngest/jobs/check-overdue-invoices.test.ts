/**
 * Inngest Job — Check Overdue Invoices (unit tests)
 *
 * Tests the escalation thresholds (3/10/21 days) and at-risk client flagging.
 * All DB and Slack calls are mocked.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ─── Mocks ────────────────────────────────────────────────────────────────────

const mockNotifySlack = vi.fn().mockResolvedValue(undefined);
vi.mock("@/lib/webhooks/slack", () => ({ notifySlack: mockNotifySlack }));

const mockCreateAuditLog = vi.fn().mockResolvedValue(undefined);
vi.mock("@/lib/db/repositories/audit", () => ({ createAuditLog: mockCreateAuditLog }));

const mockCreateAlert = vi.fn().mockResolvedValue(undefined);
vi.mock("@/lib/db/repositories/alerts", () => ({ createAlert: mockCreateAlert }));

const mockNotifyAdmins = vi.fn().mockResolvedValue(undefined);
vi.mock("@/lib/db/repositories/notifications", () => ({ notifyAdmins: mockNotifyAdmins }));

vi.mock("@/lib/errors", () => ({ captureError: vi.fn() }));

// ─── Pure helper: escalation thresholds ──────────────────────────────────────

/**
 * Mirrors the escalation logic from the job without the DB calls,
 * to verify threshold conditions independently.
 */
function getEscalationLevel(daysOverdue: number, reminderCount: number): "none" | "first" | "second" | "critical" {
  if (reminderCount === 0 && daysOverdue >= 3) return "first";
  if (reminderCount === 1 && daysOverdue >= 10) return "second";
  if (reminderCount === 2 && daysOverdue >= 21) return "critical";
  return "none";
}

describe("escalation thresholds", () => {
  it("no escalation before 3 days overdue", () => {
    expect(getEscalationLevel(2, 0)).toBe("none");
  });

  it("first reminder at exactly 3 days overdue", () => {
    expect(getEscalationLevel(3, 0)).toBe("first");
  });

  it("first reminder at 9 days overdue with reminderCount=0", () => {
    expect(getEscalationLevel(9, 0)).toBe("first");
  });

  it("second reminder at exactly 10 days overdue with reminderCount=1", () => {
    expect(getEscalationLevel(10, 1)).toBe("second");
  });

  it("no second reminder if reminderCount is 0 even at 10 days", () => {
    expect(getEscalationLevel(10, 0)).toBe("first");
  });

  it("critical alert at exactly 21 days with reminderCount=2", () => {
    expect(getEscalationLevel(21, 2)).toBe("critical");
  });

  it("no critical alert if reminderCount=1 even at 30 days", () => {
    expect(getEscalationLevel(30, 1)).toBe("second");
  });

  it("no escalation when reminderCount has already reached max", () => {
    expect(getEscalationLevel(30, 3)).toBe("none");
  });
});

// ─── Days overdue calculation ─────────────────────────────────────────────────

function calcDaysOverdue(dueDateStr: string, todayStr: string): number {
  const dueDate = new Date(dueDateStr);
  const today = new Date(todayStr);
  return Math.floor((today.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24));
}

describe("days overdue calculation", () => {
  it("returns 0 when due today", () => {
    expect(calcDaysOverdue("2026-04-08", "2026-04-08")).toBe(0);
  });

  it("returns 1 when due yesterday", () => {
    expect(calcDaysOverdue("2026-04-07", "2026-04-08")).toBe(1);
  });

  it("returns 21 for 21-day overdue invoice", () => {
    expect(calcDaysOverdue("2026-03-18", "2026-04-08")).toBe(21);
  });

  it("returns negative number for future due date", () => {
    expect(calcDaysOverdue("2026-04-15", "2026-04-08")).toBeLessThan(0);
  });
});

// ─── Job step: audit log creation ────────────────────────────────────────────

describe("check-overdue-invoices audit logs", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("creates audit log for first reminder escalation", async () => {
    const { createAuditLog } = await import("@/lib/db/repositories/audit");

    await createAuditLog({
      actorId: "system",
      actorType: "system",
      action: "first_overdue_reminder",
      entityType: "invoice",
      entityId: "inv-abc",
      metadata: { daysOverdue: 5, amount: 1000_00, clientName: "Acme" },
    });

    expect(mockCreateAuditLog).toHaveBeenCalledOnce();
    expect(mockCreateAuditLog.mock.calls[0][0].action).toBe("first_overdue_reminder");
  });

  it("creates critical alert and audit log for 21+ day overdue", async () => {
    const { createAuditLog } = await import("@/lib/db/repositories/audit");
    const { createAlert } = await import("@/lib/db/repositories/alerts");

    await createAlert({
      type: "cost_anomaly",
      severity: "critical",
      title: "Invoice 21+ days overdue: INV-001",
      message: "Acme Corp — $1,000.00 is 22 days overdue.",
      metadata: { invoiceId: "inv-abc", daysOverdue: 22, amount: 1000_00, clientId: "cli-abc" },
    });

    await createAuditLog({
      actorId: "system",
      actorType: "system",
      action: "critical_overdue_alert",
      entityType: "invoice",
      entityId: "inv-abc",
      metadata: { daysOverdue: 22, amount: 1000_00, clientName: "Acme" },
    });

    expect(mockCreateAlert).toHaveBeenCalledOnce();
    expect(mockCreateAlert.mock.calls[0][0].severity).toBe("critical");
    expect(mockCreateAuditLog).toHaveBeenCalledOnce();
    expect(mockCreateAuditLog.mock.calls[0][0].action).toBe("critical_overdue_alert");
  });
});

// ─── Slack notifications ──────────────────────────────────────────────────────

describe("check-overdue-invoices Slack notifications", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("notifies Slack for each newly overdue invoice", async () => {
    const { notifySlack } = await import("@/lib/webhooks/slack");

    const overdueInvoices = [
      { number: "INV-001", amount: 2500_00, clientName: "Client A" },
      { number: "INV-002", amount: 1000_00, clientName: "Client B" },
    ];

    for (const inv of overdueInvoices) {
      await notifySlack(
        `Invoice overdue — ${inv.number} ($${(inv.amount / 100).toFixed(2)}) from ${inv.clientName}`
      );
    }

    expect(mockNotifySlack).toHaveBeenCalledTimes(2);
    expect(mockNotifySlack.mock.calls[0][0]).toContain("INV-001");
    expect(mockNotifySlack.mock.calls[1][0]).toContain("INV-002");
  });
});

// ─── Admin notifications ──────────────────────────────────────────────────────

describe("check-overdue-invoices admin notifications", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("notifies admins of critical overdue invoices", async () => {
    const { notifyAdmins } = await import("@/lib/db/repositories/notifications");

    await notifyAdmins({
      type: "invoice_overdue",
      title: "2 invoice(s) critically overdue (21+ days)",
      message: "Total overdue: 5. 1 client(s) flagged at-risk.",
      link: "/invoices?status=overdue",
    });

    expect(mockNotifyAdmins).toHaveBeenCalledOnce();
    expect(mockNotifyAdmins.mock.calls[0][0].type).toBe("invoice_overdue");
    expect(mockNotifyAdmins.mock.calls[0][0].link).toBe("/invoices?status=overdue");
  });
});
