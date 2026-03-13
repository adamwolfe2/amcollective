"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  RefreshCw,
  TrendingUp,
  TrendingDown,
  Minus,
  AlertTriangle,
  CheckCircle,
  XCircle,
  ChevronRight,
  Zap,
  DollarSign,
  Shield,
  BarChart3,
  Clock,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface StrategyRec {
  id: string;
  type: "revenue_opportunity" | "cost_reduction" | "risk" | "growth" | "operations";
  product: string | null;
  priority: number;
  title: string;
  situation: string;
  recommendation: string;
  expectedImpact: string;
  estimatedValueCents: number | null;
  effort: string | null;
  status: string;
  weekOf: string;
  createdAt: Date;
}

export interface StrategyMetricsData {
  totalMrrCents: number;
  mrrGrowthPct: string | null;
  totalCashCents: number;
  monthlyBurnCents: number;
  runwayMonths: string | null;
  healthScore: number | null;
  concentrationPct: number | null;
  riskLevel: string | null;
  productMargins: Record<string, { mrrCents: number; costCents: number; marginPct: number }> | null;
  revenueForecast: Array<{ month: string; projectedMrrCents: number }> | null;
  executiveSummary: string | null;
  weekOf: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtCents(cents: number): string {
  return `$${Math.round(cents / 100).toLocaleString()}`;
}

function fmtMo(cents: number): string {
  return `${fmtCents(cents)}/mo`;
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function PriorityBadge({ priority }: { priority: number }) {
  if (priority === 2) return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-semibold bg-red-50 text-red-700 border border-red-200 rounded">
      <AlertTriangle className="h-3 w-3" /> URGENT
    </span>
  );
  if (priority === 1) return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-200 rounded">
      <Zap className="h-3 w-3" /> ACTION
    </span>
  );
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-200 rounded">
      INFO
    </span>
  );
}

function TypeIcon({ type }: { type: string }) {
  const cls = "h-4 w-4";
  switch (type) {
    case "revenue_opportunity": return <DollarSign className={`${cls} text-green-600`} />;
    case "cost_reduction": return <TrendingDown className={`${cls} text-blue-600`} />;
    case "risk": return <Shield className={`${cls} text-red-600`} />;
    case "growth": return <TrendingUp className={`${cls} text-purple-600`} />;
    default: return <BarChart3 className={`${cls} text-gray-600`} />;
  }
}

function HealthScoreMeter({ score }: { score: number }) {
  const color = score >= 80 ? "bg-green-500" : score >= 60 ? "bg-amber-500" : score >= 40 ? "bg-orange-500" : "bg-red-500";
  const label = score >= 80 ? "Healthy" : score >= 60 ? "Needs Attention" : score >= 40 ? "At Risk" : "Critical";
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-2 bg-gray-100 border border-gray-200 rounded-none overflow-hidden">
        <div className={`h-full ${color} transition-all`} style={{ width: `${score}%` }} />
      </div>
      <span className="text-xs font-mono font-semibold text-gray-700">{score}/100</span>
      <span className="text-xs text-gray-500">{label}</span>
    </div>
  );
}

// ─── Recommendation Card ──────────────────────────────────────────────────────

function RecommendationCard({
  rec,
  onUpdate,
}: {
  rec: StrategyRec;
  onUpdate: (id: string, status: string) => void;
}) {
  const [expanded, setExpanded] = useState(rec.priority === 2);
  const [updating, startUpdate] = useTransition();

  const typeLabel: Record<string, string> = {
    revenue_opportunity: "Revenue",
    cost_reduction: "Cost Cut",
    risk: "Risk",
    growth: "Growth",
    operations: "Operations",
  };

  return (
    <div className={`border border-gray-200 bg-white ${rec.priority === 2 ? "border-l-4 border-l-red-500" : rec.priority === 1 ? "border-l-4 border-l-amber-400" : ""}`}>
      <button
        type="button"
        className="w-full text-left px-4 py-3 flex items-start gap-3 hover:bg-gray-50 transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex-shrink-0 mt-0.5">
          <TypeIcon type={rec.type} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <PriorityBadge priority={rec.priority} />
            <span className="text-xs text-gray-400 uppercase tracking-wide font-medium">
              {typeLabel[rec.type] ?? rec.type}
            </span>
            {rec.product && (
              <span className="text-xs px-1.5 py-0.5 bg-gray-100 border border-gray-200 text-gray-600 rounded font-mono">
                {rec.product}
              </span>
            )}
            {rec.estimatedValueCents && (
              <span className="text-xs font-semibold text-green-700">
                ~{fmtMo(rec.estimatedValueCents)} impact
              </span>
            )}
          </div>
          <p className="text-sm font-semibold text-gray-900 leading-snug">{rec.title}</p>
        </div>
        <ChevronRight className={`h-4 w-4 text-gray-400 flex-shrink-0 mt-1 transition-transform ${expanded ? "rotate-90" : ""}`} />
      </button>

      {expanded && (
        <div className="px-4 pb-4 border-t border-gray-100">
          <div className="pt-3 space-y-3">
            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Situation</p>
              <p className="text-sm text-gray-700 leading-relaxed">{rec.situation}</p>
            </div>
            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Recommended Action</p>
              <p className="text-sm text-gray-900 font-medium leading-relaxed">{rec.recommendation}</p>
            </div>
            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Expected Impact</p>
              <p className="text-sm text-gray-700 leading-relaxed">{rec.expectedImpact}</p>
            </div>

            <div className="flex items-center gap-2 pt-1 flex-wrap">
              {rec.effort && (
                <span className={`text-xs px-2 py-0.5 border rounded font-medium ${
                  rec.effort === "low" ? "bg-green-50 text-green-700 border-green-200" :
                  rec.effort === "medium" ? "bg-amber-50 text-amber-700 border-amber-200" :
                  "bg-red-50 text-red-700 border-red-200"
                }`}>
                  {rec.effort.charAt(0).toUpperCase() + rec.effort.slice(1)} effort
                </span>
              )}
              <div className="flex-1" />
              <button
                type="button"
                disabled={updating}
                onClick={() => startUpdate(() => onUpdate(rec.id, "done"))}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-gray-900 text-white hover:bg-gray-700 border border-gray-900 transition-colors disabled:opacity-50"
              >
                <CheckCircle className="h-3.5 w-3.5" />
                Mark Done
              </button>
              <button
                type="button"
                disabled={updating}
                onClick={() => startUpdate(() => onUpdate(rec.id, "dismissed"))}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-500 hover:text-gray-700 border border-gray-200 hover:border-gray-300 transition-colors disabled:opacity-50"
              >
                <XCircle className="h-3.5 w-3.5" />
                Dismiss
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main Client Component ────────────────────────────────────────────────────

export function StrategyClient({
  metrics,
  recommendations: initialRecs,
}: {
  metrics: StrategyMetricsData | null;
  recommendations: StrategyRec[];
}) {
  const [recommendations, setRecommendations] = useState(initialRecs);
  const [running, startRunning] = useTransition();
  const [runMessage, setRunMessage] = useState<string | null>(null);
  const router = useRouter();

  async function handleRunAnalysis(useOpus = false) {
    startRunning(async () => {
      try {
        const res = await fetch("/api/strategy/run-analysis", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ useOpus }),
        });
        const data = await res.json() as { message?: string };
        setRunMessage(data.message ?? "Analysis triggered.");
        setTimeout(() => {
          setRunMessage(null);
          router.refresh();
        }, 35000);
      } catch {
        setRunMessage("Failed to trigger analysis.");
      }
    });
  }

  async function handleUpdateRec(id: string, status: string) {
    await fetch(`/api/strategy/recommendations/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    setRecommendations((prev) =>
      prev.map((r) => r.id === id ? { ...r, status } : r)
    );
  }

  const activeRecs = recommendations.filter((r) => r.status === "active" || r.status === "in_progress");
  const sortedRecs = [...activeRecs].sort((a, b) => {
    if (b.priority !== a.priority) return b.priority - a.priority;
    return (b.estimatedValueCents ?? 0) - (a.estimatedValueCents ?? 0);
  });

  const urgentCount = sortedRecs.filter((r) => r.priority === 2).length;
  const actionCount = sortedRecs.filter((r) => r.priority === 1).length;

  const productMargins = metrics?.productMargins ?? {};
  const forecast = metrics?.revenueForecast ?? [];
  const healthScore = metrics?.healthScore ?? null;
  const runway = metrics?.runwayMonths ? parseFloat(metrics.runwayMonths) : null;
  const growth = metrics?.mrrGrowthPct ? parseFloat(metrics.mrrGrowthPct) : null;

  // Find best-margin product
  const bestMarginProduct = Object.entries(productMargins)
    .sort((a, b) => b[1].marginPct - a[1].marginPct)[0];

  const riskColors: Record<string, string> = {
    low: "text-green-700",
    medium: "text-amber-700",
    high: "text-orange-700",
    critical: "text-red-700",
  };

  return (
    <div className="space-y-6">
      {/* ── Run Analysis Bar ─────────────────────────────────────────────── */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-bold text-gray-900 tracking-tight">Strategic Command</h1>
          {metrics?.weekOf && (
            <p className="text-xs text-gray-500 mt-0.5">
              Last analysis: week of {metrics.weekOf}
              {metrics.executiveSummary && (
                <span className="ml-2 text-gray-600"> — {metrics.executiveSummary}</span>
              )}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          {runMessage && (
            <span className="text-xs text-gray-500 animate-pulse">{runMessage}</span>
          )}
          <Button
            variant="outline"
            size="sm"
            disabled={running}
            onClick={() => handleRunAnalysis(false)}
            className="border-gray-200 text-gray-700 hover:bg-gray-50 rounded-none"
          >
            <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${running ? "animate-spin" : ""}`} />
            Run Analysis
          </Button>
          <Button
            size="sm"
            disabled={running}
            onClick={() => handleRunAnalysis(true)}
            className="bg-gray-900 text-white hover:bg-gray-700 rounded-none text-xs"
          >
            <Zap className="h-3.5 w-3.5 mr-1.5" />
            Deep Analysis (Opus)
          </Button>
        </div>
      </div>

      {/* ── Executive Strip ──────────────────────────────────────────────── */}
      {metrics && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-0 border border-gray-200">
          <div className="p-4 border-r border-gray-200">
            <p className="text-xs text-gray-500 uppercase tracking-wide font-medium mb-1">Cash Runway</p>
            <p className={`text-2xl font-bold font-mono ${runway !== null && runway < 6 ? "text-red-700" : runway !== null && runway < 12 ? "text-amber-700" : "text-gray-900"}`}>
              {runway !== null ? `${runway}mo` : "—"}
            </p>
            {metrics.totalCashCents > 0 && (
              <p className="text-xs text-gray-500 mt-0.5">{fmtCents(metrics.totalCashCents)} on hand</p>
            )}
          </div>
          <div className="p-4 border-r border-gray-200">
            <p className="text-xs text-gray-500 uppercase tracking-wide font-medium mb-1">MRR Growth</p>
            <p className={`text-2xl font-bold font-mono flex items-center gap-1 ${growth === null ? "text-gray-400" : growth > 0 ? "text-green-700" : growth < 0 ? "text-red-700" : "text-gray-600"}`}>
              {growth === null ? "—" : (
                <>
                  {growth > 0 ? <TrendingUp className="h-5 w-5" /> : growth < 0 ? <TrendingDown className="h-5 w-5" /> : <Minus className="h-5 w-5" />}
                  {growth > 0 ? "+" : ""}{growth}%
                </>
              )}
            </p>
            <p className="text-xs text-gray-500 mt-0.5">vs 30 days ago</p>
          </div>
          <div className="p-4 border-r border-gray-200">
            <p className="text-xs text-gray-500 uppercase tracking-wide font-medium mb-1">Best Margin</p>
            {bestMarginProduct ? (
              <>
                <p className="text-2xl font-bold font-mono text-gray-900">{bestMarginProduct[1].marginPct}%</p>
                <p className="text-xs text-gray-500 mt-0.5 capitalize">{bestMarginProduct[0]}</p>
              </>
            ) : (
              <p className="text-2xl font-bold font-mono text-gray-400">—</p>
            )}
          </div>
          <div className="p-4">
            <p className="text-xs text-gray-500 uppercase tracking-wide font-medium mb-2">Health Score</p>
            {healthScore !== null ? (
              <HealthScoreMeter score={healthScore} />
            ) : (
              <p className="text-sm text-gray-400">No data yet</p>
            )}
            {metrics.riskLevel && (
              <p className={`text-xs font-semibold mt-1 capitalize ${riskColors[metrics.riskLevel] ?? "text-gray-600"}`}>
                Risk: {metrics.riskLevel}
              </p>
            )}
          </div>
        </div>
      )}

      {/* ── Two-column layout ────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">

        {/* ── Recommendations (3/5 width) ──────────────────────────────── */}
        <div className="lg:col-span-3 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-gray-900 uppercase tracking-wide">
              AI Recommendations
            </h2>
            <div className="flex items-center gap-2">
              {urgentCount > 0 && (
                <span className="text-xs font-semibold text-red-700 bg-red-50 border border-red-200 px-2 py-0.5 rounded">
                  {urgentCount} urgent
                </span>
              )}
              {actionCount > 0 && (
                <span className="text-xs font-semibold text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded">
                  {actionCount} action
                </span>
              )}
              {sortedRecs.length === 0 && (
                <span className="text-xs text-gray-400">No active recommendations</span>
              )}
            </div>
          </div>

          {sortedRecs.length === 0 ? (
            <div className="border border-dashed border-gray-200 p-8 text-center">
              <BarChart3 className="h-8 w-8 text-gray-300 mx-auto mb-2" />
              <p className="text-sm text-gray-500">No active recommendations.</p>
              <p className="text-xs text-gray-400 mt-1">Run an analysis to generate strategic insights.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {sortedRecs.map((rec) => (
                <RecommendationCard key={rec.id} rec={rec} onUpdate={handleUpdateRec} />
              ))}
            </div>
          )}
        </div>

        {/* ── Right sidebar (2/5 width) ────────────────────────────────── */}
        <div className="lg:col-span-2 space-y-4">

          {/* Product Profitability */}
          <div className="border border-gray-200 bg-white">
            <div className="px-4 py-3 border-b border-gray-200 flex items-center justify-between">
              <h2 className="text-xs font-bold text-gray-700 uppercase tracking-wide">Product Profitability</h2>
              <span className="text-xs text-gray-400">monthly</span>
            </div>
            {Object.keys(productMargins).length === 0 ? (
              <div className="p-4 text-center text-xs text-gray-400">Run analysis to populate</div>
            ) : (
              <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100">
                    <th className="text-left px-4 py-2 text-xs text-gray-500 font-medium">Product</th>
                    <th className="text-right px-2 py-2 text-xs text-gray-500 font-medium">Rev</th>
                    <th className="text-right px-2 py-2 text-xs text-gray-500 font-medium">Cost</th>
                    <th className="text-right px-4 py-2 text-xs text-gray-500 font-medium">Margin</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {Object.entries(productMargins)
                    .sort((a, b) => b[1].mrrCents - a[1].mrrCents)
                    .map(([tag, m]) => (
                      <tr key={tag} className="hover:bg-gray-50">
                        <td className="px-4 py-2 text-xs font-medium text-gray-700 capitalize">{tag}</td>
                        <td className="px-2 py-2 text-xs text-right font-mono text-gray-700">{fmtCents(m.mrrCents)}</td>
                        <td className="px-2 py-2 text-xs text-right font-mono text-gray-500">{fmtCents(m.costCents)}</td>
                        <td className="px-4 py-2 text-right">
                          <span className={`text-xs font-bold font-mono ${m.marginPct >= 70 ? "text-green-700" : m.marginPct >= 50 ? "text-amber-700" : "text-red-700"}`}>
                            {m.marginPct}%
                          </span>
                        </td>
                      </tr>
                    ))}
                </tbody>
                {metrics && (
                  <tfoot>
                    <tr className="border-t border-gray-200 bg-gray-50">
                      <td className="px-4 py-2 text-xs font-bold text-gray-700">Platform</td>
                      <td className="px-2 py-2 text-xs text-right font-mono font-bold text-gray-700">
                        {fmtCents(metrics.totalMrrCents)}
                      </td>
                      <td className="px-2 py-2 text-xs text-right font-mono text-gray-500">
                        {fmtCents(metrics.monthlyBurnCents)}
                      </td>
                      <td className="px-4 py-2 text-right">
                        <span className="text-xs font-bold font-mono text-gray-900">
                          {metrics.totalMrrCents > 0
                            ? `${Math.round(((metrics.totalMrrCents - metrics.monthlyBurnCents) / metrics.totalMrrCents) * 100)}%`
                            : "—"}
                        </span>
                      </td>
                    </tr>
                  </tfoot>
                )}
              </table>
              </div>
            )}
          </div>

          {/* Revenue Forecast */}
          {forecast.length > 0 && (
            <div className="border border-gray-200 bg-white">
              <div className="px-4 py-3 border-b border-gray-200">
                <h2 className="text-xs font-bold text-gray-700 uppercase tracking-wide">Revenue Forecast</h2>
                <p className="text-xs text-gray-400 mt-0.5">Based on current growth trajectory</p>
              </div>
              <div className="divide-y divide-gray-50">
                {forecast.map((f, i) => {
                  const current = metrics?.totalMrrCents ?? 0;
                  const growthAmt = f.projectedMrrCents - current;
                  return (
                    <div key={f.month} className="px-4 py-3 flex items-center justify-between">
                      <div>
                        <p className="text-xs font-medium text-gray-700">{f.month}</p>
                        <p className="text-xs text-gray-400">Month +{i + 1}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-bold font-mono text-gray-900">{fmtCents(f.projectedMrrCents)}</p>
                        {growthAmt > 0 && (
                          <p className="text-xs text-green-700 font-medium">+{fmtCents(growthAmt)}</p>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Risk Register */}
          {metrics && (
            <div className="border border-gray-200 bg-white">
              <div className="px-4 py-3 border-b border-gray-200">
                <h2 className="text-xs font-bold text-gray-700 uppercase tracking-wide">Risk Register</h2>
              </div>
              <div className="divide-y divide-gray-50">
                {/* Runway risk */}
                {runway !== null && (
                  <div className="px-4 py-3 flex items-start gap-3">
                    <span className={`text-xs font-bold px-1.5 py-0.5 rounded flex-shrink-0 ${runway < 6 ? "bg-red-100 text-red-700" : runway < 12 ? "bg-amber-100 text-amber-700" : "bg-green-100 text-green-700"}`}>
                      {runway < 6 ? "HIGH" : runway < 12 ? "MED" : "LOW"}
                    </span>
                    <div>
                      <p className="text-xs font-medium text-gray-800">Cash Runway</p>
                      <p className="text-xs text-gray-500">{runway}mo at {fmtMo(metrics.monthlyBurnCents)} burn</p>
                    </div>
                  </div>
                )}

                {/* Concentration risk */}
                {metrics.concentrationPct !== null && (
                  <div className="px-4 py-3 flex items-start gap-3">
                    <span className={`text-xs font-bold px-1.5 py-0.5 rounded flex-shrink-0 ${metrics.concentrationPct > 60 ? "bg-red-100 text-red-700" : metrics.concentrationPct > 40 ? "bg-amber-100 text-amber-700" : "bg-green-100 text-green-700"}`}>
                      {metrics.concentrationPct > 60 ? "HIGH" : metrics.concentrationPct > 40 ? "MED" : "LOW"}
                    </span>
                    <div>
                      <p className="text-xs font-medium text-gray-800">Revenue Concentration</p>
                      <p className="text-xs text-gray-500">Top product = {metrics.concentrationPct}% of MRR</p>
                    </div>
                  </div>
                )}

                {/* Urgent recommendations as risks */}
                {urgentCount > 0 && (
                  <div className="px-4 py-3 flex items-start gap-3">
                    <span className="text-xs font-bold px-1.5 py-0.5 rounded flex-shrink-0 bg-red-100 text-red-700">
                      HIGH
                    </span>
                    <div>
                      <p className="text-xs font-medium text-gray-800">Open Urgent Items</p>
                      <p className="text-xs text-gray-500">{urgentCount} recommendation{urgentCount > 1 ? "s" : ""} require immediate action</p>
                    </div>
                  </div>
                )}

                {runway === null && metrics.concentrationPct === null && urgentCount === 0 && (
                  <div className="px-4 py-3 text-xs text-gray-400 text-center">Run analysis to populate risk register</div>
                )}
              </div>
            </div>
          )}

          {/* Completed / Dismissed */}
          {recommendations.filter((r) => r.status === "done" || r.status === "dismissed").length > 0 && (
            <div className="border border-gray-100 bg-gray-50">
              <div className="px-4 py-3 border-b border-gray-100">
                <h2 className="text-xs font-bold text-gray-400 uppercase tracking-wide flex items-center gap-1.5">
                  <Clock className="h-3.5 w-3.5" /> Resolved
                </h2>
              </div>
              <div className="divide-y divide-gray-100">
                {recommendations
                  .filter((r) => r.status === "done" || r.status === "dismissed")
                  .slice(0, 5)
                  .map((r) => (
                    <div key={r.id} className="px-4 py-2.5 flex items-center gap-2">
                      {r.status === "done"
                        ? <CheckCircle className="h-3.5 w-3.5 text-green-500 flex-shrink-0" />
                        : <XCircle className="h-3.5 w-3.5 text-gray-400 flex-shrink-0" />}
                      <p className="text-xs text-gray-500 line-through truncate">{r.title}</p>
                    </div>
                  ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
