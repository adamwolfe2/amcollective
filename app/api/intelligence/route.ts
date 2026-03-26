import { NextRequest } from "next/server";
import { apiSuccess, apiError } from "@/lib/api/response";
import { checkAdmin } from "@/lib/auth";
import { captureError } from "@/lib/errors";
import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { desc, eq } from "drizzle-orm";
import { aj } from "@/lib/middleware/arcjet";

/**
 * GET /api/intelligence — Get weekly reports and insights
 * Query params: limit (default 4)
 */
export async function GET(request: NextRequest) {
  if (aj) {
    const decision = await aj.protect(request, { requested: 1 });
    if (decision.isDenied()) {
      return apiError("Rate limited", 429);
    }
  }

  const userId = await checkAdmin();
  if (!userId) return apiError("Unauthorized", 401);

  try {
    const limit = parseInt(request.nextUrl.searchParams.get("limit") || "4", 10);

    const reports = await db
      .select()
      .from(schema.weeklyReports)
      .orderBy(desc(schema.weeklyReports.weekOf))
      .limit(limit);

    // Get insights for the most recent report
    const latestWeek = reports[0]?.weekOf;
    const insights = latestWeek
      ? await db
          .select()
          .from(schema.weeklyInsights)
          .where(eq(schema.weeklyInsights.weekOf, latestWeek))
          .orderBy(desc(schema.weeklyInsights.priority))
      : [];

    return apiSuccess({ reports, insights });
  } catch (error) {
    captureError(error, { tags: { route: "GET /api/intelligence" } });
    return apiError("Failed to fetch intelligence data", 500);
  }
}
