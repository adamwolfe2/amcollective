/**
 * Product Detail Page — /products/[slug]
 *
 * Drill-down view for a single portfolio product.
 * Sections: hero strip, sprint board, strategy recs, cost breakdown, connector data, activity feed
 */

import { notFound } from "next/navigation";
import Link from "next/link";
import { format, formatDistanceToNow } from "date-fns";
import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { eq, desc, and } from "drizzle-orm";
import * as trackrConnector from "@/lib/connectors/trackr";
import * as taskspaceConnector from "@/lib/connectors/taskspace";
import * as wholesailConnector from "@/lib/connectors/wholesail";
import * as cursiveConnector from "@/lib/connectors/cursive";
import * as tbgcConnector from "@/lib/connectors/tbgc";
import * as hookConnector from "@/lib/connectors/hook";
import * as stripeConnector from "@/lib/connectors/stripe";
import { getProjectContext } from "@/lib/intelligence/project-context";
import {
  ArrowLeft,
  TrendingUp,
  TrendingDown,
  Minus,
  DollarSign,
  Zap,
  Target,
  Activity,
} from "lucide-react";
import { statusBadge, statusText } from "@/lib/ui/status-colors";
import type { StatusCategory } from "@/lib/ui/status-colors";

interface PageProps {
  params: Promise<{ slug: string }>;
}

function formatCurrency(cents: number) {
  if (cents === 0) return "$0";
  return `$${Math.round(cents / 100).toLocaleString()}`;
}

const productStageCategory: Record<string, StatusCategory> = {
  idea: "neutral",
  building: "warning",
  beta: "info",
  launched: "positive",
  scaling: "info",
  mature: "neutral",
};

function StageBadge({ stage }: { stage: string | null }) {
  if (!stage) return null;
  const styles: Record<string, string> = Object.fromEntries(
    Object.entries(productStageCategory).map(([k, v]) => [k, statusBadge[v]])
  );
  return (
    <span className={`inline-flex items-center px-2 py-0.5 font-mono text-[9px] uppercase tracking-wider border ${styles[stage] ?? statusBadge.positive}`}>
      {stage}
    </span>
  );
}

function Stat({
  label,
  value,
  sub,
  alert,
}: {
  label: string;
  value: string;
  sub?: string;
  alert?: boolean;
}) {
  return (
    <div className="border border-[#0A0A0A]/10 bg-white px-4 py-3">
      <span className="font-mono text-[9px] uppercase tracking-wider text-[#0A0A0A]/40 block">{label}</span>
      <div className="flex items-baseline gap-1 mt-0.5">
        <span className={`font-mono font-bold text-base ${alert ? statusText.negative : ""}`}>{value}</span>
        {sub && <span className="font-mono text-[9px] text-[#0A0A0A]/40">{sub}</span>}
      </div>
    </div>
  );
}

export default async function ProductDetailPage({ params }: PageProps) {
  const { slug } = await params;

  // Load project metadata
  const [project] = await db
    .select()
    .from(schema.portfolioProjects)
    .where(eq(schema.portfolioProjects.slug, slug));

  if (!project) notFound();

  const now = Date.now();
  const daysLive = project.launchDate
    ? Math.floor((now - new Date(project.launchDate).getTime()) / (1000 * 60 * 60 * 24))
    : null;

  // Load all data in parallel
  const [
    mrrByCompanyResult,
    costs,
    sprintContext,
    strategyRecs,
    activityLogs,
  ] = await Promise.all([
    stripeConnector.getMRRByCompany().catch(() => ({ success: false as const, data: null })),

    // Subscription costs for this product
    db.select({
      id: schema.subscriptionCosts.id,
      name: schema.subscriptionCosts.name,
      amount: schema.subscriptionCosts.amount,
      billingCycle: schema.subscriptionCosts.billingCycle,
      category: schema.subscriptionCosts.category,
    })
      .from(schema.subscriptionCosts)
      .where(and(
        eq(schema.subscriptionCosts.companyTag, slug as "trackr" | "wholesail" | "taskspace" | "cursive" | "tbgc" | "hook" | "myvsl" | "am_collective" | "personal" | "untagged"),
        eq(schema.subscriptionCosts.isActive, true)
      ))
      .orderBy(desc(schema.subscriptionCosts.amount)),

    // Sprint context
    getProjectContext(project.id).catch(() => null),

    // Active strategy recommendations for this product
    db.select({
      id: schema.strategyRecommendations.id,
      type: schema.strategyRecommendations.type,
      priority: schema.strategyRecommendations.priority,
      title: schema.strategyRecommendations.title,
      situation: schema.strategyRecommendations.situation,
      recommendation: schema.strategyRecommendations.recommendation,
      expectedImpact: schema.strategyRecommendations.expectedImpact,
      estimatedValueCents: schema.strategyRecommendations.estimatedValueCents,
      effort: schema.strategyRecommendations.effort,
      weekOf: schema.strategyRecommendations.weekOf,
    })
      .from(schema.strategyRecommendations)
      .where(and(
        eq(schema.strategyRecommendations.product, slug),
        eq(schema.strategyRecommendations.status, "active")
      ))
      .orderBy(desc(schema.strategyRecommendations.priority), desc(schema.strategyRecommendations.createdAt))
      .limit(5),

    // Recent activity from audit logs for this project
    db.select({
      id: schema.auditLogs.id,
      action: schema.auditLogs.action,
      entityType: schema.auditLogs.entityType,
      createdAt: schema.auditLogs.createdAt,
    })
      .from(schema.auditLogs)
      .where(eq(schema.auditLogs.entityId, project.id))
      .orderBy(desc(schema.auditLogs.createdAt))
      .limit(10),
  ]);

  // Compute MRR from connector
  const mrrByCompany = mrrByCompanyResult.success ? (mrrByCompanyResult.data ?? []) : [];
  const stripeMrr = mrrByCompany.find((c) => c.companyTag === slug)?.mrr ?? 0;

  // Get connector-specific MRR — run all connectors in parallel, use only the relevant one
  let mrrCents = stripeMrr;
  let connectorData: Record<string, unknown> | null = null;

  const [
    trackrResult,
    taskspaceResult,
    wholesailResult,
    cursiveResult,
    tbgcResult,
    hookResult,
  ] = await Promise.allSettled([
    trackrConnector.getSnapshot().catch(() => null),
    taskspaceConnector.getSnapshot().catch(() => null),
    wholesailConnector.getSnapshot().catch(() => null),
    cursiveConnector.getSnapshot().catch(() => null),
    tbgcConnector.getSnapshot().catch(() => null),
    hookConnector.getSnapshot().catch(() => null),
  ]);

  if (slug === "trackr") {
    const r = trackrResult.status === "fulfilled" ? trackrResult.value : null;
    if (r?.success && r.data) {
      mrrCents = r.data.mrrCents || stripeMrr;
      connectorData = r.data as unknown as Record<string, unknown>;
    }
  } else if (slug === "taskspace") {
    const r = taskspaceResult.status === "fulfilled" ? taskspaceResult.value : null;
    if (r?.success && r.data) {
      mrrCents = r.data.mrrCents || stripeMrr;
      connectorData = r.data as unknown as Record<string, unknown>;
    }
  } else if (slug === "wholesail") {
    const r = wholesailResult.status === "fulfilled" ? wholesailResult.value : null;
    if (r?.success && r.data) {
      mrrCents = r.data.mrrFromRetainers > 0 ? r.data.mrrFromRetainers * 100 : stripeMrr;
      connectorData = r.data as unknown as Record<string, unknown>;
    }
  } else if (slug === "cursive") {
    const r = cursiveResult.status === "fulfilled" ? cursiveResult.value : null;
    if (r?.success && r.data) {
      connectorData = r.data as unknown as Record<string, unknown>;
    }
  } else if (slug === "tbgc") {
    const r = tbgcResult.status === "fulfilled" ? tbgcResult.value : null;
    if (r?.success && r.data) {
      mrrCents = r.data.mrrCents || stripeMrr;
      connectorData = r.data as unknown as Record<string, unknown>;
    }
  } else if (slug === "hook") {
    const r = hookResult.status === "fulfilled" ? hookResult.value : null;
    if (r?.success && r.data) {
      mrrCents = r.data.mrrCents || stripeMrr;
      connectorData = r.data as unknown as Record<string, unknown>;
    }
  }

  const totalCostCents = costs.reduce((s, c) => s + c.amount, 0);
  const marginPct = mrrCents > 0 ? Math.round(((mrrCents - totalCostCents) / mrrCents) * 100) : null;
  const goalPct = project.monthlyGoalCents && project.monthlyGoalCents > 0 && mrrCents > 0
    ? Math.min(100, Math.round((mrrCents / project.monthlyGoalCents) * 100))
    : null;

  const priorityLabel = (p: number) => {
    if (p === 2) return { label: "Urgent", color: statusBadge.negative };
    if (p === 1) return { label: "Action", color: statusBadge.warning };
    return { label: "Info", color: statusBadge.info };
  };

  return (
    <div className="space-y-6 pb-12">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2">
        <Link
          href="/products"
          className="flex items-center gap-1 font-mono text-[10px] text-[#0A0A0A]/40 hover:text-[#0A0A0A]/70 transition-colors"
        >
          <ArrowLeft size={11} />
          Products
        </Link>
        <span className="font-mono text-[10px] text-[#0A0A0A]/20">/</span>
        <span className="font-mono text-[10px] text-[#0A0A0A]/60">{project.name}</span>
      </div>

      {/* Hero Strip */}
      <div>
        <div className="flex items-start justify-between mb-3">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <h1 className="text-xl font-bold font-serif tracking-tight">{project.name}</h1>
              <StageBadge stage={project.productStage} />
            </div>
            {project.description && (
              <p className="font-serif text-sm text-[#0A0A0A]/60">{project.description}</p>
            )}
            {project.targetMarket && (
              <p className="font-mono text-[10px] text-[#0A0A0A]/40 mt-1">Target: {project.targetMarket}</p>
            )}
          </div>
          <div className="text-right">
            {daysLive !== null && (
              <p className="font-mono text-[10px] text-[#0A0A0A]/40">
                {daysLive}d live · launched {format(new Date(project.launchDate!), "MMM yyyy")}
              </p>
            )}
            {project.productStage === "building" && (
              <p className={`font-mono text-[10px] ${statusText.warning}`}>Not yet launched</p>
            )}
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <Stat
            label="MRR"
            value={mrrCents > 0 ? formatCurrency(mrrCents) : "Pre-revenue"}
          />
          <Stat
            label="Cost/mo"
            value={formatCurrency(totalCostCents)}
            sub={costs.length > 0 ? `${costs.length} subscriptions` : undefined}
          />
          <Stat
            label="Margin"
            value={marginPct !== null ? `${marginPct}%` : "—"}
            alert={marginPct !== null && marginPct < 30}
          />
          <Stat
            label="Monthly Goal"
            value={project.monthlyGoalCents ? formatCurrency(project.monthlyGoalCents) : "—"}
            sub={goalPct !== null ? `${goalPct}% there` : undefined}
          />
        </div>

        {/* Goal progress bar */}
        {goalPct !== null && (
          <div className="mt-2">
            <div className="h-1.5 bg-[#0A0A0A]/10">
              <div className="h-full bg-[#0A0A0A] transition-all" style={{ width: `${goalPct}%` }} />
            </div>
          </div>
        )}
      </div>

      {/* Sprint Board */}
      {sprintContext && (
        <div>
          <h2 className="font-mono text-[10px] uppercase tracking-wider text-[#0A0A0A]/40 mb-3 flex items-center gap-1.5">
            <Zap size={11} />
            Sprint Velocity
          </h2>
          <div className="border border-[#0A0A0A]/10 bg-white p-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
              <div>
                <span className="font-mono text-[9px] uppercase tracking-wider text-[#0A0A0A]/40 block">Velocity</span>
                <div className="flex items-center gap-1.5 mt-1">
                  {sprintContext.velocity === "accelerating" && <TrendingUp size={14} className={statusText.positive} />}
                  {sprintContext.velocity === "declining" && <TrendingDown size={14} className={statusText.negative} />}
                  {(sprintContext.velocity === "stable" || sprintContext.velocity === "inactive") && <Minus size={14} className={statusText.warning} />}
                  <span className="font-mono text-sm font-bold capitalize">{sprintContext.velocity}</span>
                </div>
              </div>
              <div>
                <span className="font-mono text-[9px] uppercase tracking-wider text-[#0A0A0A]/40 block">30d Completion</span>
                <span className="font-mono text-sm font-bold mt-1 block">{sprintContext.completionRate30d}%</span>
              </div>
              <div>
                <span className="font-mono text-[9px] uppercase tracking-wider text-[#0A0A0A]/40 block">Open Tasks</span>
                <span className={`font-mono text-sm font-bold mt-1 block ${sprintContext.openTaskCount > 10 ? statusText.warning : ""}`}>
                  {sprintContext.openTaskCount}
                </span>
              </div>
            </div>

            {sprintContext.currentWeekGoal && (
              <div className="border-t border-[#0A0A0A]/5 pt-3 mb-3">
                <span className="font-mono text-[9px] uppercase tracking-wider text-[#0A0A0A]/40 block mb-1">This week&apos;s goal</span>
                <p className="font-serif text-sm">{sprintContext.currentWeekGoal}</p>
              </div>
            )}

            {/* Recent sprint history bar chart */}
            {sprintContext.sprintHistory.length > 0 && (
              <div>
                <span className="font-mono text-[9px] uppercase tracking-wider text-[#0A0A0A]/40 block mb-2">Sprint history</span>
                <div className="flex items-end gap-1 h-12">
                  {sprintContext.sprintHistory.slice(0, 8).reverse().map((w, i) => (
                    <div
                      key={i}
                      className="flex-1 flex flex-col justify-end"
                      title={`${format(new Date(w.weekOf), "MMM d")}: ${w.doneTasks}/${w.totalTasks} (${w.pct}%)`}
                    >
                      <div
                        className="bg-[#0A0A0A] w-full min-h-[2px]"
                        style={{ height: `${Math.max(4, w.pct)}%` }}
                      />
                    </div>
                  ))}
                </div>
                <div className="flex justify-between mt-1">
                  <span className="font-mono text-[8px] text-[#0A0A0A]/30">
                    {sprintContext.sprintHistory.length > 0
                      ? format(new Date(sprintContext.sprintHistory[Math.min(7, sprintContext.sprintHistory.length - 1)].weekOf), "MMM d")
                      : ""}
                  </span>
                  <span className="font-mono text-[8px] text-[#0A0A0A]/30">
                    {sprintContext.sprintHistory.length > 0
                      ? format(new Date(sprintContext.sprintHistory[0].weekOf), "MMM d")
                      : ""}
                  </span>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Strategy Recommendations */}
      {strategyRecs.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-mono text-[10px] uppercase tracking-wider text-[#0A0A0A]/40 flex items-center gap-1.5">
              <Target size={11} />
              Strategy Recommendations
            </h2>
            <Link href="/strategy" className="font-mono text-[10px] text-[#0A0A0A]/40 hover:text-[#0A0A0A]/60">
              All recs →
            </Link>
          </div>
          <div className="space-y-2">
            {strategyRecs.map((rec) => {
              const { label, color } = priorityLabel(rec.priority ?? 0);
              return (
                <div key={rec.id} className="border border-[#0A0A0A]/10 bg-white p-4">
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <span className="font-serif font-bold text-sm">{rec.title}</span>
                    <span className={`shrink-0 inline-flex items-center px-2 py-0.5 font-mono text-[9px] uppercase tracking-wider border ${color}`}>
                      {label}
                    </span>
                  </div>
                  <p className="font-serif text-[12px] text-[#0A0A0A]/60 mb-2">{rec.situation}</p>
                  <p className="font-mono text-[11px] text-[#0A0A0A]/80">{rec.recommendation}</p>
                  <div className="flex items-center gap-3 mt-2 pt-2 border-t border-[#0A0A0A]/5">
                    <span className="font-mono text-[9px] text-[#0A0A0A]/40">Impact: {rec.expectedImpact}</span>
                    {rec.estimatedValueCents && (
                      <span className={`font-mono text-[9px] ${statusText.positive}`}>
                        ~{formatCurrency(rec.estimatedValueCents)}/mo
                      </span>
                    )}
                    <span className="font-mono text-[9px] text-[#0A0A0A]/30 capitalize">effort: {rec.effort}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Cost Breakdown */}
      {costs.length > 0 && (
        <div>
          <h2 className="font-mono text-[10px] uppercase tracking-wider text-[#0A0A0A]/40 mb-3 flex items-center gap-1.5">
            <DollarSign size={11} />
            Monthly Costs
          </h2>
          <div className="border border-[#0A0A0A]/10 bg-white divide-y divide-[#0A0A0A]/5">
            {costs.map((cost) => (
              <div key={cost.id} className="px-4 py-2.5 flex items-center justify-between">
                <div>
                  <span className="font-serif text-sm">{cost.name}</span>
                  {cost.category && (
                    <span className="ml-2 font-mono text-[9px] text-[#0A0A0A]/30">{cost.category}</span>
                  )}
                </div>
                <div className="text-right">
                  <span className="font-mono text-sm font-bold">{formatCurrency(cost.amount)}</span>
                  <span className="font-mono text-[9px] text-[#0A0A0A]/40 ml-1">/{cost.billingCycle ?? "mo"}</span>
                </div>
              </div>
            ))}
            <div className="px-4 py-2.5 flex items-center justify-between bg-[#0A0A0A]/[0.02]">
              <span className="font-mono text-[10px] font-bold uppercase tracking-wider">Total</span>
              <span className="font-mono font-bold">{formatCurrency(totalCostCents)}/mo</span>
            </div>
          </div>
        </div>
      )}

      {/* Connector Data (raw) */}
      {connectorData && (
        <div>
          <h2 className="font-mono text-[10px] uppercase tracking-wider text-[#0A0A0A]/40 mb-3">
            Live Connector Data
          </h2>
          <div className="border border-[#0A0A0A]/10 bg-white p-4">
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {Object.entries(connectorData)
                .filter(([, v]) => typeof v === "number" || typeof v === "string")
                .map(([key, value]) => (
                  <div key={key}>
                    <span className="font-mono text-[9px] uppercase tracking-wider text-[#0A0A0A]/40 block">
                      {key.replace(/([A-Z])/g, " $1").toLowerCase()}
                    </span>
                    <span className="font-mono text-sm font-bold">
                      {typeof value === "number" && key.toLowerCase().includes("cents")
                        ? formatCurrency(value as number)
                        : String(value)}
                    </span>
                  </div>
                ))}
            </div>
          </div>
        </div>
      )}

      {/* Activity Feed */}
      {activityLogs.length > 0 && (
        <div>
          <h2 className="font-mono text-[10px] uppercase tracking-wider text-[#0A0A0A]/40 mb-3 flex items-center gap-1.5">
            <Activity size={11} />
            Audit Activity
          </h2>
          <div className="border border-[#0A0A0A]/10 bg-white divide-y divide-[#0A0A0A]/5">
            {activityLogs.map((log) => (
              <div key={log.id} className="px-4 py-2.5 flex items-center justify-between">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="px-1.5 py-0.5 font-mono text-[8px] uppercase tracking-wider bg-[#0A0A0A]/5 text-[#0A0A0A]/50 shrink-0">
                    {log.action.slice(0, 12)}
                  </span>
                  <span className="font-serif text-[12px] text-[#0A0A0A]/60 truncate">{log.entityType}</span>
                </div>
                <span className="font-mono text-[9px] text-[#0A0A0A]/30 shrink-0">
                  {formatDistanceToNow(new Date(log.createdAt), { addSuffix: true })}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
