/**
 * GET  /api/presence     -- list online team members
 * POST /api/presence     -- heartbeat (upsert presence)
 */

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { gte } from "drizzle-orm";
import { checkAdmin } from "@/lib/auth";
import { captureError } from "@/lib/errors";
import { currentUser } from "@clerk/nextjs/server";

const ONLINE_THRESHOLD_MS = 2 * 60 * 1000; // 2 minutes

export async function GET() {
  try {
    const userId = await checkAdmin();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const threshold = new Date(Date.now() - ONLINE_THRESHOLD_MS);
    const onlineUsers = await db
      .select()
      .from(schema.userPresence)
      .where(gte(schema.userPresence.lastHeartbeat, threshold))
      .limit(50);

    return NextResponse.json(
      onlineUsers.map((u) => ({
        userId: u.userId,
        userName: u.userName,
        userImageUrl: u.userImageUrl,
        status: u.status,
        currentPage: u.currentPage,
        lastHeartbeat: u.lastHeartbeat,
      }))
    );
  } catch (error) {
    captureError(error);
    return NextResponse.json(
      { error: "Failed to fetch presence" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const userId = await checkAdmin();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const user = await currentUser();
    const body = await request.json().catch(() => ({}));

    await db
      .insert(schema.userPresence)
      .values({
        userId,
        userName: user?.fullName ?? user?.firstName ?? "Unknown",
        userImageUrl: user?.imageUrl ?? null,
        status: "online",
        currentPage: body.currentPage ?? null,
        lastHeartbeat: new Date(),
      })
      .onConflictDoUpdate({
        target: schema.userPresence.userId,
        set: {
          userName: user?.fullName ?? user?.firstName ?? "Unknown",
          userImageUrl: user?.imageUrl ?? null,
          status: "online",
          currentPage: body.currentPage ?? null,
          lastHeartbeat: new Date(),
        },
      });

    return NextResponse.json({ ok: true });
  } catch (error) {
    captureError(error);
    return NextResponse.json(
      { error: "Failed to update presence" },
      { status: 500 }
    );
  }
}
