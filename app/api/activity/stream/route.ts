/**
 * GET /api/activity/stream -- SSE endpoint for real-time activity updates.
 * Polls audit_logs every 5 seconds and pushes new entries to connected clients.
 */

import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { desc, gt } from "drizzle-orm";
import { checkAdmin } from "@/lib/auth";
import { captureError } from "@/lib/errors";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET() {
  try {
    const userId = await checkAdmin();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const encoder = new TextEncoder();
    let lastId = "";
    let cancelled = false;

    const stream = new ReadableStream({
      async start(controller) {
        // Send initial batch
        try {
          const initial = await db
            .select()
            .from(schema.auditLogs)
            .orderBy(desc(schema.auditLogs.createdAt))
            .limit(20);

          if (initial.length > 0) {
            lastId = initial[0].id;
            controller.enqueue(
              encoder.encode(
                `data: ${JSON.stringify({ type: "initial", entries: initial })}\n\n`
              )
            );
          }
        } catch (err) {
          captureError(err);
        }

        // Poll for new entries every 5 seconds
        const interval = setInterval(async () => {
          if (cancelled) return;
          try {
            if (!lastId) return;
            const newEntries = await db
              .select()
              .from(schema.auditLogs)
              .where(gt(schema.auditLogs.id, lastId))
              .orderBy(desc(schema.auditLogs.createdAt))
              .limit(10);

            if (newEntries.length > 0) {
              lastId = newEntries[0].id;
              controller.enqueue(
                encoder.encode(
                  `data: ${JSON.stringify({ type: "update", entries: newEntries })}\n\n`
                )
              );
            } else {
              // Keep-alive ping
              controller.enqueue(encoder.encode(": ping\n\n"));
            }
          } catch (err) {
            captureError(err);
          }
        }, 5000);

        // Handle client disconnect
        controller.enqueue(encoder.encode(": connected\n\n"));

        // Auto-close after 5 minutes to prevent resource leaks
        const autoCloseTimer = setTimeout(() => {
          cancelled = true;
          clearInterval(interval);
          try { controller.close(); } catch {}
        }, 5 * 60 * 1000);

        // Store cleanup refs on controller for use in cancel()
        (controller as unknown as { _interval: ReturnType<typeof setInterval>; _autoClose: ReturnType<typeof setTimeout> })._interval = interval;
        (controller as unknown as { _interval: ReturnType<typeof setInterval>; _autoClose: ReturnType<typeof setTimeout> })._autoClose = autoCloseTimer;
      },
      cancel(controller) {
        cancelled = true;
        const c = controller as unknown as { _interval?: ReturnType<typeof setInterval>; _autoClose?: ReturnType<typeof setTimeout> };
        if (c._interval) clearInterval(c._interval);
        if (c._autoClose) clearTimeout(c._autoClose);
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
      },
    });
  } catch (error) {
    captureError(error);
    return NextResponse.json(
      { error: "Failed to start activity stream" },
      { status: 500 }
    );
  }
}
