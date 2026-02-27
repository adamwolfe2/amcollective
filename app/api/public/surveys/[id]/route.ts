import { NextRequest, NextResponse } from "next/server";
import { captureError } from "@/lib/errors";
import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { eq } from "drizzle-orm";

type RouteContext = { params: Promise<{ id: string }> };

/**
 * GET /api/public/surveys/:id — Get survey info (no auth, public)
 */
export async function GET(_request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;

    const [row] = await db
      .select({
        id: schema.surveys.id,
        type: schema.surveys.type,
        status: schema.surveys.status,
        expiresAt: schema.surveys.expiresAt,
        clientName: schema.clients.name,
      })
      .from(schema.surveys)
      .leftJoin(schema.clients, eq(schema.surveys.clientId, schema.clients.id))
      .where(eq(schema.surveys.id, id))
      .limit(1);

    if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });

    // Check expiry
    if (row.expiresAt && new Date() > row.expiresAt) {
      return NextResponse.json({ error: "Survey has expired", survey: { ...row, status: "expired" } }, { status: 410 });
    }

    return NextResponse.json(row);
  } catch (error) {
    captureError(error, { tags: { route: "GET /api/public/surveys/:id" } });
    return NextResponse.json({ error: "Failed to fetch survey" }, { status: 500 });
  }
}

/**
 * POST /api/public/surveys/:id — Submit survey response (no auth, public)
 */
export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;
    const body = await request.json();
    const { score, feedback } = body;

    const [survey] = await db
      .select()
      .from(schema.surveys)
      .where(eq(schema.surveys.id, id))
      .limit(1);

    if (!survey) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (survey.status === "completed") {
      return NextResponse.json({ error: "Already submitted" }, { status: 400 });
    }
    if (survey.expiresAt && new Date() > survey.expiresAt) {
      return NextResponse.json({ error: "Survey has expired" }, { status: 410 });
    }

    if (score === undefined || score === null) {
      return NextResponse.json({ error: "Score is required" }, { status: 400 });
    }

    await db
      .update(schema.surveys)
      .set({
        score: Number(score),
        feedback: feedback || null,
        status: "completed",
        respondedAt: new Date(),
      })
      .where(eq(schema.surveys.id, id));

    return NextResponse.json({ success: true });
  } catch (error) {
    captureError(error, { tags: { route: "POST /api/public/surveys/:id" } });
    return NextResponse.json({ error: "Failed to submit survey" }, { status: 500 });
  }
}
