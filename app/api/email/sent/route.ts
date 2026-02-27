import { NextRequest, NextResponse } from "next/server";
import { checkAdmin } from "@/lib/auth";
import { captureError } from "@/lib/errors";
import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { desc, eq } from "drizzle-orm";

/**
 * GET /api/email/sent — List sent emails
 */
export async function GET(request: NextRequest) {
  const userId = await checkAdmin();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const limit = parseInt(request.nextUrl.searchParams.get("limit") || "50", 10);

    const emails = await db
      .select({
        email: schema.sentEmails,
        clientName: schema.clients.name,
      })
      .from(schema.sentEmails)
      .leftJoin(schema.clients, eq(schema.sentEmails.clientId, schema.clients.id))
      .orderBy(desc(schema.sentEmails.createdAt))
      .limit(limit);

    return NextResponse.json(emails);
  } catch (error) {
    captureError(error, { tags: { route: "GET /api/email/sent" } });
    return NextResponse.json({ error: "Failed to fetch sent emails" }, { status: 500 });
  }
}
