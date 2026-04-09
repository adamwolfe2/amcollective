/**
 * GET /api/notifications — List notifications for the current admin user.
 * Query params: ?unreadOnly=true&limit=50&offset=0
 */

import { NextRequest, NextResponse } from "next/server";
import { checkAdmin } from "@/lib/auth";
import { captureError } from "@/lib/errors";
import {
  getNotifications,
  getUnreadCount,
} from "@/lib/db/repositories/notifications";

export async function GET(req: NextRequest) {
  try {
    const userId = await checkAdmin();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const url = new URL(req.url);
    const unreadOnly = url.searchParams.get("unreadOnly") === "true";
    const limit = Math.min(
      parseInt(url.searchParams.get("limit") ?? "50", 10),
      100
    );
    const offset = parseInt(url.searchParams.get("offset") ?? "0", 10);

    const [notifications, unreadCount] = await Promise.all([
      getNotifications(userId, { unreadOnly, limit, offset }),
      getUnreadCount(userId),
    ]);

    return NextResponse.json({ notifications, unreadCount }, {
      headers: { "Cache-Control": "private, max-age=60, stale-while-revalidate=120" },
    });
  } catch (error) {
    captureError(error, {
      tags: { source: "api", route: "notifications" },
      level: "error",
    });
    return NextResponse.json(
      { error: "Failed to fetch notifications" },
      { status: 500 }
    );
  }
}
