import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { desc } from "drizzle-orm";
import { AlertTriangle, ArrowUp, TrendingUp, Users, Zap } from "lucide-react";

const CATEGORY_ICONS: Record<string, typeof AlertTriangle> = {
  revenue: TrendingUp,
  operations: Zap,
  clients: Users,
  growth: ArrowUp,
  risk: AlertTriangle,
};

const CATEGORY_STYLES: Record<string, string> = {
  revenue: "border-[#0A0A0A] bg-[#0A0A0A] text-white",
  operations: "border-[#0A0A0A]/25 bg-[#0A0A0A]/5 text-[#0A0A0A]/60",
  clients: "border-[#0A0A0A]/30 bg-transparent text-[#0A0A0A]/70",
  growth: "border-[#0A0A0A] bg-[#0A0A0A]/5 text-[#0A0A0A]",
  risk: "border-[#0A0A0A]/20 bg-[#0A0A0A]/8 text-[#0A0A0A]/70",
};

const PRIORITY_STYLES: Record<number, string> = {
  0: "border-[#0A0A0A]/20 bg-[#0A0A0A]/5",
  1: "border-[#0A0A0A]/25 bg-[#0A0A0A]/5",
  2: "border-[#0A0A0A]/30 bg-[#0A0A0A]/8",
};

export default async function IntelligencePage() {
  const [reports, latestInsights] = await Promise.all([
    db
      .select()
      .from(schema.weeklyReports)
      .orderBy(desc(schema.weeklyReports.weekOf))
      .limit(8),
    db
      .select()
      .from(schema.weeklyInsights)
      .orderBy(desc(schema.weeklyInsights.createdAt))
      .limit(20),
  ]);

  const latestReport = reports[0];

  // Group insights by week
  const insightsByWeek = new Map<string, typeof latestInsights>();
  for (const insight of latestInsights) {
    if (!insightsByWeek.has(insight.weekOf)) {
      insightsByWeek.set(insight.weekOf, []);
    }
    insightsByWeek.get(insight.weekOf)!.push(insight);
  }

  return (
    <div>
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold font-serif tracking-tight">
          Business Intelligence
        </h1>
        <p className="font-mono text-xs text-[#0A0A0A]/40 mt-1">
          AI-powered weekly analysis. Generated every Monday at 8 AM CT.
        </p>
      </div>

      {/* Latest Report */}
      {latestReport ? (
        <div className="border border-[#0A0A0A] bg-white p-6 mb-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-mono text-xs uppercase tracking-widest text-[#0A0A0A]/50">
              Week of {latestReport.weekOf}
            </h2>
            <span className="font-mono text-xs text-[#0A0A0A]/30">
              {latestReport.insightCount} insights
            </span>
          </div>
          <p className="font-serif text-base leading-relaxed">
            {latestReport.executiveSummary}
          </p>
        </div>
      ) : (
        <div className="border border-[#0A0A0A]/30 border-dashed bg-white p-12 text-center mb-6">
          <p className="font-serif text-[#0A0A0A]/40">
            No intelligence reports yet. The first report will generate
            automatically on Monday.
          </p>
        </div>
      )}

      {/* Insights Grid */}
      {latestReport && insightsByWeek.has(latestReport.weekOf) && (
        <div className="mb-8">
          <h2 className="font-mono text-xs uppercase tracking-widest text-[#0A0A0A]/50 mb-3">
            Key Insights
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {(insightsByWeek.get(latestReport.weekOf) || [])
              .sort((a, b) => b.priority - a.priority)
              .map((insight) => {
                const Icon =
                  CATEGORY_ICONS[insight.category] || Zap;
                return (
                  <div
                    key={insight.id}
                    className={`border p-4 ${PRIORITY_STYLES[insight.priority] ?? PRIORITY_STYLES[0]}`}
                  >
                    <div className="flex items-start gap-3">
                      <div className="mt-0.5">
                        <Icon className="h-4 w-4 text-[#0A0A0A]/50" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span
                            className={`inline-flex items-center px-1.5 py-0.5 text-[10px] font-mono border ${CATEGORY_STYLES[insight.category] ?? CATEGORY_STYLES.operations}`}
                          >
                            {insight.category}
                          </span>
                          {insight.priority >= 2 && (
                            <span className="inline-flex items-center px-1.5 py-0.5 text-[10px] font-mono bg-[#0A0A0A] text-white border border-[#0A0A0A]">
                              urgent
                            </span>
                          )}
                        </div>
                        <p className="font-serif text-sm font-bold mb-1">
                          {insight.title}
                        </p>
                        <p className="font-serif text-sm text-[#0A0A0A]/60 leading-relaxed">
                          {insight.summary}
                        </p>
                      </div>
                    </div>
                  </div>
                );
              })}
          </div>
        </div>
      )}

      {/* Report History */}
      {reports.length > 1 && (
        <div>
          <h2 className="font-mono text-xs uppercase tracking-widest text-[#0A0A0A]/50 mb-3">
            Previous Reports
          </h2>
          <div className="space-y-2">
            {reports.slice(1).map((report) => (
              <div
                key={report.id}
                className="border border-[#0A0A0A]/10 bg-white p-4"
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="font-mono text-xs text-[#0A0A0A]/50">
                    Week of {report.weekOf}
                  </span>
                  <span className="font-mono text-xs text-[#0A0A0A]/30">
                    {report.insightCount} insights
                  </span>
                </div>
                <p className="font-serif text-sm text-[#0A0A0A]/60">
                  {report.executiveSummary}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
