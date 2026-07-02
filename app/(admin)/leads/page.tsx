/**
 * Portfolio Tracker -- the single grid: every client, prospect, and venture
 * relationship across all buckets, with money + next step + staleness.
 * 2026-07-02 CRM refresh: this replaced the funnel-stage pipeline view.
 * Spec: .claude/specs/2026-07-02-crm-refresh.md
 */

import type { Metadata } from "next";
import { unstable_cache } from "next/cache";
import { db } from "@/lib/db";

export const metadata: Metadata = {
  title: "Tracker | AM Collective",
};

export const revalidate = 300;

import * as schema from "@/lib/db/schema";
import { eq, desc } from "drizzle-orm";
import Link from "next/link";
import { LeadActions } from "./lead-actions";
import { NewLeadForm } from "./new-lead-form";
import { statusBadge, statusText, leadStageCategory } from "@/lib/ui/status-colors";
import { EmptyState } from "@/components/ui/empty-state";
import { Crosshair, Scale } from "lucide-react";

const STAGE_LABELS: Record<string, string> = {
  awareness: "Awareness",
  interest: "Interest",
  consideration: "Consideration",
  intent: "Intent",
  closed_won: "Closed Won",
  closed_lost: "Closed Lost",
  nurture: "Nurture",
  prospect: "Prospect",
  active: "Active",
  proposal: "Proposal",
};

const BUCKET_LABELS: Record<string, string> = {
  cursive: "Cursive",
  leasestack: "LeaseStack",
  campusgtm: "CampusGTM",
  am_collective: "Agency",
  reseller: "Reseller",
  trackr: "Trackr",
  wholesail: "Wholesail",
  taskspace: "TaskSpace",
  tbgc: "TBGC",
  hook: "Hook",
  myvsl: "MyVSL",
  personal: "Personal",
  untagged: "—",
};

const PAY_LABELS: Record<string, string> = {
  on_track: "ON-TRACK",
  pending: "PENDING",
  overdue: "OVERDUE",
  paid: "PAID",
};

const PAY_STYLES: Record<string, string> = {
  on_track: statusText.positive,
  pending: "text-[#0A0A0A]/50",
  overdue: `${statusText.negative} font-bold`,
  paid: statusText.positive,
};

/** Days-since-last-step beyond which a row is rotting, by stage. */
const STALENESS_DAYS: Record<string, number> = {
  active: 7,
  prospect: 10,
  proposal: 5,
  nurture: 21,
};

const PRIORITY_ORDER: Record<string, number> = { P0: 0, P1: 1, P2: 2 };

function fmtDollars(cents: number | null) {
  if (!cents) return "—";
  return "$" + (cents / 100).toLocaleString("en-US", { maximumFractionDigits: 0 });
}

function daysSince(d: Date | null): number | null {
  if (!d) return null;
  return Math.floor((Date.now() - d.getTime()) / 86_400_000);
}

const getCachedLeads = unstable_cache(
  async () =>
    db
      .select()
      .from(schema.leads)
      .where(eq(schema.leads.isArchived, false))
      .orderBy(desc(schema.leads.updatedAt))
      .limit(200),
  ["leads-list"],
  { revalidate: 60, tags: ["leads"] }
);

export default async function TrackerPage() {
  const cached = await getCachedLeads();
  const leads = cached.map((l) => ({
    ...l,
    nextFollowUpAt: l.nextFollowUpAt ? new Date(l.nextFollowUpAt) : null,
    lastContactedAt: l.lastContactedAt ? new Date(l.lastContactedAt) : null,
    lastStepDate: l.lastStepDate ? new Date(l.lastStepDate) : null,
    convertedAt: l.convertedAt ? new Date(l.convertedAt) : null,
    createdAt: l.createdAt ? new Date(l.createdAt) : null,
    updatedAt: l.updatedAt ? new Date(l.updatedAt) : null,
  }));

  const remaining = (l: (typeof leads)[number]) =>
    Math.max((l.totalValue ?? 0) - (l.collected ?? 0), 0);

  const isStale = (l: (typeof leads)[number]) => {
    const threshold = STALENESS_DAYS[l.stage];
    if (!threshold) return false;
    const last = l.lastStepDate ?? l.lastContactedAt ?? l.updatedAt;
    const days = daysSince(last);
    return days !== null && days > threshold;
  };

  // Sort: P0 first, then AR remaining desc, then MRR desc
  const sorted = [...leads].sort((a, b) => {
    const pa = PRIORITY_ORDER[a.priority ?? ""] ?? 3;
    const pb = PRIORITY_ORDER[b.priority ?? ""] ?? 3;
    if (pa !== pb) return pa - pb;
    const ra = remaining(a);
    const rb = remaining(b);
    if (ra !== rb) return rb - ra;
    return (b.mrr ?? 0) - (a.mrr ?? 0);
  });

  const arOutstanding = leads.reduce((sum, l) => sum + remaining(l), 0);
  const totalMrr = leads
    .filter((l) => l.stage === "active")
    .reduce((sum, l) => sum + (l.mrr ?? 0), 0);
  const pipelineValue = leads
    .filter((l) => ["prospect", "proposal"].includes(l.stage))
    .reduce((sum, l) => sum + (l.totalValue ?? l.estimatedValue ?? 0), 0);
  const staleRows = leads.filter(isStale);
  const blockers = leads.filter((l) => l.ipOrLegalFlag);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-serif text-2xl font-bold text-[#0A0A0A]">
            Portfolio Tracker
          </h1>
          <p className="font-mono text-xs text-[#0A0A0A]/50 mt-1">
            Every relationship, every dollar, every next step — one grid
          </p>
        </div>
        <NewLeadForm />
      </div>

      {/* Summary Strip */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="border border-[#0A0A0A]/10 bg-white p-4">
          <p className="font-mono text-[10px] uppercase text-[#0A0A0A]/50">
            AR Outstanding
          </p>
          <p className={`font-serif text-xl font-bold mt-1 ${arOutstanding > 0 ? statusText.negative : "text-[#0A0A0A]"}`}>
            {fmtDollars(arOutstanding)}
          </p>
        </div>
        <div className="border border-[#0A0A0A]/10 bg-white p-4">
          <p className="font-mono text-[10px] uppercase text-[#0A0A0A]/50">
            Active MRR
          </p>
          <p className={`font-serif text-xl font-bold ${statusText.positive} mt-1`}>
            {fmtDollars(totalMrr)}
          </p>
        </div>
        <div className="border border-[#0A0A0A]/10 bg-white p-4">
          <p className="font-mono text-[10px] uppercase text-[#0A0A0A]/50">
            Open Pipeline
          </p>
          <p className="font-serif text-xl font-bold text-[#0A0A0A] mt-1">
            {fmtDollars(pipelineValue)}
          </p>
        </div>
        <div className="border border-[#0A0A0A]/10 bg-white p-4">
          <p className="font-mono text-[10px] uppercase text-[#0A0A0A]/50">
            Rotting Follow-ups
          </p>
          <p className={`font-serif text-xl font-bold mt-1 ${staleRows.length > 0 ? statusText.negative : "text-[#0A0A0A]"}`}>
            {staleRows.length}
          </p>
        </div>
      </div>

      {/* Legal / IP blocker banner */}
      {blockers.length > 0 && (
        <div className="border border-[#0A0A0A] bg-white p-3 flex items-center gap-3">
          <Scale className="h-4 w-4 shrink-0" />
          <p className="font-mono text-xs text-[#0A0A0A]">
            {blockers.length} row{blockers.length === 1 ? "" : "s"} carry an
            unresolved IP/legal flag —{" "}
            {blockers
              .slice(0, 4)
              .map((b) => b.companyName ?? b.contactName)
              .join(", ")}
            {blockers.length > 4 ? ", …" : ""}
          </p>
        </div>
      )}

      {/* The Grid */}
      <div className="border border-[#0A0A0A]/10 bg-white overflow-x-auto">
        <table className="w-full min-w-[1100px] text-sm">
          <thead>
            <tr className="border-b border-[#0A0A0A]/10">
              {[
                ["Company", "text-left"],
                ["Bucket", "text-left"],
                ["Stage", "text-left"],
                ["Pri", "text-left"],
                ["Total", "text-right"],
                ["MRR", "text-right"],
                ["Remaining", "text-right"],
                ["Pay", "text-left"],
                ["Owner", "text-left"],
                ["Next Step", "text-left"],
                ["Last Step", "text-left"],
                ["", "text-right"],
              ].map(([label, align]) => (
                <th
                  key={label || "actions"}
                  className={`${align} font-mono text-[10px] uppercase text-[#0A0A0A]/50 px-3 py-3`}
                >
                  {label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sorted.map((lead) => {
              const rem = remaining(lead);
              const stale = isStale(lead);
              const lastStep = lead.lastStepDate ?? lead.lastContactedAt;
              const lastDays = daysSince(lastStep);

              return (
                <tr
                  key={lead.id}
                  className="border-b border-[#0A0A0A]/5 hover:bg-[#0A0A0A]/[0.02] align-top"
                >
                  <td className="px-3 py-3">
                    <Link
                      href={`/leads/${lead.id}`}
                      className="font-mono text-sm text-[#0A0A0A] hover:underline font-medium"
                    >
                      {lead.companyName ?? lead.contactName}
                    </Link>
                    <p className="font-mono text-[10px] text-[#0A0A0A]/40 mt-0.5">
                      {lead.contactName}
                      {lead.ipOrLegalFlag ? " · IP/LEGAL" : ""}
                      {lead.dataConfidence !== "verified"
                        ? ` · ${lead.dataConfidence.toUpperCase()}`
                        : ""}
                    </p>
                  </td>
                  <td className="px-3 py-3 font-mono text-xs text-[#0A0A0A]/70">
                    {BUCKET_LABELS[lead.companyTag] ?? lead.companyTag}
                  </td>
                  <td className="px-3 py-3">
                    <span
                      className={`px-2 py-0.5 text-[10px] font-mono ${statusBadge[leadStageCategory[lead.stage] ?? "neutral"]}`}
                    >
                      {STAGE_LABELS[lead.stage] ?? lead.stage}
                    </span>
                  </td>
                  <td className="px-3 py-3 font-mono text-xs font-bold text-[#0A0A0A]/80">
                    {lead.priority ?? "—"}
                  </td>
                  <td className="px-3 py-3 font-mono text-xs text-right text-[#0A0A0A]/70">
                    {fmtDollars(lead.totalValue ?? lead.estimatedValue)}
                  </td>
                  <td className="px-3 py-3 font-mono text-xs text-right text-[#0A0A0A]/70">
                    {fmtDollars(lead.mrr)}
                  </td>
                  <td
                    className={`px-3 py-3 font-mono text-xs text-right ${rem > 0 ? `${statusText.negative} font-bold` : "text-[#0A0A0A]/40"}`}
                  >
                    {rem > 0 ? fmtDollars(rem) : "—"}
                  </td>
                  <td className="px-3 py-3">
                    {lead.payStatus ? (
                      <span
                        className={`font-mono text-[10px] ${PAY_STYLES[lead.payStatus] ?? "text-[#0A0A0A]/50"}`}
                      >
                        {PAY_LABELS[lead.payStatus] ?? lead.payStatus}
                      </span>
                    ) : (
                      <span className="font-mono text-[10px] text-[#0A0A0A]/30">
                        —
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-3 font-mono text-xs text-[#0A0A0A]/70">
                    {lead.assignedTo ?? "—"}
                    {lead.ownerSecondary ? ` +${lead.ownerSecondary}` : ""}
                  </td>
                  <td className="px-3 py-3 font-mono text-xs text-[#0A0A0A]/70 max-w-[320px]">
                    <span className="line-clamp-2">
                      {lead.nextStep ?? "—"}
                    </span>
                  </td>
                  <td className="px-3 py-3">
                    <span
                      className={`font-mono text-xs ${stale ? `${statusText.negative} font-medium` : "text-[#0A0A0A]/50"}`}
                    >
                      {lastDays !== null ? `${lastDays}d` : "—"}
                      {stale ? " (rotting)" : ""}
                    </span>
                  </td>
                  <td className="px-3 py-3 text-right">
                    <LeadActions lead={lead} />
                  </td>
                </tr>
              );
            })}
            {sorted.length === 0 && (
              <tr>
                <td colSpan={12} className="px-0 py-0">
                  <EmptyState
                    icon={Crosshair}
                    title="No rows in the tracker"
                    description="Add your first relationship to start tracking money, next steps, and staleness in one grid."
                    action={{ label: "Add a row" }}
                    className="border-0"
                  />
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
