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
          if (cancelled) {
            clearInterval(interval);
            return;
          }
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

        // Cleanup on cancel
        const cleanup = () => {
          cancelled = true;
          clearInterval(interval);
        };

        // Handle client disconnect
        controller.enqueue(encoder.encode(": connected\n\n"));

        // Auto-close after 5 minutes to prevent resource leaks
        const maxDuration = setTimeout(() => {
          cancelled = true;
          clearInterval(interval);
          try { controller.close(); } catch {}
        }, 5 * 60 * 1000);

        // Store cleanup for cancel
        const originalCleanup = cleanup;
        (controller as unknown as { _cleanup: () => void })._cleanup = () => {
          originalCleanup();
          clearTimeout(maxDuration);
        };
      },
      cancel() {
        cancelled = true;
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
