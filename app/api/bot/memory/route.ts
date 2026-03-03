/**
 * Memory API — lists recent knowledge files for the portal memory panel
 *
 * GET /api/bot/memory          → list all memory files
 * GET /api/bot/memory?path=... → read a specific file
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { listMemory, readMemory, isMemoryConfigured } from "@/lib/ai/memory";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!isMemoryConfigured()) {
    return NextResponse.json({ configured: false, files: [] });
  }

  const { searchParams } = new URL(req.url);
  const path = searchParams.get("path");

  if (path) {
    const content = await readMemory(path);
    if (!content) {
      return NextResponse.json({ error: "File not found" }, { status: 404 });
    }
    return NextResponse.json({ path, content });
  }

  const files = await listMemory();
  return NextResponse.json({ configured: true, files });
}
