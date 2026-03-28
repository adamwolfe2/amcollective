"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { GenerateStrategyButton } from "./generate-button";
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

export interface RockRow {
  id: string;
  title: string;
  description: string | null;
  status: string;
  progress: number;
  quarter: string;
  dueDate: string | null;
}

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
    <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-semibold bg-[#0A0A0A] text-white border border-[#0A0A0A] rounded-none">
      <AlertTriangle className="h-3 w-3" /> URGENT
    </span>
  );
  if (priority === 1) return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-semibold bg-transparent text-[#0A0A0A]/70 border border-[#0A0A0A]/30 rounded-none">
      <Zap className="h-3 w-3" /> ACTION
    </span>
  );
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-semibold bg-[#0A0A0A]/5 text-[#0A0A0A]/60 border border-[#0A0A0A]/25 rounded-none">
      INFO
    </span>
  );
}

function TypeIcon({ type }: { type: string }) {
  const cls = "h-4 w-4";
  switch (type) {
    case "revenue_opportunity": return <DollarSign className={`${cls} text-[#0A0A0A]`} />;
    case "cost_reduction": return <TrendingDown className={`${cls} text-[#0A0A0A]/60`} />;
    case "risk": return <Shield className={`${cls} text-[#0A0A0A]/70`} />;
    case "growth": return <TrendingUp className={`${cls} text-[#0A0A0A]/50`} />;
    default: return <BarChart3 className={`${cls} text-[#0A0A0A]/40`} />;
  }
}

function HealthScoreMeter({ score }: { score: number }) {
  const color = score >= 80 ? "bg-[#0A0A0A]" : score >= 60 ? "bg-[#0A0A0A]/60" : score >= 40 ? "bg-[#0A0A0A]/40" : "bg-[#0A0A0A]/25";
  const label = score >= 80 ? "Healthy" : score >= 60 ? "Needs Attention" : score >= 40 ? "At Risk" : "Critical";
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-2 bg-[#0A0A0A]/5 border border-[#0A0A0A]/10 rounded-none overflow-hidden">
        <div className={`h-full ${color} transition-all`} style={{ width: `${score}%` }} />
      </div>
      <span className="text-xs font-mono font-semibold text-[#0A0A0A]">{score}/100</span>
      <span className="text-xs text-[#0A0A0A]/50">{label}</span>
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
    <div className={`border border-[#0A0A0A]/10 bg-white ${rec.priority === 2 ? "border-l-4 border-l-[#0A0A0A]" : rec.priority === 1 ? "border-l-4 border-l-[#0A0A0A]/40" : ""}`}>
      <button
        type="button"
        className="w-full text-left px-4 py-3 flex items-start gap-3 hover:bg-[#0A0A0A]/5 transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex-shrink-0 mt-0.5">
          <TypeIcon type={rec.type} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <PriorityBadge priority={rec.priority} />
            <span className="text-xs text-[#0A0A0A]/40 uppercase tracking-wide font-medium">
              {typeLabel[rec.type] ?? rec.type}
            </span>
            {rec.product && (
              <span className="text-xs px-1.5 py-0.5 bg-[#0A0A0A]/5 border border-[#0A0A0A]/10 text-[#0A0A0A]/60 rounded-none font-mono">
                {rec.product}
              </span>
            )}
            {rec.estimatedValueCents && (
              <span className="text-xs font-semibold text-[#0A0A0A]">
                ~{fmtMo(rec.estimatedValueCents)} impact
              </span>
            )}
          </div>
          <p className="text-sm font-semibold text-[#0A0A0A] leading-snug">{rec.title}</p>
        </div>
        <ChevronRight className={`h-4 w-4 text-[#0A0A0A]/30 flex-shrink-0 mt-1 transition-transform ${expanded ? "rotate-90" : ""}`} />
      </button>

      {expanded && (
        <div className="px-4 pb-4 border-t border-[#0A0A0A]/10">
          <div className="pt-3 space-y-3">
            <div>
              <p className="text-xs font-semibold text-[#0A0A0A]/50 uppercase tracking-wide mb-1">Situation</p>
              <p className="text-sm text-[#0A0A0A]/70 leading-relaxed">{rec.situation}</p>
            </div>
            <div>
              <p className="text-xs font-semibold text-[#0A0A0A]/50 uppercase tracking-wide mb-1">Recommended Action</p>
              <p className="text-sm text-[#0A0A0A] font-medium leading-relaxed">{rec.recommendation}</p>
            </div>
            <div>
              <p className="text-xs font-semibold text-[#0A0A0A]/50 uppercase tracking-wide mb-1">Expected Impact</p>
              <p className="text-sm text-[#0A0A0A]/70 leading-relaxed">{rec.expectedImpact}</p>
            </div>

            <div className="flex items-center gap-2 pt-1 flex-wrap">
              {rec.effort && (
                <span className={`text-xs px-2 py-0.5 border rounded-none font-medium ${
                  rec.effort === "low" ? "bg-[#0A0A0A]/5 text-[#0A0A0A] border-[#0A0A0A]/20" :
                  rec.effort === "medium" ? "bg-transparent text-[#0A0A0A]/70 border-[#0A0A0A]/30" :
                  "bg-[#0A0A0A]/8 text-[#0A0A0A]/70 border-[#0A0A0A]/20"
                }`}>
                  {rec.effort.charAt(0).toUpperCase() + rec.effort.slice(1)} effort
                </span>
              )}
              <div className="flex-1" />
              <button
                type="button"
                disabled={updating}
                onClick={() => startUpdate(() => onUpdate(rec.id, "done"))}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-[#0A0A0A] text-white hover:bg-[#0A0A0A]/80 border border-[#0A0A0A] transition-colors disabled:opacity-50"
              >
                <CheckCircle className="h-3.5 w-3.5" />
                Mark Done
              </button>
              <button
                type="button"
                disabled={updating}
                onClick={() => startUpdate(() => onUpdate(rec.id, "dismissed"))}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-[#0A0A0A]/50 hover:text-[#0A0A0A]/70 border border-[#0A0A0A]/10 hover:border-[#0A0A0A]/20 transition-colors disabled:opacity-50"
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
  rocks,
}: {
  metrics: StrategyMetricsData | null;
  recommendations: StrategyRec[];
  rocks: RockRow[];
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
    low: "text-[#0A0A0A]",
    medium: "text-[#0A0A0A]/60",
    high: "text-[#0A0A0A]/70",
    critical: "text-[#0A0A0A]/70",
  };

  return (
    <div className="space-y-6">
      {/* ── Run Analysis Bar ─────────────────────────────────────────────── */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-bold text-[#0A0A0A] tracking-tight">Strategic Command</h1>
          {metrics?.weekOf && (
            <p className="text-xs text-[#0A0A0A]/50 mt-0.5">
              Last analysis: week of {metrics.weekOf}
              {metrics.executiveSummary && (
                <span className="ml-2 text-[#0A0A0A]/60"> — {metrics.executiveSummary}</span>
              )}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {runMessage && (
            <span className="text-xs text-[#0A0A0A]/50 animate-pulse">{runMessage}</span>
          )}
          <Button
            variant="outline"
            size="sm"
            disabled={running}
            onClick={() => handleRunAnalysis(false)}
            className="border-[#0A0A0A]/10 text-[#0A0A0A]/70 hover:bg-[#0A0A0A]/5 rounded-none"
          >
            <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${running ? "animate-spin" : ""}`} />
            Run Analysis
          </Button>
          <Button
            size="sm"
            disabled={running}
            onClick={() => handleRunAnalysis(true)}
            className="bg-[#0A0A0A] text-white hover:bg-[#0A0A0A]/80 rounded-none text-xs"
          >
            <Zap className="h-3.5 w-3.5 mr-1.5" />
            Deep Analysis (Opus)
          </Button>
          <GenerateStrategyButton />
        </div>
      </div>

      {/* ── Executive Strip ──────────────────────────────────────────────── */}
      {metrics && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-0 border border-[#0A0A0A]/10">
          <div className="p-4 border-r border-[#0A0A0A]/10">
            <p className="text-xs text-[#0A0A0A]/50 uppercase tracking-wide font-medium mb-1">Cash Runway</p>
            <p className={`text-2xl font-bold font-mono ${runway !== null && runway < 6 ? "text-[#0A0A0A]/70" : runway !== null && runway < 12 ? "text-[#0A0A0A]/60" : "text-[#0A0A0A]"}`}>
              {runway !== null ? `${runway}mo` : "—"}
            </p>
            {metrics.totalCashCents > 0 && (
              <p className="text-xs text-[#0A0A0A]/50 mt-0.5">{fmtCents(metrics.totalCashCents)} on hand</p>
            )}
          </div>
          <div className="p-4 border-r border-[#0A0A0A]/10">
            <p className="text-xs text-[#0A0A0A]/50 uppercase tracking-wide font-medium mb-1">MRR Growth</p>
            <p className={`text-2xl font-bold font-mono flex items-center gap-1 ${growth === null ? "text-[#0A0A0A]/30" : growth > 0 ? "text-[#0A0A0A]" : growth < 0 ? "text-[#0A0A0A]/70" : "text-[#0A0A0A]/60"}`}>
              {growth === null ? "—" : (
                <>
                  {growth > 0 ? <TrendingUp className="h-5 w-5" /> : growth < 0 ? <TrendingDown className="h-5 w-5" /> : <Minus className="h-5 w-5" />}
                  {growth > 0 ? "+" : ""}{growth}%
                </>
              )}
            </p>
            <p className="text-xs text-[#0A0A0A]/50 mt-0.5">vs 30 days ago</p>
          </div>
          <div className="p-4 border-r border-[#0A0A0A]/10">
            <p className="text-xs text-[#0A0A0A]/50 uppercase tracking-wide font-medium mb-1">Best Margin</p>
            {bestMarginProduct ? (
              <>
                <p className="text-2xl font-bold font-mono text-[#0A0A0A]">{bestMarginProduct[1].marginPct}%</p>
                <p className="text-xs text-[#0A0A0A]/50 mt-0.5 capitalize">{bestMarginProduct[0]}</p>
              </>
            ) : (
              <p className="text-2xl font-bold font-mono text-[#0A0A0A]/30">—</p>
            )}
          </div>
          <div className="p-4">
            <p className="text-xs text-[#0A0A0A]/50 uppercase tracking-wide font-medium mb-2">Health Score</p>
            {healthScore !== null ? (
              <HealthScoreMeter score={healthScore} />
            ) : (
              <p className="text-sm text-[#0A0A0A]/30">No data yet</p>
            )}
            {metrics.riskLevel && (
              <p className={`text-xs font-semibold mt-1 capitalize ${riskColors[metrics.riskLevel] ?? "text-[#0A0A0A]/60"}`}>
                Risk: {metrics.riskLevel}
              </p>
            )}
          </div>
        </div>
      )}

      {/* ── SWOT Grid ────────────────────────────────────────────────────── */}
      {(metrics || sortedRecs.length > 0) && (
        <div className="border border-[#0A0A0A]/10 bg-white">
          <div className="px-4 py-3 border-b border-[#0A0A0A]/10">
            <h2 className="text-xs font-bold text-[#0A0A0A]/70 uppercase tracking-wide">SWOT Analysis</h2>
            <p className="text-xs text-[#0A0A0A]/30 mt-0.5">Derived from current metrics and AI recommendations</p>
          </div>
          <div className="grid grid-cols-2">
            {/* Strengths */}
            <div className="p-4 border-b border-r border-[#0A0A0A]/10">
              <p className="text-xs font-bold text-[#0A0A0A] uppercase tracking-wide mb-2">Strengths</p>
              <ul className="space-y-1">
                {metrics && metrics.healthScore !== null && metrics.healthScore >= 60 && (
                  <li className="text-xs text-[#0A0A0A]/70 flex gap-2">
                    <span className="shrink-0 font-mono text-[#0A0A0A]/30">—</span>
                    Health score {metrics.healthScore}/100
                  </li>
                )}
                {metrics && metrics.runwayMonths !== null && parseFloat(metrics.runwayMonths) >= 12 && (
                  <li className="text-xs text-[#0A0A0A]/70 flex gap-2">
                    <span className="shrink-0 font-mono text-[#0A0A0A]/30">—</span>
                    {parseFloat(metrics.runwayMonths)}mo cash runway
                  </li>
                )}
                {metrics && metrics.mrrGrowthPct !== null && parseFloat(metrics.mrrGrowthPct) > 0 && (
                  <li className="text-xs text-[#0A0A0A]/70 flex gap-2">
                    <span className="shrink-0 font-mono text-[#0A0A0A]/30">—</span>
                    +{metrics.mrrGrowthPct}% MRR growth
                  </li>
                )}
                {Object.entries(productMargins).filter(([, m]) => m.marginPct >= 70).map(([tag, m]) => (
                  <li key={tag} className="text-xs text-[#0A0A0A]/70 flex gap-2">
                    <span className="shrink-0 font-mono text-[#0A0A0A]/30">—</span>
                    {tag} at {m.marginPct}% margin
                  </li>
                ))}
                {metrics && Object.keys(productMargins).length === 0 && metrics.healthScore === null && (
                  <li className="text-xs text-[#0A0A0A]/30 italic">Run analysis to populate</li>
                )}
                {(!metrics || (metrics.healthScore === null && Object.keys(productMargins).length === 0 && (metrics.mrrGrowthPct === null || parseFloat(metrics.mrrGrowthPct ?? "0") <= 0))) && (
                  <li className="text-xs text-[#0A0A0A]/30 italic">No data yet</li>
                )}
              </ul>
            </div>
            {/* Weaknesses */}
            <div className="p-4 border-b border-[#0A0A0A]/10">
              <p className="text-xs font-bold text-[#0A0A0A]/70 uppercase tracking-wide mb-2">Weaknesses</p>
              <ul className="space-y-1">
                {metrics && metrics.runwayMonths !== null && parseFloat(metrics.runwayMonths) < 12 && (
                  <li className="text-xs text-[#0A0A0A]/70 flex gap-2">
                    <span className="shrink-0 font-mono text-[#0A0A0A]/30">—</span>
                    Only {parseFloat(metrics.runwayMonths)}mo runway
                  </li>
                )}
                {metrics && metrics.concentrationPct !== null && metrics.concentrationPct > 40 && (
                  <li className="text-xs text-[#0A0A0A]/70 flex gap-2">
                    <span className="shrink-0 font-mono text-[#0A0A0A]/30">—</span>
                    {metrics.concentrationPct}% revenue concentration
                  </li>
                )}
                {metrics && metrics.mrrGrowthPct !== null && parseFloat(metrics.mrrGrowthPct) < 0 && (
                  <li className="text-xs text-[#0A0A0A]/70 flex gap-2">
                    <span className="shrink-0 font-mono text-[#0A0A0A]/30">—</span>
                    {metrics.mrrGrowthPct}% MRR decline
                  </li>
                )}
                {recommendations.filter((r) => r.type === "cost_reduction" && (r.status === "active" || r.status === "in_progress")).slice(0, 2).map((r) => (
                  <li key={r.id} className="text-xs text-[#0A0A0A]/70 flex gap-2">
                    <span className="shrink-0 font-mono text-[#0A0A0A]/30">—</span>
                    {r.title}
                  </li>
                ))}
                {(!metrics || (metrics.runwayMonths === null && metrics.concentrationPct === null && (metrics.mrrGrowthPct === null || parseFloat(metrics.mrrGrowthPct ?? "0") >= 0))) && recommendations.filter((r) => r.type === "cost_reduction").length === 0 && (
                  <li className="text-xs text-[#0A0A0A]/30 italic">No data yet</li>
                )}
              </ul>
            </div>
            {/* Opportunities */}
            <div className="p-4 border-r border-[#0A0A0A]/10">
              <p className="text-xs font-bold text-[#0A0A0A]/50 uppercase tracking-wide mb-2">Opportunities</p>
              <ul className="space-y-1">
                {recommendations.filter((r) => (r.type === "revenue_opportunity" || r.type === "growth") && (r.status === "active" || r.status === "in_progress")).slice(0, 4).map((r) => (
                  <li key={r.id} className="text-xs text-[#0A0A0A]/60 flex gap-2">
                    <span className="shrink-0 font-mono text-[#0A0A0A]/30">—</span>
                    {r.title}
                    {r.estimatedValueCents && (
                      <span className="text-[#0A0A0A]/40 shrink-0">(~{fmtMo(r.estimatedValueCents)})</span>
                    )}
                  </li>
                ))}
                {recommendations.filter((r) => r.type === "revenue_opportunity" || r.type === "growth").length === 0 && (
                  <li className="text-xs text-[#0A0A0A]/30 italic">Run analysis to surface opportunities</li>
                )}
              </ul>
            </div>
            {/* Threats */}
            <div className="p-4">
              <p className="text-xs font-bold text-[#0A0A0A]/50 uppercase tracking-wide mb-2">Threats</p>
              <ul className="space-y-1">
                {recommendations.filter((r) => r.type === "risk" && (r.status === "active" || r.status === "in_progress")).slice(0, 4).map((r) => (
                  <li key={r.id} className="text-xs text-[#0A0A0A]/60 flex gap-2">
                    <span className="shrink-0 font-mono text-[#0A0A0A]/30">—</span>
                    {r.title}
                  </li>
                ))}
                {metrics && metrics.riskLevel && metrics.riskLevel !== "low" && recommendations.filter((r) => r.type === "risk").length === 0 && (
                  <li className="text-xs text-[#0A0A0A]/60 flex gap-2">
                    <span className="shrink-0 font-mono text-[#0A0A0A]/30">—</span>
                    Overall risk level: {metrics.riskLevel}
                  </li>
                )}
                {recommendations.filter((r) => r.type === "risk").length === 0 && (!metrics?.riskLevel || metrics.riskLevel === "low") && (
                  <li className="text-xs text-[#0A0A0A]/30 italic">No active threats identified</li>
                )}
              </ul>
            </div>
          </div>
        </div>
      )}

      {/* ── Two-column layout ────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">

        {/* ── Recommendations (3/5 width) ──────────────────────────────── */}
        <div className="lg:col-span-3 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-[#0A0A0A] uppercase tracking-wide">
              AI Recommendations
            </h2>
            <div className="flex items-center gap-2">
              {urgentCount > 0 && (
                <span className="text-xs font-semibold text-white bg-[#0A0A0A] border border-[#0A0A0A] px-2 py-0.5 rounded-none">
                  {urgentCount} urgent
                </span>
              )}
              {actionCount > 0 && (
                <span className="text-xs font-semibold text-[#0A0A0A]/70 bg-transparent border border-[#0A0A0A]/30 px-2 py-0.5 rounded-none">
                  {actionCount} action
                </span>
              )}
              {sortedRecs.length === 0 && (
                <span className="text-xs text-[#0A0A0A]/30">No active recommendations</span>
              )}
            </div>
          </div>

          {sortedRecs.length === 0 ? (
            <div className="border border-dashed border-[#0A0A0A]/10 p-8 text-center">
              <BarChart3 className="h-8 w-8 text-[#0A0A0A]/20 mx-auto mb-2" />
              <p className="text-sm text-[#0A0A0A]/50">No strategy analysis yet.</p>
              <p className="text-xs text-[#0A0A0A]/30 mt-1 mb-4">Generate one now or wait for the automatic Monday 8 AM run.</p>
              <div className="flex justify-center">
                <GenerateStrategyButton />
              </div>
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

          {/* Quarterly Rocks */}
          <div className="border border-[#0A0A0A]/10 bg-white">
            <div className="px-4 py-3 border-b border-[#0A0A0A]/10 flex items-center justify-between">
              <h2 className="text-xs font-bold text-[#0A0A0A]/70 uppercase tracking-wide">Quarterly Rocks</h2>
              {rocks.length > 0 && (
                <span className="text-xs text-[#0A0A0A]/30">{rocks[0].quarter}</span>
              )}
            </div>
            {rocks.length === 0 ? (
              <div className="p-4 text-center text-xs text-[#0A0A0A]/30">No rocks set for this quarter</div>
            ) : (
              <div className="divide-y divide-[#0A0A0A]/5">
                {rocks.map((rock) => {
                  const statusColor =
                    rock.status === "done"
                      ? "bg-[#0A0A0A] text-white"
                      : rock.status === "on_track"
                      ? "bg-[#0A0A0A]/10 text-[#0A0A0A]/70"
                      : rock.status === "at_risk"
                      ? "bg-[#0A0A0A]/20 text-[#0A0A0A]/80"
                      : "bg-[#0A0A0A]/5 text-[#0A0A0A]/50";
                  const statusLabel =
                    rock.status === "done"
                      ? "Done"
                      : rock.status === "on_track"
                      ? "On Track"
                      : rock.status === "at_risk"
                      ? "At Risk"
                      : "Off Track";
                  return (
                    <div key={rock.id} className="px-4 py-3 space-y-2">
                      <div className="flex items-start justify-between gap-2">
                        <p className={`text-xs font-medium leading-snug ${rock.status === "done" ? "text-[#0A0A0A]/40 line-through" : "text-[#0A0A0A]"}`}>
                          {rock.title}
                        </p>
                        <span className={`text-[9px] font-bold px-1.5 py-0.5 shrink-0 uppercase tracking-wider rounded-none ${statusColor}`}>
                          {statusLabel}
                        </span>
                      </div>
                      {rock.status !== "done" && (
                        <div className="flex items-center gap-2">
                          <div className="flex-1 h-1 bg-[#0A0A0A]/5">
                            <div
                              className="h-full bg-[#0A0A0A]/40"
                              style={{ width: `${rock.progress}%` }}
                            />
                          </div>
                          <span className="text-[9px] font-mono text-[#0A0A0A]/40 shrink-0">
                            {rock.progress}%
                          </span>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Product Profitability */}
          <div className="border border-[#0A0A0A]/10 bg-white">
            <div className="px-4 py-3 border-b border-[#0A0A0A]/10 flex items-center justify-between">
              <h2 className="text-xs font-bold text-[#0A0A0A]/70 uppercase tracking-wide">Product Profitability</h2>
              <span className="text-xs text-[#0A0A0A]/30">monthly</span>
            </div>
            {Object.keys(productMargins).length === 0 ? (
              <div className="p-4 text-center text-xs text-[#0A0A0A]/30">Run analysis to populate</div>
            ) : (
              <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[#0A0A0A]/5">
                    <th className="text-left px-4 py-2 text-xs text-[#0A0A0A]/50 font-medium">Product</th>
                    <th className="text-right px-2 py-2 text-xs text-[#0A0A0A]/50 font-medium">Rev</th>
                    <th className="text-right px-2 py-2 text-xs text-[#0A0A0A]/50 font-medium">Cost</th>
                    <th className="text-right px-4 py-2 text-xs text-[#0A0A0A]/50 font-medium">Margin</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#0A0A0A]/5">
                  {Object.entries(productMargins)
                    .sort((a, b) => b[1].mrrCents - a[1].mrrCents)
                    .map(([tag, m]) => (
                      <tr key={tag} className="hover:bg-[#0A0A0A]/[0.02]">
                        <td className="px-4 py-2 text-xs font-medium text-[#0A0A0A]/70 capitalize">{tag}</td>
                        <td className="px-2 py-2 text-xs text-right font-mono text-[#0A0A0A]/70">{fmtCents(m.mrrCents)}</td>
                        <td className="px-2 py-2 text-xs text-right font-mono text-[#0A0A0A]/50">{fmtCents(m.costCents)}</td>
                        <td className="px-4 py-2 text-right">
                          <span className={`text-xs font-bold font-mono ${m.marginPct >= 70 ? "text-[#0A0A0A]" : m.marginPct >= 50 ? "text-[#0A0A0A]/60" : "text-[#0A0A0A]/70"}`}>
                            {m.marginPct}%
                          </span>
                        </td>
                      </tr>
                    ))}
                </tbody>
                {metrics && (
                  <tfoot>
                    <tr className="border-t border-[#0A0A0A]/10 bg-[#0A0A0A]/5">
                      <td className="px-4 py-2 text-xs font-bold text-[#0A0A0A]/70">Platform</td>
                      <td className="px-2 py-2 text-xs text-right font-mono font-bold text-[#0A0A0A]/70">
                        {fmtCents(metrics.totalMrrCents)}
                      </td>
                      <td className="px-2 py-2 text-xs text-right font-mono text-[#0A0A0A]/50">
                        {fmtCents(metrics.monthlyBurnCents)}
                      </td>
                      <td className="px-4 py-2 text-right">
                        <span className="text-xs font-bold font-mono text-[#0A0A0A]">
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
            <div className="border border-[#0A0A0A]/10 bg-white">
              <div className="px-4 py-3 border-b border-[#0A0A0A]/10">
                <h2 className="text-xs font-bold text-[#0A0A0A]/70 uppercase tracking-wide">Revenue Forecast</h2>
                <p className="text-xs text-[#0A0A0A]/30 mt-0.5">Based on current growth trajectory</p>
              </div>
              <div className="divide-y divide-[#0A0A0A]/5">
                {forecast.map((f, i) => {
                  const current = metrics?.totalMrrCents ?? 0;
                  const growthAmt = f.projectedMrrCents - current;
                  return (
                    <div key={f.month} className="px-4 py-3 flex items-center justify-between">
                      <div>
                        <p className="text-xs font-medium text-[#0A0A0A]/70">{f.month}</p>
                        <p className="text-xs text-[#0A0A0A]/30">Month +{i + 1}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-bold font-mono text-[#0A0A0A]">{fmtCents(f.projectedMrrCents)}</p>
                        {growthAmt > 0 && (
                          <p className="text-xs text-[#0A0A0A] font-medium">+{fmtCents(growthAmt)}</p>
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
            <div className="border border-[#0A0A0A]/10 bg-white">
              <div className="px-4 py-3 border-b border-[#0A0A0A]/10">
                <h2 className="text-xs font-bold text-[#0A0A0A]/70 uppercase tracking-wide">Risk Register</h2>
              </div>
              <div className="divide-y divide-[#0A0A0A]/5">
                {/* Runway risk */}
                {runway !== null && (
                  <div className="px-4 py-3 flex items-start gap-3">
                    <span className={`text-xs font-bold px-1.5 py-0.5 rounded flex-shrink-0 ${runway < 6 ? "bg-[#0A0A0A]/10 text-[#0A0A0A]/70" : runway < 12 ? "bg-[#0A0A0A]/8 text-[#0A0A0A]/60" : "bg-[#0A0A0A]/5 text-[#0A0A0A]"}`}>
                      {runway < 6 ? "HIGH" : runway < 12 ? "MED" : "LOW"}
                    </span>
                    <div>
                      <p className="text-xs font-medium text-[#0A0A0A]">Cash Runway</p>
                      <p className="text-xs text-[#0A0A0A]/50">{runway}mo at {fmtMo(metrics.monthlyBurnCents)} burn</p>
                    </div>
                  </div>
                )}

                {/* Concentration risk */}
                {metrics.concentrationPct !== null && (
                  <div className="px-4 py-3 flex items-start gap-3">
                    <span className={`text-xs font-bold px-1.5 py-0.5 rounded flex-shrink-0 ${metrics.concentrationPct > 60 ? "bg-[#0A0A0A]/10 text-[#0A0A0A]/70" : metrics.concentrationPct > 40 ? "bg-[#0A0A0A]/8 text-[#0A0A0A]/60" : "bg-[#0A0A0A]/5 text-[#0A0A0A]"}`}>
                      {metrics.concentrationPct > 60 ? "HIGH" : metrics.concentrationPct > 40 ? "MED" : "LOW"}
                    </span>
                    <div>
                      <p className="text-xs font-medium text-[#0A0A0A]">Revenue Concentration</p>
                      <p className="text-xs text-[#0A0A0A]/50">Top product = {metrics.concentrationPct}% of MRR</p>
                    </div>
                  </div>
                )}

                {/* Urgent recommendations as risks */}
                {urgentCount > 0 && (
                  <div className="px-4 py-3 flex items-start gap-3">
                    <span className="text-xs font-bold px-1.5 py-0.5 rounded flex-shrink-0 bg-[#0A0A0A]/10 text-[#0A0A0A]/70">
                      HIGH
                    </span>
                    <div>
                      <p className="text-xs font-medium text-[#0A0A0A]">Open Urgent Items</p>
                      <p className="text-xs text-[#0A0A0A]/50">{urgentCount} recommendation{urgentCount > 1 ? "s" : ""} require immediate action</p>
                    </div>
                  </div>
                )}

                {runway === null && metrics.concentrationPct === null && urgentCount === 0 && (
                  <div className="px-4 py-3 text-xs text-[#0A0A0A]/30 text-center">Run analysis to populate risk register</div>
                )}
              </div>
            </div>
          )}

          {/* Completed / Dismissed */}
          {recommendations.filter((r) => r.status === "done" || r.status === "dismissed").length > 0 && (
            <div className="border border-[#0A0A0A]/5 bg-[#0A0A0A]/5">
              <div className="px-4 py-3 border-b border-[#0A0A0A]/5">
                <h2 className="text-xs font-bold text-[#0A0A0A]/30 uppercase tracking-wide flex items-center gap-1.5">
                  <Clock className="h-3.5 w-3.5" /> Resolved
                </h2>
              </div>
              <div className="divide-y divide-[#0A0A0A]/5">
                {recommendations
                  .filter((r) => r.status === "done" || r.status === "dismissed")
                  .slice(0, 5)
                  .map((r) => (
                    <div key={r.id} className="px-4 py-2.5 flex items-center gap-2">
                      {r.status === "done"
                        ? <CheckCircle className="h-3.5 w-3.5 text-[#0A0A0A] flex-shrink-0" />
                        : <XCircle className="h-3.5 w-3.5 text-[#0A0A0A]/30 flex-shrink-0" />}
                      <p className="text-xs text-[#0A0A0A]/50 line-through truncate">{r.title}</p>
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
