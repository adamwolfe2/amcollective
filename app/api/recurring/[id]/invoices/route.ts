/**
 * GET /api/recurring/[id]/invoices — List invoices generated from a template.
 */

import { NextResponse } from "next/server";
import { checkAdmin } from "@/lib/auth";
import { captureError } from "@/lib/errors";
import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { eq, desc } from "drizzle-orm";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const userId = await checkAdmin();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;

    const invoices = await db
      .select({
        invoice: schema.invoices,
        clientName: schema.clients.name,
      })
      .from(schema.invoices)
      .leftJoin(
        schema.clients,
        eq(schema.invoices.clientId, schema.clients.id)
      )
      .where(eq(schema.invoices.recurringInvoiceId, id))
      .orderBy(desc(schema.invoices.createdAt));

    return NextResponse.json(invoices, {
      headers: { "Cache-Control": "private, max-age=60, stale-while-revalidate=120" },
    });
  } catch (error) {
    captureError(error, {
      tags: { source: "api", route: "recurring/[id]/invoices" },
      level: "error",
    });
    return NextResponse.json(
      { error: "Failed to fetch invoices" },
      { status: 500 }
    );
  }
}
