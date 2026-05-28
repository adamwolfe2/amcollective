/**
 * "YOUR TEAM SURFACED" — named-agent card row.
 *
 * Each card represents one agent persona surfacing a single most important
 * thing to know right now. Currently active:
 *   - Bison (cold email coach) — latest unread insight
 *
 * Future siblings: Tara (tax), Alex (records), Carl (cash).
 */

import Link from "next/link";
import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { and, desc, isNull } from "drizzle-orm";
import { Mail } from "lucide-react";

interface BisonInsightCard {
  id: string;
  headline: string;
  body: string;
  workspace: string | null;
  campaignName: string | null;
  severity: number;
  experimentId: string | null;
  questionId: string | null;
}

async function getLatestBisonInsight(): Promise<BisonInsightCard | null> {
  try {
    const rows = await db
      .select({
        id: schema.coldEmailInsights.id,
        headline: schema.coldEmailInsights.headline,
        body: schema.coldEmailInsights.body,
        workspace: schema.coldEmailInsights.workspace,
        campaignName: schema.coldEmailInsights.campaignName,
        severity: schema.coldEmailInsights.severity,
        experimentId: schema.coldEmailInsights.experimentId,
        questionId: schema.coldEmailInsights.questionId,
      })
      .from(schema.coldEmailInsights)
      .where(isNull(schema.coldEmailInsights.dismissedAt))
      .orderBy(
        desc(schema.coldEmailInsights.severity),
        desc(schema.coldEmailInsights.createdAt)
      )
      .limit(1);

    return rows[0] ?? null;
  } catch {
    return null;
  }
}

function severityLabel(severity: number): string {
  if (severity >= 2) return "URGENT";
  if (severity >= 1) return "ACTION";
  return "INFO";
}

function severityClasses(severity: number): string {
  if (severity >= 2) return "bg-[#0A0A0A] text-white";
  if (severity >= 1) return "bg-white text-[#0A0A0A] border border-[#0A0A0A]";
  return "bg-[#0A0A0A]/5 text-[#0A0A0A]/60";
}

function BisonCard({ insight }: { insight: BisonInsightCard | null }) {
  const href = insight?.experimentId
    ? `/campaigns/experiments#${insight.experimentId}`
    : "/campaigns/experiments";

  return (
    <Link
      href={href}
      className="block border border-[#0A0A0A]/10 bg-white p-4 hover:border-[#0A0A0A]/30 transition-colors min-h-[140px]"
    >
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center justify-center w-6 h-6 bg-[#0A0A0A] text-white">
            <Mail size={12} />
          </span>
          <div>
            <p className="font-serif text-sm font-bold tracking-tight leading-none">
              Bison
            </p>
            <p className="font-mono text-[9px] uppercase tracking-wider text-[#0A0A0A]/40 mt-0.5">
              Cold Email Coach
            </p>
          </div>
        </div>
        {insight && (
          <span
            className={`inline-flex items-center px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wider ${severityClasses(insight.severity)}`}
          >
            {severityLabel(insight.severity)}
          </span>
        )}
      </div>

      {insight ? (
        <>
          <p className="font-serif text-[13px] leading-snug text-[#0A0A0A] mb-2 line-clamp-2">
            {insight.headline}
          </p>
          <p className="font-mono text-[10px] text-[#0A0A0A]/50 line-clamp-2">
            {insight.body}
          </p>
          {(insight.workspace || insight.campaignName) && (
            <p className="font-mono text-[9px] uppercase tracking-wider text-[#0A0A0A]/40 mt-2">
              {[insight.workspace, insight.campaignName]
                .filter(Boolean)
                .join(" · ")}
            </p>
          )}
        </>
      ) : (
        <p className="font-serif italic text-[12px] text-[#0A0A0A]/40">
          No active campaigns to optimize.
        </p>
      )}
    </Link>
  );
}

export async function TeamSurfacedRow() {
  const bisonInsight = await getLatestBisonInsight();

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <h3 className="font-mono text-[10px] uppercase tracking-wider text-[#0A0A0A]/40">
          Your Team Surfaced
        </h3>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
        <BisonCard insight={bisonInsight} />
      </div>
    </div>
  );
}
