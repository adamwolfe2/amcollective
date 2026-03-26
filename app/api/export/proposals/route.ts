import { NextRequest, NextResponse } from "next/server";
import { checkAdmin } from "@/lib/auth";
import { captureError } from "@/lib/errors";
import { createAuditLog } from "@/lib/db/repositories/audit";
import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { desc, eq } from "drizzle-orm";
import { buildCsv, csvResponse, fmtDollars, fmtDate } from "@/lib/export/csv";
import { aj } from "@/lib/middleware/arcjet";

/**
 * GET /api/export/proposals — Export proposals as CSV
 */
export async function GET(request: NextRequest) {
  if (aj) {
    const decision = await aj.protect(request, { requested: 1 });
    if (decision.isDenied()) {
      return NextResponse.json({ error: "Rate limited" }, { status: 429 });
    }
  }

  const userId = await checkAdmin();
  if (!userId) {
    return new Response("Unauthorized", { status: 401 });
  }

  try {
    const rows = await db
      .select({
        proposalNumber: schema.proposals.proposalNumber,
        title: schema.proposals.title,
        status: schema.proposals.status,
        subtotal: schema.proposals.subtotal,
        taxAmount: schema.proposals.taxAmount,
        total: schema.proposals.total,
        validUntil: schema.proposals.validUntil,
        sentAt: schema.proposals.sentAt,
        viewedAt: schema.proposals.viewedAt,
        viewCount: schema.proposals.viewCount,
        approvedAt: schema.proposals.approvedAt,
        rejectedAt: schema.proposals.rejectedAt,
        companyTag: schema.proposals.companyTag,
        clientName: schema.clients.name,
        clientCompany: schema.clients.companyName,
        createdAt: schema.proposals.createdAt,
      })
      .from(schema.proposals)
      .leftJoin(schema.clients, eq(schema.proposals.clientId, schema.clients.id))
      .orderBy(desc(schema.proposals.createdAt))
      .limit(5000);

    const headers = [
      "Proposal #",
      "Title",
      "Client",
      "Company",
      "Status",
      "Subtotal",
      "Tax",
      "Total",
      "Valid Until",
      "Sent At",
      "Viewed At",
      "View Count",
      "Approved At",
      "Rejected At",
      "Company Tag",
      "Created At",
    ];

    const csvRows = rows.map((r) => [
      r.proposalNumber,
      r.title,
      r.clientName,
      r.clientCompany,
      r.status,
      fmtDollars(r.subtotal),
      fmtDollars(r.taxAmount),
      fmtDollars(r.total),
      r.validUntil,
      fmtDate(r.sentAt),
      fmtDate(r.viewedAt),
      r.viewCount,
      fmtDate(r.approvedAt),
      fmtDate(r.rejectedAt),
      r.companyTag,
      fmtDate(r.createdAt),
    ]);

    const csv = buildCsv(headers, csvRows);
    const filename = `proposals-${new Date().toISOString().split("T")[0]}.csv`;

    await createAuditLog({
      actorId: userId,
      actorType: "user",
      action: "export.proposals",
      entityType: "export",
      entityId: "proposals",
      metadata: { format: "csv", count: rows.length },
    });

    return csvResponse(csv, filename);
  } catch (error) {
    captureError(error, { tags: { route: "GET /api/export/proposals" } });
    return new Response("Export failed", { status: 500 });
  }
}
