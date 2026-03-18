/**
 * Products Index — Grid of all 6 portfolio products
 * Shows stage, MRR, cost, margin, sprint velocity, and links to detail page
 */

import Link from "next/link";
import Image from "next/image";
import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { eq, sql } from "drizzle-orm";
import * as trackrConnector from "@/lib/connectors/trackr";
import * as taskspaceConnector from "@/lib/connectors/taskspace";
import * as wholesailConnector from "@/lib/connectors/wholesail";
import * as tbgcConnector from "@/lib/connectors/tbgc";
import * as hookConnector from "@/lib/connectors/hook";
import * as stripeConnector from "@/lib/connectors/stripe";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";
import { statusBadge, statusText } from "@/lib/ui/status-colors";
import type { StatusCategory } from "@/lib/ui/status-colors";
import { getProductLogo } from "@/lib/ui/product-logos";

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

function VelocityIcon({ label }: { label: string | null }) {
  if (!label) return <Minus size={12} className="text-[#0A0A0A]/30" />;
  if (label === "accelerating") return <TrendingUp size={12} className={statusText.positive} />;
  if (label === "declining") return <TrendingDown size={12} className={statusText.negative} />;
  return <Minus size={12} className={statusText.warning} />;
}

interface ProductRow {
  slug: string;
  name: string;
  stage: string | null;
  daysLive: number | null;
  mrrCents: number;
  monthlyCostCents: number;
  marginPct: number;
  velocityLabel: string | null;
  description: string | null;
  targetMarket: string | null;
  monthlyGoalCents: number | null;
}

export default async function ProductsPage() {
  // Fetch all product data in parallel
  const [projects, trackrResult, taskspaceResult, wholesailResult, , tbgcResult, hookResult, mrrByCompanyResult] =
    await Promise.all([
      db.select({
        id: schema.portfolioProjects.id,
        name: schema.portfolioProjects.name,
        slug: schema.portfolioProjects.slug,
        launchDate: schema.portfolioProjects.launchDate,
        productStage: schema.portfolioProjects.productStage,
        description: schema.portfolioProjects.description,
        targetMarket: schema.portfolioProjects.targetMarket,
        monthlyGoalCents: schema.portfolioProjects.monthlyGoalCents,
        velocityLabel: schema.portfolioProjects.velocityLabel,
      }).from(schema.portfolioProjects).where(eq(schema.portfolioProjects.status, "active")),

      trackrConnector.getSnapshot().catch(() => ({ success: false as const, data: null })),
      taskspaceConnector.getSnapshot().catch(() => ({ success: false as const, data: null })),
      wholesailConnector.getSnapshot().catch(() => ({ success: false as const, data: null })),
      Promise.resolve({ success: false as const, data: null }), // cursive: MRR via Stripe
      tbgcConnector.getSnapshot().catch(() => ({ success: false as const, data: null })),
      hookConnector.getSnapshot().catch(() => ({ success: false as const, data: null })),
      stripeConnector.getMRRByCompany().catch(() => ({ success: false as const, data: null })),

      db.select({
        tag: schema.subscriptionCosts.companyTag,
        total: sql<number>`COALESCE(SUM(${schema.subscriptionCosts.amount}), 0)`,
      }).from(schema.subscriptionCosts).where(eq(schema.subscriptionCosts.isActive, true)).groupBy(schema.subscriptionCosts.companyTag),
    ]);

  const mrrByCompany = mrrByCompanyResult.success ? (mrrByCompanyResult.data ?? []) : [];
  const getStripeMrr = (tag: string) => mrrByCompany.find((c) => c.companyTag === tag)?.mrr ?? 0;

  const now = Date.now();

  // Build product rows
  const productRows: ProductRow[] = projects.map((p) => {
    let mrrCents = 0;

    if (p.slug === "trackr" && trackrResult.success && trackrResult.data) {
      mrrCents = trackrResult.data.mrrCents || getStripeMrr("trackr");
    } else if (p.slug === "taskspace" && taskspaceResult.success && taskspaceResult.data) {
      mrrCents = taskspaceResult.data.mrrCents || getStripeMrr("taskspace");
    } else if (p.slug === "wholesail" && wholesailResult.success && wholesailResult.data) {
      const d = wholesailResult.data;
      mrrCents = d.mrrFromRetainers > 0 ? d.mrrFromRetainers * 100 : getStripeMrr("wholesail");
    } else if (p.slug === "cursive") {
      mrrCents = getStripeMrr("cursive");
    } else if (p.slug === "tbgc") {
      mrrCents = tbgcResult.success && tbgcResult.data ? tbgcResult.data.mrrCents : getStripeMrr("tbgc");
    } else if (p.slug === "hook") {
      mrrCents = hookResult.success && hookResult.data ? hookResult.data.mrrCents : getStripeMrr("hook");
    } else if (p.slug === "myvsl") {
      mrrCents = getStripeMrr("myvsl");
    }

    const daysLive = p.launchDate
      ? Math.floor((now - new Date(p.launchDate).getTime()) / (1000 * 60 * 60 * 24))
      : null;

    return {
      slug: p.slug,
      name: p.name,
      stage: p.productStage,
      daysLive,
      mrrCents,
      monthlyCostCents: 0, // costs not in scope for index — see detail page
      marginPct: 0,
      velocityLabel: p.velocityLabel,
      description: p.description,
      targetMarket: p.targetMarket,
      monthlyGoalCents: p.monthlyGoalCents,
    };
  });

  const totalMrr = productRows.reduce((s, p) => s + p.mrrCents, 0);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold font-serif tracking-tight">Products</h1>
          <p className="font-mono text-[10px] text-[#0A0A0A]/40 mt-0.5">
            {productRows.length} portfolio products — {totalMrr > 0 ? `$${Math.round(totalMrr / 100).toLocaleString()} combined MRR` : "platform building phase"}
          </p>
        </div>
        <Link
          href="/strategy"
          className="flex items-center gap-1.5 px-3 py-1.5 font-mono text-[10px] border border-[#0A0A0A]/15 bg-white hover:border-[#0A0A0A]/30 transition-colors"
        >
          <TrendingUp size={11} />
          Strategy →
        </Link>
      </div>

      {/* Product Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {productRows.map((product) => {
          const goalPct = product.monthlyGoalCents && product.monthlyGoalCents > 0 && product.mrrCents > 0
            ? Math.min(100, Math.round((product.mrrCents / product.monthlyGoalCents) * 100))
            : null;

          return (
            <Link
              key={product.slug}
              href={`/products/${product.slug}`}
              className="border border-[#0A0A0A]/10 bg-white hover:border-[#0A0A0A]/25 transition-colors flex flex-col"
            >
              {/* Card header */}
              <div className="px-4 py-3 border-b border-[#0A0A0A]/5 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  {getProductLogo(product.slug) ? (
                    <Image
                      src={getProductLogo(product.slug)!}
                      alt={product.name}
                      width={24}
                      height={24}
                      className="w-6 h-6 object-contain rounded-sm"
                    />
                  ) : (
                    <span className="inline-flex items-center justify-center w-6 h-6 bg-[#0A0A0A] font-mono text-[9px] font-bold text-white">
                      {product.name.slice(0, 2).toUpperCase()}
                    </span>
                  )}
                  <span className="font-serif font-bold text-sm">{product.name}</span>
                </div>
                <StageBadge stage={product.stage} />
              </div>

              {/* Card body */}
              <div className="p-4 flex-1 space-y-3">
                {/* MRR */}
                <div className="flex items-baseline justify-between">
                  <div>
                    <span className="font-mono text-[9px] uppercase tracking-wider text-[#0A0A0A]/40 block">MRR</span>
                    <span className="font-mono font-bold text-lg">
                      {product.mrrCents > 0 ? `$${Math.round(product.mrrCents / 100).toLocaleString()}` : "Pre-revenue"}
                    </span>
                  </div>
                  {product.monthlyGoalCents && (
                    <div className="text-right">
                      <span className="font-mono text-[9px] uppercase tracking-wider text-[#0A0A0A]/40 block">Goal</span>
                      <span className="font-mono text-xs text-[#0A0A0A]/60">
                        ${Math.round(product.monthlyGoalCents / 100).toLocaleString()}/mo
                      </span>
                    </div>
                  )}
                </div>

                {/* Goal progress bar */}
                {goalPct !== null && (
                  <div>
                    <div className="flex justify-between mb-1">
                      <span className="font-mono text-[9px] text-[#0A0A0A]/40">Goal progress</span>
                      <span className="font-mono text-[9px] text-[#0A0A0A]/60">{goalPct}%</span>
                    </div>
                    <div className="h-1 bg-[#0A0A0A]/10">
                      <div
                        className="h-full bg-[#0A0A0A]"
                        style={{ width: `${goalPct}%` }}
                      />
                    </div>
                  </div>
                )}

                {/* Sprint velocity + days live */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <VelocityIcon label={product.velocityLabel} />
                    <span className="font-mono text-[10px] text-[#0A0A0A]/50">
                      {product.velocityLabel ?? "no sprint data"}
                    </span>
                  </div>
                  {product.daysLive !== null && (
                    <span className="font-mono text-[9px] text-[#0A0A0A]/40">
                      {product.daysLive}d live
                    </span>
                  )}
                </div>

                {/* Target market */}
                {product.targetMarket && (
                  <p className="font-serif text-[11px] text-[#0A0A0A]/50 line-clamp-1">
                    {product.targetMarket}
                  </p>
                )}
              </div>

              {/* Footer */}
              <div className="px-4 py-2 border-t border-[#0A0A0A]/5">
                <span className="font-mono text-[9px] text-[#0A0A0A]/40 hover:text-[#0A0A0A]/60">
                  View details →
                </span>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
