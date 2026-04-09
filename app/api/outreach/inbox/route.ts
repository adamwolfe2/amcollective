/**
 * GET  /api/outreach/inbox — Return paginated inbox replies
 * POST /api/outreach/inbox — Mark a reply read or interested
 */

import { NextRequest, NextResponse } from "next/server";
import { after } from "next/server";
import { checkAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { emailbisonReplies } from "@/lib/db/schema";
import { markReplyRead, markReplyInterested } from "@/lib/connectors/emailbison";
import { createAuditLog } from "@/lib/db/repositories/audit";
import { desc, eq, count } from "drizzle-orm";
import { captureError } from "@/lib/errors";

export async function GET(req: NextRequest) {
  const userId = await checkAdmin();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const { searchParams } = req.nextUrl;
    const unreadOnly = searchParams.get("unread") === "1";
    const limit = Math.min(Number(searchParams.get("limit") ?? 50), 200);

    const query = db.select().from(emailbisonReplies).orderBy(desc(emailbisonReplies.receivedAt)).limit(limit);
    const rows = unreadOnly
      ? await query.where(eq(emailbisonReplies.isRead, false))
      : await query;

    const [totalRow] = await db.select({ count: count() }).from(emailbisonReplies);
    const [unreadRow] = await db
      .select({ count: count() })
      .from(emailbisonReplies)
      .where(eq(emailbisonReplies.isRead, false));

    return NextResponse.json({
      replies: rows,
      total: totalRow?.count ?? 0,
      unreadCount: unreadRow?.count ?? 0,
    }, {
      headers: { "Cache-Control": "private, max-age=60, stale-while-revalidate=120" },
    });
  } catch (error) {
    captureError(error, { tags: { component: "outreach-inbox-get" } });
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const userId = await checkAdmin();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const body = await req.json().catch(() => null);
    if (!body?.replyId || !body?.action) {
      return NextResponse.json({ error: "replyId and action required" }, { status: 400 });
    }

    const { replyId, action } = body as { replyId: number; action: "mark_read" | "mark_interested" };

    if (action === "mark_read") {
      await markReplyRead(replyId);
      await db
        .update(emailbisonReplies)
        .set({ isRead: true, updatedAt: new Date() })
        .where(eq(emailbisonReplies.externalId, replyId));
    } else if (action === "mark_interested") {
      await markReplyInterested(replyId);
      await db
        .update(emailbisonReplies)
        .set({ isInterested: true, updatedAt: new Date() })
        .where(eq(emailbisonReplies.externalId, replyId));
    } else {
      return NextResponse.json({ error: "Unknown action" }, { status: 400 });
    }

    after(async () => {
      await createAuditLog({
        actorId: userId,
        actorType: "user",
        action: `outreach.reply.${action}`,
        entityType: "emailbison_reply",
        entityId: String(replyId),
      });
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    captureError(error, { tags: { component: "outreach-inbox-post" } });
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
