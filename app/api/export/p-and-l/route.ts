import { NextRequest, NextResponse } from "next/server";
import { checkAdmin } from "@/lib/auth";
import { captureError } from "@/lib/errors";
import { createAuditLog } from "@/lib/db/repositories/audit";
import { generatePandLRange } from "@/lib/export/p-and-l";
import { buildCsv, csvResponse, fmtDollars } from "@/lib/export/csv";

/**
 * GET /api/export/p-and-l — Monthly P&L report
 * Query params: from (YYYY-MM), to (YYYY-MM), format (json|csv, default json)
 */
export async function GET(request: NextRequest) {
  const userId = await checkAdmin();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { searchParams } = request.nextUrl;
    const now = new Date();
    const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

    // Default: last 6 months
    const defaultFrom = new Date(now);
    defaultFrom.setMonth(defaultFrom.getMonth() - 5);
    const defaultFromMonth = `${defaultFrom.getFullYear()}-${String(defaultFrom.getMonth() + 1).padStart(2, "0")}`;

    const from = searchParams.get("from") || defaultFromMonth;
    const to = searchParams.get("to") || currentMonth;
    const format = searchParams.get("format") || "json";

    const months = await generatePandLRange(from, to);

    await createAuditLog({
      actorId: userId,
      actorType: "user",
      action: "export.p_and_l",
      entityType: "export",
      entityId: "p-and-l",
      metadata: { format, from, to, monthCount: months.length },
    });

    if (format === "csv") {
      const headers = [
        "Month",
        "Revenue",
        "Subscription Costs",
        "Tool Costs",
        "API Costs",
        "Total Costs",
        "Net Profit",
        "Margin %",
        "Invoices Created",
        "Invoices Paid",
      ];

      const csvRows = months.map((m) => [
        m.month,
        fmtDollars(m.revenue),
        fmtDollars(m.subscriptionCosts),
        fmtDollars(m.toolCosts),
        fmtDollars(m.apiCosts),
        fmtDollars(m.totalCosts),
        fmtDollars(m.netProfit),
        `${m.margin}%`,
        m.invoiceCount,
        m.paidInvoiceCount,
      ]);

      const csv = buildCsv(headers, csvRows);
      const filename = `p-and-l-${from}-to-${to}.csv`;
      return csvResponse(csv, filename);
    }

    // JSON response with summary
    const totalRevenue = months.reduce((s, m) => s + m.revenue, 0);
    const totalCosts = months.reduce((s, m) => s + m.totalCosts, 0);
    const totalProfit = totalRevenue - totalCosts;

    return NextResponse.json({
      from,
      to,
      months,
      summary: {
        totalRevenue,
        totalCosts,
        totalProfit,
        overallMargin:
          totalRevenue > 0
            ? Math.round((totalProfit / totalRevenue) * 100)
            : 0,
      },
    });
  } catch (error) {
    captureError(error, { tags: { route: "GET /api/export/p-and-l" } });
    return NextResponse.json({ error: "Failed to generate P&L" }, { status: 500 });
  }
}
