import { NextRequest, NextResponse } from "next/server";
import { checkAdmin } from "@/lib/auth";
import { captureError } from "@/lib/errors";
import { createAuditLog } from "@/lib/db/repositories/audit";
import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { desc } from "drizzle-orm";
import { buildCsv, csvResponse, fmtDollars, fmtDate } from "@/lib/export/csv";
import { aj } from "@/lib/middleware/arcjet";

/**
 * GET /api/export/clients — Export client roster as CSV
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
      .select()
      .from(schema.clients)
      .orderBy(desc(schema.clients.createdAt))
      .limit(5000);

    const headers = [
      "Name",
      "Company",
      "Email",
      "Phone",
      "Website",
      "MRR",
      "Lifetime Value",
      "Payment Status",
      "Last Payment",
      "Portal Access",
      "Access Level",
      "Created At",
    ];

    const csvRows = rows.map((r) => [
      r.name,
      r.companyName,
      r.email,
      r.phone,
      r.website,
      fmtDollars(r.currentMrr),
      fmtDollars(r.lifetimeValue),
      r.paymentStatus,
      fmtDate(r.lastPaymentDate),
      r.portalAccess ? "Yes" : "No",
      r.accessLevel,
      fmtDate(r.createdAt),
    ]);

    const csv = buildCsv(headers, csvRows);
    const filename = `clients-${new Date().toISOString().split("T")[0]}.csv`;

    await createAuditLog({
      actorId: userId,
      actorType: "user",
      action: "export.clients",
      entityType: "export",
      entityId: "clients",
      metadata: { format: "csv", count: rows.length },
    });

    return csvResponse(csv, filename);
  } catch (error) {
    captureError(error, { tags: { route: "GET /api/export/clients" } });
    return new Response("Export failed", { status: 500 });
  }
}
