/**
 * PATCH /api/notifications/read-all — Mark all notifications as read for the current user.
 */

import { NextResponse } from "next/server";
import { checkAdmin } from "@/lib/auth";
import { captureError } from "@/lib/errors";
import { markAllAsRead } from "@/lib/db/repositories/notifications";

export async function PATCH() {
  try {
    const userId = await checkAdmin();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const count = await markAllAsRead(userId);

    return NextResponse.json({ success: true, markedRead: count });
  } catch (error) {
    captureError(error, {
      tags: { source: "api", route: "notifications/read-all" },
      level: "error",
    });
    return NextResponse.json(
      { error: "Failed to mark all as read" },
      { status: 500 }
    );
  }
}
