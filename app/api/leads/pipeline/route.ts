/**
 * GET /api/leads/pipeline -- aggregated pipeline stats
 */

import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { eq, and, sql, gte } from "drizzle-orm";
import { checkAdmin } from "@/lib/auth";
import { captureError } from "@/lib/errors";

export async function GET() {
  try {
    const userId = await checkAdmin();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const [stageCounts, pipelineValue, recentWins, conversionRate] =
      await Promise.all([
        // Count leads by stage
        db
          .select({
            stage: schema.leads.stage,
            count: sql<number>`count(*)`,
            value: sql<number>`coalesce(sum(${schema.leads.estimatedValue}), 0)`,
          })
          .from(schema.leads)
          .where(eq(schema.leads.isArchived, false))
          .groupBy(schema.leads.stage),

        // Weighted pipeline value (consideration+)
        db
          .select({
            weighted: sql<number>`coalesce(sum(${schema.leads.estimatedValue} * ${schema.leads.probability} / 100), 0)`,
          })
          .from(schema.leads)
          .where(
            and(
              eq(schema.leads.isArchived, false),
              sql`${schema.leads.stage} IN ('consideration', 'intent')`
            )
          ),

        // Won this month
        db
          .select({
            count: sql<number>`count(*)`,
            value: sql<number>`coalesce(sum(${schema.leads.estimatedValue}), 0)`,
          })
          .from(schema.leads)
          .where(
            and(
              eq(schema.leads.stage, "closed_won"),
              gte(
                schema.leads.convertedAt,
                new Date(
                  new Date().getFullYear(),
                  new Date().getMonth(),
                  1
                )
              )
            )
          ),

        // 90-day conversion rate
        db
          .select({
            won: sql<number>`count(*) filter (where ${schema.leads.stage} = 'closed_won')`,
            lost: sql<number>`count(*) filter (where ${schema.leads.stage} = 'closed_lost')`,
          })
          .from(schema.leads)
          .where(
            gte(
              schema.leads.updatedAt,
              new Date(Date.now() - 90 * 86400000)
            )
          ),
      ]);

    const won = conversionRate[0]?.won ?? 0;
    const lost = conversionRate[0]?.lost ?? 0;
    const rate = won + lost > 0 ? Math.round((won / (won + lost)) * 100) : 0;

    return NextResponse.json({
      stages: stageCounts,
      weightedPipeline: pipelineValue[0]?.weighted ?? 0,
      wonThisMonth: {
        count: recentWins[0]?.count ?? 0,
        value: recentWins[0]?.value ?? 0,
      },
      conversionRate90d: rate,
    });
  } catch (error) {
    captureError(error);
    return NextResponse.json(
      { error: "Failed to fetch pipeline" },
      { status: 500 }
    );
  }
}
