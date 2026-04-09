/**
 * Recent Searches API
 *
 * GET  /api/search/recent  — Return last 10 unique queries for the current user.
 * POST /api/search/recent  — Record a search/click event (fire-and-forget safe).
 *
 * Auth: owner or admin only (same guard as main search route).
 */

import { NextRequest } from "next/server";
import { apiSuccess, apiError } from "@/lib/api/response";
import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { eq, desc, sql } from "drizzle-orm";
import { checkAdmin } from "@/lib/auth";
import { captureError } from "@/lib/errors";
import { z } from "zod";

const postSchema = z.object({
  query: z.string().min(1).max(500),
  resultCount: z.number().int().min(0).default(0),
  clickedType: z.string().max(50).optional(),
  clickedId: z.string().uuid().optional(),
});

export async function GET() {
  try {
    const userId = await checkAdmin();
    if (!userId) return apiError("Unauthorized", 401);

    // Return last 10 distinct queries, most recent first
    const rows = await db
      .selectDistinctOn([schema.recentSearches.query], {
        id: schema.recentSearches.id,
        query: schema.recentSearches.query,
        resultCount: schema.recentSearches.resultCount,
        searchedAt: schema.recentSearches.searchedAt,
      })
      .from(schema.recentSearches)
      .where(eq(schema.recentSearches.userId, userId))
      .orderBy(
        schema.recentSearches.query,
        desc(schema.recentSearches.searchedAt)
      )
      .limit(50); // over-fetch for dedup; slice after

    // Keep most-recent occurrence of each query, re-sort by time, take 10
    const seen = new Set<string>();
    const recents: typeof rows = [];
    for (const row of rows) {
      if (!seen.has(row.query)) {
        seen.add(row.query);
        recents.push(row);
      }
      if (recents.length >= 10) break;
    }

    recents.sort(
      (a, b) =>
        (b.searchedAt?.getTime() ?? 0) - (a.searchedAt?.getTime() ?? 0)
    );

    return apiSuccess({ recents });
  } catch (error) {
    captureError(error, {
      tags: { source: "api", route: "search/recent" },
      level: "error",
    });
    return apiError("Failed to load recent searches", 500);
  }
}

export async function POST(req: NextRequest) {
  try {
    const userId = await checkAdmin();
    if (!userId) return apiError("Unauthorized", 401);

    const body = await req.json().catch(() => ({}));
    const parsed = postSchema.safeParse(body);
    if (!parsed.success) {
      return apiError("Invalid payload", 400);
    }

    const { query, resultCount, clickedType, clickedId } = parsed.data;

    await db.insert(schema.recentSearches).values({
      userId,
      query,
      resultCount,
      clickedType: clickedType ?? null,
      clickedId: clickedId ?? null,
    });

    // Prune old rows — keep only the latest 200 per user to avoid unbounded growth
    await db.execute(
      sql`DELETE FROM recent_searches
          WHERE user_id = ${userId}
            AND id NOT IN (
              SELECT id FROM recent_searches
              WHERE user_id = ${userId}
              ORDER BY searched_at DESC
              LIMIT 200
            )`
    );

    return apiSuccess({ ok: true });
  } catch (error) {
    captureError(error, {
      tags: { source: "api", route: "search/recent" },
      level: "error",
    });
    return apiError("Failed to record search", 500);
  }
}
