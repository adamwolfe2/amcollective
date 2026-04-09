/**
 * POST /api/notifications/subscribe — Save a Web Push subscription for the current user.
 * DELETE /api/notifications/subscribe — Remove a subscription by endpoint.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { checkAdmin } from "@/lib/auth";
import { captureError } from "@/lib/errors";
import { db } from "@/lib/db";
import { pushSubscriptions } from "@/lib/db/schema/push-subscriptions";
import { eq } from "drizzle-orm";

export const runtime = "nodejs";
export const preferredRegion = "iad1";

const subscribeSchema = z.object({
  endpoint: z.string().url(),
  keys: z.object({
    p256dh: z.string().min(1),
    auth: z.string().min(1),
  }),
});

export async function POST(req: NextRequest) {
  try {
    const userId = await checkAdmin();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const parsed = subscribeSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid subscription payload" },
        { status: 400 }
      );
    }

    const { endpoint, keys } = parsed.data;

    // Upsert: if endpoint already exists for any user, update it.
    const existing = await db
      .select({ id: pushSubscriptions.id })
      .from(pushSubscriptions)
      .where(eq(pushSubscriptions.endpoint, endpoint))
      .limit(1);

    if (existing.length > 0) {
      await db
        .update(pushSubscriptions)
        .set({ userId, p256dh: keys.p256dh, auth: keys.auth, updatedAt: new Date() })
        .where(eq(pushSubscriptions.endpoint, endpoint));
    } else {
      await db.insert(pushSubscriptions).values({
        userId,
        endpoint,
        p256dh: keys.p256dh,
        auth: keys.auth,
      });
    }

    return NextResponse.json({ ok: true }, { status: 201 });
  } catch (error) {
    captureError(error, {
      tags: { source: "api", route: "notifications/subscribe", method: "POST" },
      level: "error",
    });
    return NextResponse.json(
      { error: "Failed to save subscription" },
      { status: 500 }
    );
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const userId = await checkAdmin();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const endpoint = z.string().url().safeParse(body?.endpoint);
    if (!endpoint.success) {
      return NextResponse.json({ error: "Invalid endpoint" }, { status: 400 });
    }

    await db
      .delete(pushSubscriptions)
      .where(eq(pushSubscriptions.endpoint, endpoint.data));

    return NextResponse.json({ ok: true });
  } catch (error) {
    captureError(error, {
      tags: { source: "api", route: "notifications/subscribe", method: "DELETE" },
      level: "error",
    });
    return NextResponse.json(
      { error: "Failed to remove subscription" },
      { status: 500 }
    );
  }
}
