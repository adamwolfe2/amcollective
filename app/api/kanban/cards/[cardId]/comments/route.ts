/**
 * Kanban Card Comments API — List and create comments on a card.
 *
 * GET: Returns comments for a card
 * POST: Create a new comment
 * Auth: owner or admin only.
 */

import { NextRequest, NextResponse } from "next/server";
import { currentUser } from "@clerk/nextjs/server";
import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { eq, asc } from "drizzle-orm";
import { checkAdmin } from "@/lib/auth";
import { captureError } from "@/lib/errors";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ cardId: string }> }
) {
  const userId = await checkAdmin();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { cardId } = await params;

  const comments = await db
    .select()
    .from(schema.kanbanComments)
    .where(eq(schema.kanbanComments.cardId, cardId))
    .orderBy(asc(schema.kanbanComments.createdAt));

  return NextResponse.json(comments, {
    headers: { "Cache-Control": "private, max-age=60, stale-while-revalidate=120" },
  });
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ cardId: string }> }
) {
  const userId = await checkAdmin();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { cardId } = await params;

  try {
    const body = await req.json();
    const { content, isClientVisible } = body;

    if (!content?.trim()) {
      return NextResponse.json(
        { error: "content is required" },
        { status: 400 }
      );
    }

    // Get user name for display
    const user = await currentUser();
    const authorName =
      user?.firstName && user?.lastName
        ? `${user.firstName} ${user.lastName}`
        : user?.firstName || "Admin";

    const [comment] = await db
      .insert(schema.kanbanComments)
      .values({
        cardId,
        authorId: userId,
        authorName,
        content: content.trim(),
        isClientVisible: isClientVisible ?? true,
      })
      .returning();

    return NextResponse.json(comment, { status: 201 });
  } catch (err) {
    captureError(err, { tags: { route: "POST /api/kanban/cards/[cardId]/comments" } });
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
