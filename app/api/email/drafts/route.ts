import { NextRequest, NextResponse } from "next/server";
import { checkAdmin } from "@/lib/auth";
import { captureError } from "@/lib/errors";
import { createAuditLog } from "@/lib/db/repositories/audit";
import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { desc, eq, and } from "drizzle-orm";
import { aj } from "@/lib/middleware/arcjet";

/**
 * GET /api/email/drafts — List email drafts
 * Query params: status (draft|ready|sent|failed), limit
 */
export async function GET(request: NextRequest) {
  const userId = await checkAdmin();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const url = request.nextUrl;
    const status = url.searchParams.get("status");
    const limit = parseInt(url.searchParams.get("limit") || "50", 10);

    const conditions = [];
    if (status) {
      conditions.push(
        eq(
          schema.emailDrafts.status,
          status as "draft" | "ready" | "sent" | "failed"
        )
      );
    }

    const drafts = await db
      .select({
        draft: schema.emailDrafts,
        clientName: schema.clients.name,
      })
      .from(schema.emailDrafts)
      .leftJoin(schema.clients, eq(schema.emailDrafts.clientId, schema.clients.id))
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(schema.emailDrafts.createdAt))
      .limit(limit);

    return NextResponse.json(drafts, {
      headers: { "Cache-Control": "private, max-age=60, stale-while-revalidate=120" },
    });
  } catch (error) {
    captureError(error, { tags: { route: "GET /api/email/drafts" } });
    return NextResponse.json({ error: "Failed to fetch drafts" }, { status: 500 });
  }
}

/**
 * POST /api/email/drafts — Create an email draft
 */
export async function POST(request: NextRequest) {
  if (aj) {
    const decision = await aj.protect(request, { requested: 1 });
    if (decision.isDenied()) {
      return NextResponse.json({ error: "Rate limited" }, { status: 429 });
    }
  }

  const userId = await checkAdmin();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const body = await request.json();
    const { to, cc, subject, body: emailBody, plainText, clientId, context, generatedBy } = body;

    if (!to || !subject || !emailBody) {
      return NextResponse.json(
        { error: "to, subject, and body are required" },
        { status: 400 }
      );
    }

    const [draft] = await db
      .insert(schema.emailDrafts)
      .values({
        to,
        cc: cc || null,
        subject,
        body: emailBody,
        plainText: plainText || null,
        clientId: clientId || null,
        context: context || null,
        generatedBy: generatedBy || "user",
        createdBy: userId,
      })
      .returning();

    await createAuditLog({
      actorId: userId,
      actorType: "user",
      action: "email_draft.created",
      entityType: "email_draft",
      entityId: draft.id,
      metadata: { to, subject },
    });

    return NextResponse.json(draft, { status: 201 });
  } catch (error) {
    captureError(error, { tags: { route: "POST /api/email/drafts" } });
    return NextResponse.json({ error: "Failed to create draft" }, { status: 500 });
  }
}
