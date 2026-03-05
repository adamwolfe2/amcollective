/**
 * Strategy Intelligence Engine
 *
 * Transforms raw platform data into prioritized, actionable business decisions.
 * Answers "What should we do?" not just "What happened?"
 *
 * Data sources:
 *   - All product connectors (Trackr, TaskSpace, Wholesail, Cursive)
 *   - Stripe MRR by company
 *   - Mercury cash + burn from subscriptionCosts
 *   - Daily metrics snapshots (for MRR growth trajectory)
 *   - Invoices, proposals, rocks, alerts
 *
 * Output: 5-9 recommendations + computed strategy metrics, stored in DB.
 */

import { getAnthropicClient, MODEL_SONNET, MODEL_OPUS, trackAIUsage } from "../client";
import * as stripeConnector from "@/lib/connectors/stripe";
import * as mercuryConnector from "@/lib/connectors/mercury";
import * as trackrConnector from "@/lib/connectors/trackr";
import * as taskspaceConnector from "@/lib/connectors/taskspace";
import * as wholesailConnector from "@/lib/connectors/wholesail";
import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { sql, eq, gte, desc, and, count, inArray, lte } from "drizzle-orm";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ProductMetrics {
  name: string;
  tag: string;
  mrrCents: number;
  monthlyCostCents: number;
  marginPct: number;
  trend: "up" | "down" | "flat" | "unknown";
  notes: string[]; // notable items (e.g., "3 trials expiring this week")
}

export interface StrategyEngineData {
  // Platform financials
  totalMrrCents: number;
  mrrGrowthPct: number | null;     // vs 30d ago
  totalCashCents: number;
  monthlyBurnCents: number;        // total infrastructure + SaaS tool costs
  runwayMonths: number | null;

  // Per-product
  products: ProductMetrics[];

  // Revenue concentration (top product % of total)
  concentrationPct: number;

  // Revenue trend (last 3 months, for forecasting)
  revenueTrend: Array<{ month: string; revenue: number }>;

  // Overdue + pipeline
  overdueInvoices: number;
  overdueAmountCents: number;
  openProposalCount: number;
  openProposalValueCents: number;

  // Operations
  failedDeploys: number;
  unresolvedAlerts: number;
  atRiskRocks: number;

  // Cost breakdown by company tag
  costsByTag: Record<string, number>; // cents/month per product

  // Invoice aging (days outstanding distribution)
  invoiceAging: { under30: number; days30to60: number; over60: number };
}

export interface StrategyRecommendation {
  type: "revenue_opportunity" | "cost_reduction" | "risk" | "growth" | "operations";
  product: string | null;
  priority: 0 | 1 | 2; // 0=info, 1=action, 2=urgent
  title: string;
  situation: string;
  recommendation: string;
  expectedImpact: string;
  estimatedValueCents: number | null;
  effort: "low" | "medium" | "high";
  dataSnapshot?: Record<string, unknown>;
}

export interface StrategyEngineResult {
  recommendations: StrategyRecommendation[];
  metrics: {
    totalMrrCents: number;
    mrrGrowthPct: number | null;
    totalCashCents: number;
    monthlyBurnCents: number;
    runwayMonths: number | null;
    healthScore: number;
    concentrationPct: number;
    riskLevel: "low" | "medium" | "high" | "critical";
    productMargins: Record<string, { mrrCents: number; costCents: number; marginPct: number }>;
    revenueForecast: Array<{ month: string; projectedMrrCents: number }>;
    executiveSummary: string;
  };
}

// ─── Data Gathering ───────────────────────────────────────────────────────────

export async function gatherStrategyData(): Promise<StrategyEngineData> {
  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  // Run all data fetches in parallel
  const [
    mrrResult,
    mrrByCompanyResult,
    revenueTrendResult,
    cashResult,
    trackrResult,
    taskspaceResult,
    wholesailResult,
    subscriptionCosts,
    overdueData,
    openProposals,
    unresolvedAlerts,
    atRiskRocks,
    recentSnapshots,
    invoiceAgingData,
  ] = await Promise.all([
    stripeConnector.getMRR(),
    stripeConnector.getMRRByCompany(),
    stripeConnector.getRevenueTrend(3),
    mercuryConnector.getTotalCash().catch(() => ({ success: false as const, data: null })),
    trackrConnector.getSnapshot().catch(() => ({ success: false as const, data: null })),
    taskspaceConnector.getSnapshot().catch(() => ({ success: false as const, data: null })),
    wholesailConnector.getSnapshot().catch(() => ({ success: false as const, data: null })),

    // Monthly SaaS/infra costs grouped by product tag
    db
      .select({
        tag: schema.subscriptionCosts.companyTag,
        total: sql<number>`COALESCE(SUM(${schema.subscriptionCosts.amount}), 0)`,
      })
      .from(schema.subscriptionCosts)
      .where(eq(schema.subscriptionCosts.isActive, true))
      .groupBy(schema.subscriptionCosts.companyTag),

    // Overdue invoices
    db
      .select({
        count: count(),
        total: sql<number>`COALESCE(SUM(${schema.invoices.amount}), 0)`,
      })
      .from(schema.invoices)
      .where(eq(schema.invoices.status, "overdue")),

    // Open proposals
    db
      .select({
        count: count(),
        total: sql<number>`COALESCE(SUM(${schema.proposals.total}), 0)`,
      })
      .from(schema.proposals)
      .where(sql`${schema.proposals.status} IN ('sent', 'viewed')`),

    // Unresolved alerts
    db
      .select({ count: count() })
      .from(schema.alerts)
      .where(sql`${schema.alerts.resolvedAt} IS NULL`),

    // At-risk rocks
    db
      .select({ count: count() })
      .from(schema.rocks)
      .where(eq(schema.rocks.status, "at_risk")),

    // Last 45 days of daily snapshots for MRR growth calc
    db
      .select({ date: schema.dailyMetricsSnapshots.date, mrr: schema.dailyMetricsSnapshots.mrr })
      .from(schema.dailyMetricsSnapshots)
      .where(
        and(
          gte(schema.dailyMetricsSnapshots.date, thirtyDaysAgo),
          eq(schema.dailyMetricsSnapshots.dataComplete, true)
        )
      )
      .orderBy(desc(schema.dailyMetricsSnapshots.date))
      .limit(45),

    // Invoice aging breakdown
    db
      .select({
        under30: sql<number>`COUNT(CASE WHEN EXTRACT(DAY FROM NOW() - ${schema.invoices.dueDate}) <= 30 THEN 1 END)`,
        days30to60: sql<number>`COUNT(CASE WHEN EXTRACT(DAY FROM NOW() - ${schema.invoices.dueDate}) BETWEEN 31 AND 60 THEN 1 END)`,
        over60: sql<number>`COUNT(CASE WHEN EXTRACT(DAY FROM NOW() - ${schema.invoices.dueDate}) > 60 THEN 1 END)`,
      })
      .from(schema.invoices)
      .where(eq(schema.invoices.status, "overdue"))
      .catch(() => [{ under30: 0, days30to60: 0, over60: 0 }]),
  ]);

  // ── Compute costs by tag ──────────────────────────────────────────────────
  const costsByTag: Record<string, number> = {};
  let totalMonthlyCosts = 0;
  for (const row of subscriptionCosts) {
    const tag = row.tag ?? "am_collective";
    const amt = Number(row.total ?? 0);
    costsByTag[tag] = (costsByTag[tag] ?? 0) + amt;
    totalMonthlyCosts += amt;
  }

  // ── Compute MRR growth ────────────────────────────────────────────────────
  const currentMrr = mrrResult.success ? (mrrResult.data?.mrr ?? 0) : 0;
  let mrrGrowthPct: number | null = null;

  if (recentSnapshots.length >= 2) {
    const oldest = recentSnapshots[recentSnapshots.length - 1];
    const priorMrr = oldest.mrr;
    if (priorMrr > 0) {
      mrrGrowthPct = Math.round(((currentMrr - priorMrr) / priorMrr) * 100 * 10) / 10;
    }
  }

  // ── Cash + runway ─────────────────────────────────────────────────────────
  const totalCashCents = cashResult.success && cashResult.data
    ? Math.round(cashResult.data * 100)
    : 0;
  const runwayMonths = totalMonthlyCosts > 0 && totalCashCents > 0
    ? Math.round((totalCashCents / totalMonthlyCosts) * 10) / 10
    : null;

  // ── Per-product metrics ───────────────────────────────────────────────────
  const mrrByCompany = mrrByCompanyResult.success ? (mrrByCompanyResult.data ?? []) : [];

  const getCompanyMrr = (tag: string): number => {
    const match = mrrByCompany.find((c) => c.companyTag === tag);
    return match?.mrr ?? 0;
  };

  const products: ProductMetrics[] = [];

  // Trackr
  if (trackrResult.success && trackrResult.data) {
    const d = trackrResult.data;
    const mrr = d.mrrCents || getCompanyMrr("trackr");
    const cost = costsByTag["trackr"] ?? 0;
    const margin = mrr > 0 ? Math.round(((mrr - cost) / mrr) * 100) : 0;
    const notes: string[] = [];
    if (d.trialingSubscriptions > 0) notes.push(`${d.trialingSubscriptions} trials in progress`);
    if (d.pendingArchitectApplications > 0) notes.push(`${d.pendingArchitectApplications} architect applications pending`);
    if (d.auditPipelinePending > 0) notes.push(`${d.auditPipelinePending} audits in queue`);
    products.push({ name: "Trackr", tag: "trackr", mrrCents: mrr, monthlyCostCents: cost, marginPct: margin, trend: "unknown", notes });
  }

  // TaskSpace
  if (taskspaceResult.success && taskspaceResult.data) {
    const d = taskspaceResult.data;
    const mrr = d.mrrCents || getCompanyMrr("taskspace");
    const cost = costsByTag["taskspace"] ?? 0;
    const margin = mrr > 0 ? Math.round(((mrr - cost) / mrr) * 100) : 0;
    const notes: string[] = [];
    if (d.rocksAtRisk > 0) notes.push(`${d.rocksAtRisk} customer rocks at risk`);
    if (d.eodRate7Day < 0.5) notes.push(`Low EOD rate: ${Math.round(d.eodRate7Day * 100)}%`);
    if (d.payingOrgs > 0) notes.push(`${d.payingOrgs} paying orgs`);
    products.push({ name: "TaskSpace", tag: "taskspace", mrrCents: mrr, monthlyCostCents: cost, marginPct: margin, trend: "unknown", notes });
  }

  // Wholesail
  if (wholesailResult.success && wholesailResult.data) {
    const d = wholesailResult.data;
    const mrr = d.mrrFromRetainers > 0 ? d.mrrFromRetainers * 100 : getCompanyMrr("wholesail");
    const cost = costsByTag["wholesail"] ?? 0;
    const margin = mrr > 0 ? Math.round(((mrr - cost) / mrr) * 100) : 0;
    const notes: string[] = [];
    if (d.stuckProjects > 0) notes.push(`${d.stuckProjects} builds stuck >14 days`);
    if (d.overdueProjects > 0) notes.push(`${d.overdueProjects} overdue builds`);
    if (d.intake.pending > 0) notes.push(`${d.intake.pending} intakes awaiting review`);
    products.push({ name: "Wholesail", tag: "wholesail", mrrCents: mrr, monthlyCostCents: cost, marginPct: margin, trend: "unknown", notes });
  }

  // Cursive (via Stripe since no direct connector read here)
  const cursiveMrr = getCompanyMrr("cursive");
  if (cursiveMrr > 0) {
    const cost = costsByTag["cursive"] ?? 0;
    const margin = Math.round(((cursiveMrr - cost) / cursiveMrr) * 100);
    products.push({ name: "Cursive", tag: "cursive", mrrCents: cursiveMrr, monthlyCostCents: cost, marginPct: margin, trend: "unknown", notes: [] });
  }

  // TBGC / Hook (any remaining Stripe MRR)
  for (const account of mrrByCompany) {
    if (!["trackr", "taskspace", "wholesail", "cursive"].includes(account.companyTag)) {
      const cost = costsByTag[account.companyTag] ?? 0;
      const margin = account.mrr > 0 ? Math.round(((account.mrr - cost) / account.mrr) * 100) : 0;
      if (account.mrr > 0) {
        products.push({
          name: account.name,
          tag: account.companyTag,
          mrrCents: account.mrr,
          monthlyCostCents: cost,
          marginPct: margin,
          trend: "unknown",
          notes: [],
        });
      }
    }
  }

  // ── Concentration risk ────────────────────────────────────────────────────
  const totalProductMrr = products.reduce((s, p) => s + p.mrrCents, 0);
  const topProductMrr = products.length > 0 ? Math.max(...products.map((p) => p.mrrCents)) : 0;
  const concentrationPct = totalProductMrr > 0
    ? Math.round((topProductMrr / totalProductMrr) * 100)
    : 0;

  // ── Revenue trend ─────────────────────────────────────────────────────────
  const revenueTrend = revenueTrendResult.success ? (revenueTrendResult.data ?? []) : [];

  return {
    totalMrrCents: currentMrr,
    mrrGrowthPct,
    totalCashCents,
    monthlyBurnCents: totalMonthlyCosts,
    runwayMonths,
    products,
    concentrationPct,
    revenueTrend,
    overdueInvoices: overdueData[0]?.count ?? 0,
    overdueAmountCents: Number(overdueData[0]?.total ?? 0),
    openProposalCount: openProposals[0]?.count ?? 0,
    openProposalValueCents: Number(openProposals[0]?.total ?? 0),
    failedDeploys: 0, // Populated from Vercel connector when needed
    unresolvedAlerts: unresolvedAlerts[0]?.count ?? 0,
    atRiskRocks: atRiskRocks[0]?.count ?? 0,
    costsByTag,
    invoiceAging: {
      under30: Number(invoiceAgingData[0]?.under30 ?? 0),
      days30to60: Number(invoiceAgingData[0]?.days30to60 ?? 0),
      over60: Number(invoiceAgingData[0]?.over60 ?? 0),
    },
  };
}

// ─── Health Score ─────────────────────────────────────────────────────────────

function computeHealthScore(data: StrategyEngineData): number {
  let score = 100;

  // Cash runway penalty
  if (data.runwayMonths !== null) {
    if (data.runwayMonths < 3) score -= 30;
    else if (data.runwayMonths < 6) score -= 15;
    else if (data.runwayMonths < 12) score -= 5;
  } else {
    score -= 5; // Can't measure = slight penalty
  }

  // MRR growth
  if (data.mrrGrowthPct !== null) {
    if (data.mrrGrowthPct < 0) score -= 20;
    else if (data.mrrGrowthPct < 2) score -= 5;
    else if (data.mrrGrowthPct > 10) score += 5;
  }

  // Overdue invoices
  if (data.overdueAmountCents > 0) {
    const pctOfMrr = data.totalMrrCents > 0 ? data.overdueAmountCents / data.totalMrrCents : 0;
    if (pctOfMrr > 0.5) score -= 20;
    else if (pctOfMrr > 0.25) score -= 10;
    else score -= 5;
  }

  // Revenue concentration
  if (data.concentrationPct > 60) score -= 10;
  else if (data.concentrationPct > 40) score -= 5;

  // At-risk rocks
  if (data.atRiskRocks > 3) score -= 10;
  else if (data.atRiskRocks > 0) score -= 5;

  // Unresolved alerts
  if (data.unresolvedAlerts > 5) score -= 10;
  else if (data.unresolvedAlerts > 2) score -= 5;

  return Math.max(0, Math.min(100, score));
}

function computeRiskLevel(data: StrategyEngineData): "low" | "medium" | "high" | "critical" {
  const score = computeHealthScore(data);
  if (score >= 80) return "low";
  if (score >= 60) return "medium";
  if (score >= 40) return "high";
  return "critical";
}

// ─── Revenue Forecast ─────────────────────────────────────────────────────────

function buildRevenueForecast(
  currentMrr: number,
  mrrGrowthPct: number | null
): Array<{ month: string; projectedMrrCents: number }> {
  const monthlyGrowthRate = (mrrGrowthPct ?? 3) / 100; // default 3% if unknown
  const forecast = [];
  const now = new Date();

  for (let i = 1; i <= 3; i++) {
    const futureDate = new Date(now.getFullYear(), now.getMonth() + i, 1);
    const month = `${futureDate.getFullYear()}-${String(futureDate.getMonth() + 1).padStart(2, "0")}`;
    const projectedMrrCents = Math.round(currentMrr * Math.pow(1 + monthlyGrowthRate, i));
    forecast.push({ month, projectedMrrCents });
  }

  return forecast;
}

// ─── Strategy Generation (Claude) ─────────────────────────────────────────────

export async function generateStrategyRecommendations(
  data: StrategyEngineData,
  useOpus = false
): Promise<StrategyEngineResult> {
  const anthropic = getAnthropicClient();
  const healthScore = computeHealthScore(data);
  const riskLevel = computeRiskLevel(data);
  const revenueForecast = buildRevenueForecast(data.totalMrrCents, data.mrrGrowthPct);

  // Build product margins map
  const productMargins: Record<string, { mrrCents: number; costCents: number; marginPct: number }> = {};
  for (const p of data.products) {
    productMargins[p.tag] = { mrrCents: p.mrrCents, costCents: p.monthlyCostCents, marginPct: p.marginPct };
  }

  const fallbackMetrics = {
    totalMrrCents: data.totalMrrCents,
    mrrGrowthPct: data.mrrGrowthPct,
    totalCashCents: data.totalCashCents,
    monthlyBurnCents: data.monthlyBurnCents,
    runwayMonths: data.runwayMonths,
    healthScore,
    concentrationPct: data.concentrationPct,
    riskLevel,
    productMargins,
    revenueForecast,
    executiveSummary: buildFallbackSummary(data, healthScore),
  };

  if (!anthropic) {
    return { recommendations: buildFallbackRecommendations(data), metrics: fallbackMetrics };
  }

  const fmt = (cents: number) => `$${Math.round(cents / 100).toLocaleString()}`;
  const model = useOpus ? MODEL_OPUS : MODEL_SONNET;

  const productSection = data.products.map((p) =>
    `  ${p.name}: MRR ${fmt(p.mrrCents)} | Cost ${fmt(p.monthlyCostCents)}/mo | Margin ${p.marginPct}%${p.notes.length > 0 ? ` | Notes: ${p.notes.join(", ")}` : ""}`
  ).join("\n");

  const revenueTrendSection = data.revenueTrend.length > 0
    ? data.revenueTrend.map((t) => `  ${t.month}: ${fmt(t.revenue)}`).join("\n")
    : "  No trend data available";

  const systemPrompt = `You are the Chief Strategy Officer for AM Collective Capital. You have access to real-time financial and operational data across 4-6 portfolio software products. Your job is to generate specific, data-driven, prioritized recommendations that will directly increase revenue, reduce costs, improve margins, or mitigate risks.

CRITICAL RULES:
- Every recommendation must have a SPECIFIC action (not "consider improving X" but "raise TaskSpace pricing from $175 to $249 for new signups")
- Quantify dollar impact wherever possible
- Lead with the most urgent item (unpaid invoices, cash risk, churn risk)
- Do NOT restate numbers as recommendations — translate them into actions
- Be direct and specific — this is for the founder, not a board presentation
- No emojis, no markdown headers, no bullet points inside text fields`;

  const userPrompt = `Analyze this week's business data and generate strategic recommendations for AM Collective.

PLATFORM OVERVIEW:
- Total MRR: ${fmt(data.totalMrrCents)}/mo
- MRR Growth (30d): ${data.mrrGrowthPct !== null ? `${data.mrrGrowthPct > 0 ? "+" : ""}${data.mrrGrowthPct}%` : "insufficient data"}
- Cash on Hand: ${data.totalCashCents > 0 ? fmt(data.totalCashCents) : "Mercury not synced"}
- Monthly Infrastructure Costs: ${fmt(data.monthlyBurnCents)}
- Cash Runway: ${data.runwayMonths !== null ? `${data.runwayMonths} months` : "unknown"}
- Revenue Concentration: Top product = ${data.concentrationPct}% of MRR

PRODUCT PROFITABILITY:
${productSection}

REVENUE TREND (last 3 months):
${revenueTrendSection}

OVERDUE INVOICES: ${data.overdueInvoices} invoices, ${fmt(data.overdueAmountCents)} total
  Aging: <30d=${data.invoiceAging.under30}, 30-60d=${data.invoiceAging.days30to60}, >60d=${data.invoiceAging.over60}

OPEN PROPOSALS: ${data.openProposalCount} proposals worth ${fmt(data.openProposalValueCents)}

OPERATIONS: ${data.unresolvedAlerts} unresolved alerts, ${data.atRiskRocks} quarterly goals at risk

COST BREAKDOWN BY PRODUCT:
${Object.entries(data.costsByTag).map(([tag, cost]) => `  ${tag}: ${fmt(cost)}/mo`).join("\n") || "  No cost data"}

Return ONLY raw JSON (no markdown wrapping), in this exact structure:
{
  "executiveSummary": "2-3 sentences covering the most critical situation and primary opportunity right now",
  "recommendations": [
    {
      "type": "revenue_opportunity|cost_reduction|risk|growth|operations",
      "product": "trackr|taskspace|wholesail|cursive|tbgc|hook|null",
      "priority": 0,
      "title": "Short action-oriented title (max 80 chars)",
      "situation": "What is currently happening with specific numbers",
      "recommendation": "Exactly what to do, who does it, by when",
      "expectedImpact": "Specific outcome: revenue gained, cost saved, risk reduced",
      "estimatedValueCents": 150000,
      "effort": "low|medium|high"
    }
  ]
}

Rules:
- Generate 5-9 recommendations
- priority 2 = urgent (do this week), 1 = action (do this month), 0 = informational
- estimatedValueCents = monthly dollar impact in cents (null if unknown)
- At least one recommendation per category: risk, revenue_opportunity, cost_reduction
- If runway is under 12 months, include at least one cash-preservation recommendation
- If any invoice is >60 days overdue, that is always priority 2
- If MRR growth is negative, lead with a revenue recovery recommendation`;

  try {
    const response = await anthropic.messages.create({
      model,
      max_tokens: 3000,
      messages: [{ role: "user", content: userPrompt }],
      system: systemPrompt,
    });

    trackAIUsage({
      model,
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
      agent: "strategy-engine",
    });

    const text = response.content[0].type === "text" ? response.content[0].text : "";

    // Strip markdown code fences if present
    const cleaned = text.replace(/^```(?:json)?\s*/m, "").replace(/\s*```\s*$/m, "").trim();
    const parsed = JSON.parse(cleaned);

    const recommendations: StrategyRecommendation[] = (parsed.recommendations ?? []).map(
      (r: Record<string, unknown>) => ({
        type: r.type as StrategyRecommendation["type"],
        product: r.product ?? null,
        priority: (r.priority ?? 0) as 0 | 1 | 2,
        title: String(r.title ?? ""),
        situation: String(r.situation ?? ""),
        recommendation: String(r.recommendation ?? ""),
        expectedImpact: String(r.expectedImpact ?? ""),
        estimatedValueCents: r.estimatedValueCents !== null ? Number(r.estimatedValueCents) : null,
        effort: (r.effort ?? "medium") as "low" | "medium" | "high",
      })
    );

    return {
      recommendations,
      metrics: {
        ...fallbackMetrics,
        executiveSummary: String(parsed.executiveSummary ?? fallbackMetrics.executiveSummary),
      },
    };
  } catch {
    return { recommendations: buildFallbackRecommendations(data), metrics: fallbackMetrics };
  }
}

// ─── Persistence ──────────────────────────────────────────────────────────────

export async function persistStrategyResult(
  weekOf: string,
  result: StrategyEngineResult
): Promise<void> {
  const { metrics, recommendations } = result;

  // Upsert metrics row
  await db
    .insert(schema.strategyMetrics)
    .values({
      weekOf,
      totalMrrCents: metrics.totalMrrCents,
      mrrGrowthPct: metrics.mrrGrowthPct !== null ? String(metrics.mrrGrowthPct) : null,
      totalCashCents: metrics.totalCashCents,
      monthlyBurnCents: metrics.monthlyBurnCents,
      runwayMonths: metrics.runwayMonths !== null ? String(metrics.runwayMonths) : null,
      healthScore: metrics.healthScore,
      productMargins: metrics.productMargins,
      concentrationPct: metrics.concentrationPct,
      riskLevel: metrics.riskLevel,
      revenueForecast: metrics.revenueForecast,
      executiveSummary: metrics.executiveSummary,
    })
    .onConflictDoUpdate({
      target: schema.strategyMetrics.weekOf,
      set: {
        totalMrrCents: metrics.totalMrrCents,
        mrrGrowthPct: metrics.mrrGrowthPct !== null ? String(metrics.mrrGrowthPct) : null,
        totalCashCents: metrics.totalCashCents,
        monthlyBurnCents: metrics.monthlyBurnCents,
        runwayMonths: metrics.runwayMonths !== null ? String(metrics.runwayMonths) : null,
        healthScore: metrics.healthScore,
        productMargins: metrics.productMargins,
        concentrationPct: metrics.concentrationPct,
        riskLevel: metrics.riskLevel,
        revenueForecast: metrics.revenueForecast,
        executiveSummary: metrics.executiveSummary,
      },
    });

  // Insert new recommendations (don't replace active ones from the same week)
  if (recommendations.length > 0) {
    await db.insert(schema.strategyRecommendations).values(
      recommendations.map((r) => ({
        weekOf,
        type: r.type,
        product: r.product ?? undefined,
        priority: r.priority,
        title: r.title,
        situation: r.situation,
        recommendation: r.recommendation,
        expectedImpact: r.expectedImpact,
        estimatedValueCents: r.estimatedValueCents ?? undefined,
        effort: r.effort,
        dataSnapshot: r.dataSnapshot ?? {},
      }))
    );
  }
}

// ─── Fallbacks ────────────────────────────────────────────────────────────────

function buildFallbackSummary(data: StrategyEngineData, healthScore: number): string {
  const fmt = (cents: number) => `$${Math.round(cents / 100).toLocaleString()}`;
  const parts: string[] = [];
  parts.push(`Platform MRR: ${fmt(data.totalMrrCents)}/mo`);
  if (data.mrrGrowthPct !== null) parts.push(`${data.mrrGrowthPct > 0 ? "+" : ""}${data.mrrGrowthPct}% growth (30d)`);
  if (data.runwayMonths !== null) parts.push(`${data.runwayMonths}mo runway`);
  if (data.overdueAmountCents > 0) parts.push(`${fmt(data.overdueAmountCents)} overdue`);
  parts.push(`Health score: ${healthScore}/100`);
  return parts.join(" | ");
}

function buildFallbackRecommendations(data: StrategyEngineData): StrategyRecommendation[] {
  const recs: StrategyRecommendation[] = [];
  const fmt = (cents: number) => `$${Math.round(cents / 100).toLocaleString()}`;

  if (data.invoiceAging.over60 > 0) {
    recs.push({
      type: "risk",
      product: null,
      priority: 2,
      title: `${data.invoiceAging.over60} invoice(s) over 60 days overdue`,
      situation: `${data.invoiceAging.over60} invoice(s) are more than 60 days past due, totaling a significant portion of ${fmt(data.overdueAmountCents)}.`,
      recommendation: "Send final payment notice with a 5-day deadline. For accounts >90 days, escalate to a collections call.",
      expectedImpact: "Recover outstanding cash before relationship damage becomes irreversible.",
      estimatedValueCents: Math.round(data.overdueAmountCents * 0.7),
      effort: "low",
    });
  }

  if (data.runwayMonths !== null && data.runwayMonths < 12) {
    recs.push({
      type: "risk",
      product: null,
      priority: data.runwayMonths < 6 ? 2 : 1,
      title: `Cash runway is ${data.runwayMonths} months — extend before 6-month threshold`,
      situation: `At current burn of ${fmt(data.monthlyBurnCents)}/mo with ${fmt(data.totalCashCents)} in the bank, runway is ${data.runwayMonths} months.`,
      recommendation: "Audit all subscription costs for cancellable/reducible items. Accelerate closing at least one open proposal this month.",
      expectedImpact: "Each $1K in recurring cost savings adds 1+ month of runway.",
      estimatedValueCents: null,
      effort: "medium",
    });
  }

  if (data.openProposalValueCents > 0) {
    recs.push({
      type: "revenue_opportunity",
      product: null,
      priority: 1,
      title: `${data.openProposalCount} open proposals worth ${fmt(data.openProposalValueCents)}`,
      situation: `${data.openProposalCount} proposals have been sent but not closed, representing ${fmt(data.openProposalValueCents)} in pipeline value.`,
      recommendation: "Follow up on each open proposal with a specific next-step ask (call, demo, or contract revision). Set a 2-week close deadline.",
      expectedImpact: `Closing even 50% would add ${fmt(Math.round(data.openProposalValueCents * 0.5))}.`,
      estimatedValueCents: Math.round(data.openProposalValueCents * 0.5),
      effort: "low",
    });
  }

  const highCostLowMarginProducts = data.products.filter((p) => p.marginPct < 50 && p.mrrCents > 0);
  if (highCostLowMarginProducts.length > 0) {
    const p = highCostLowMarginProducts[0];
    recs.push({
      type: "cost_reduction",
      product: p.tag,
      priority: 1,
      title: `${p.name} margin at ${p.marginPct}% — audit infra costs`,
      situation: `${p.name} generates ${fmt(p.mrrCents)}/mo but costs ${fmt(p.monthlyCostCents)}/mo, leaving only ${p.marginPct}% margin.`,
      recommendation: `Review all active subscriptions tagged to ${p.name} and identify any tools that could be downgraded, consolidated, or removed.`,
      expectedImpact: `A 20% cost reduction would add ${fmt(Math.round(p.monthlyCostCents * 0.2))} to monthly margin.`,
      estimatedValueCents: Math.round(p.monthlyCostCents * 0.2),
      effort: "medium",
    });
  }

  return recs;
}
