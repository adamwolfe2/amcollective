import { NextRequest, NextResponse } from "next/server";
import { checkAdmin } from "@/lib/auth";
import { captureError } from "@/lib/errors";
import { createAuditLog } from "@/lib/db/repositories/audit";
import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { desc, eq, and } from "drizzle-orm";
import { aj } from "@/lib/middleware/arcjet";

/**
 * GET /api/surveys — List surveys with NPS summary
 */
export async function GET(request: NextRequest) {
  const userId = await checkAdmin();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const status = request.nextUrl.searchParams.get("status");
    const conditions = [];
    if (status) {
      conditions.push(
        eq(schema.surveys.status, status as "pending" | "sent" | "completed" | "expired")
      );
    }

    const surveys = await db
      .select({
        survey: schema.surveys,
        clientName: schema.clients.name,
        clientEmail: schema.clients.email,
      })
      .from(schema.surveys)
      .leftJoin(schema.clients, eq(schema.surveys.clientId, schema.clients.id))
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(schema.surveys.createdAt))
      .limit(100);

    return NextResponse.json(surveys, {
      headers: { "Cache-Control": "private, max-age=60, stale-while-revalidate=120" },
    });
  } catch (error) {
    captureError(error, { tags: { route: "GET /api/surveys" } });
    return NextResponse.json({ error: "Failed to fetch surveys" }, { status: 500 });
  }
}

/**
 * POST /api/surveys — Create a survey for a client
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
    const { clientId, type = "nps" } = body;

    if (!clientId) {
      return NextResponse.json({ error: "clientId is required" }, { status: 400 });
    }

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 14); // 2 weeks to respond

    const [survey] = await db
      .insert(schema.surveys)
      .values({
        clientId,
        type,
        status: "pending",
        expiresAt,
        sentBy: userId,
      })
      .returning();

    await createAuditLog({
      actorId: userId,
      actorType: "user",
      action: "survey.created",
      entityType: "survey",
      entityId: survey.id,
      metadata: { clientId, type },
    });

    return NextResponse.json(survey, { status: 201 });
  } catch (error) {
    captureError(error, { tags: { route: "POST /api/surveys" } });
    return NextResponse.json({ error: "Failed to create survey" }, { status: 500 });
  }
}
