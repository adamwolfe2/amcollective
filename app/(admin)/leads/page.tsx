/**
 * Leads Pipeline -- kanban and table views for managing prospects.
 */

import type { Metadata } from "next";
import { db } from "@/lib/db";

export const metadata: Metadata = {
  title: "Leads | AM Collective",
};
import * as schema from "@/lib/db/schema";
import { eq, desc } from "drizzle-orm";
import Link from "next/link";
import { LeadActions } from "./lead-actions";
import { NewLeadForm } from "./new-lead-form";
import { LeadKanban } from "./lead-kanban";
import { statusBadge, statusText, leadStageCategory } from "@/lib/ui/status-colors";

const STAGE_LABELS: Record<string, string> = {
  awareness: "Awareness",
  interest: "Interest",
  consideration: "Consideration",
  intent: "Intent",
  closed_won: "Closed Won",
  closed_lost: "Closed Lost",
  nurture: "Nurture",
};

const STAGE_COLORS: Record<string, string> = Object.fromEntries(
  Object.entries(leadStageCategory).map(([k, v]) => [k, statusBadge[v]])
);

function fmtDollars(cents: number | null) {
  if (!cents) return "--";
  return "$" + (cents / 100).toLocaleString("en-US", { maximumFractionDigits: 0 });
}

export default async function LeadsPage() {
  const leads = await db
    .select()
    .from(schema.leads)
    .where(eq(schema.leads.isArchived, false))
    .orderBy(desc(schema.leads.updatedAt))
    .limit(200);

  // Weighted pipeline (consideration + intent)
  const weightedValue = leads
    .filter((l) => ["consideration", "intent"].includes(l.stage))
    .reduce(
      (sum, l) =>
        sum + ((l.estimatedValue ?? 0) * ((l.probability ?? 50) / 100)),
      0
    );

  // Won this month
  const monthStart = new Date(
    new Date().getFullYear(),
    new Date().getMonth(),
    1
  );
  const wonThisMonth = leads.filter(
    (l) =>
      l.stage === "closed_won" &&
      l.convertedAt &&
      l.convertedAt >= monthStart
  );
  const wonValue = wonThisMonth.reduce(
    (sum, l) => sum + (l.estimatedValue ?? 0),
    0
  );

  // Overdue follow-ups
  const now = new Date();
  const overdueFollowUps = leads.filter(
    (l) =>
      l.nextFollowUpAt &&
      l.nextFollowUpAt < now &&
      !["closed_won", "closed_lost"].includes(l.stage)
  );

  // Total pipeline value (excluding closed)
  const totalPipeline = leads
    .filter((l) => !["closed_won", "closed_lost"].includes(l.stage))
    .reduce((sum, l) => sum + (l.estimatedValue ?? 0), 0);

  // Serialize leads for the kanban client component
  const kanbanLeads = leads
    .filter((l) => !["closed_won", "closed_lost"].includes(l.stage))
    .map((l) => ({
      id: l.id,
      contactName: l.contactName,
      companyName: l.companyName,
      stage: l.stage,
      estimatedValue: l.estimatedValue,
      source: l.source,
      nextFollowUpAt: l.nextFollowUpAt,
    }));

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-serif text-2xl font-bold text-[#0A0A0A]">
            Lead Pipeline
          </h1>
          <p className="font-mono text-xs text-[#0A0A0A]/50 mt-1">
            Track prospects from awareness to closed
          </p>
        </div>
        <NewLeadForm />
      </div>

      {/* Pipeline Summary Strip */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="border border-[#0A0A0A]/10 bg-white p-4">
          <p className="font-mono text-[10px] uppercase text-[#0A0A0A]/50">
            Total Pipeline
          </p>
          <p className="font-serif text-xl font-bold text-[#0A0A0A] mt-1">
            {fmtDollars(totalPipeline)}
          </p>
        </div>
        <div className="border border-[#0A0A0A]/10 bg-white p-4">
          <p className="font-mono text-[10px] uppercase text-[#0A0A0A]/50">
            Weighted Value
          </p>
          <p className="font-serif text-xl font-bold text-[#0A0A0A] mt-1">
            {fmtDollars(weightedValue)}
          </p>
        </div>
        <div className="border border-[#0A0A0A]/10 bg-white p-4">
          <p className="font-mono text-[10px] uppercase text-[#0A0A0A]/50">
            Won This Month
          </p>
          <p className={`font-serif text-xl font-bold ${statusText.positive} mt-1`}>
            {wonThisMonth.length} / {fmtDollars(wonValue)}
          </p>
        </div>
        <div className="border border-[#0A0A0A]/10 bg-white p-4">
          <p className="font-mono text-[10px] uppercase text-[#0A0A0A]/50">
            Overdue Follow-ups
          </p>
          <p
            className={`font-serif text-xl font-bold mt-1 ${overdueFollowUps.length > 0 ? statusText.negative : "text-[#0A0A0A]"}`}
          >
            {overdueFollowUps.length}
          </p>
        </div>
      </div>

      {/* Kanban View */}
      <div className="overflow-x-auto">
        <LeadKanban leads={kanbanLeads} stageColors={STAGE_COLORS} />
      </div>

      {/* Table View */}
      <div className="border border-[#0A0A0A]/10 bg-white overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[#0A0A0A]/10">
              <th className="text-left font-mono text-[10px] uppercase text-[#0A0A0A]/50 px-4 py-3">
                Name
              </th>
              <th className="text-left font-mono text-[10px] uppercase text-[#0A0A0A]/50 px-4 py-3">
                Company
              </th>
              <th className="text-left font-mono text-[10px] uppercase text-[#0A0A0A]/50 px-4 py-3">
                Stage
              </th>
              <th className="text-right font-mono text-[10px] uppercase text-[#0A0A0A]/50 px-4 py-3">
                Value
              </th>
              <th className="text-left font-mono text-[10px] uppercase text-[#0A0A0A]/50 px-4 py-3">
                Source
              </th>
              <th className="text-left font-mono text-[10px] uppercase text-[#0A0A0A]/50 px-4 py-3">
                Follow-up
              </th>
              <th className="text-right font-mono text-[10px] uppercase text-[#0A0A0A]/50 px-4 py-3">
                Actions
              </th>
            </tr>
          </thead>
          <tbody>
            {leads.map((lead) => {
              const isOverdue =
                lead.nextFollowUpAt && lead.nextFollowUpAt < now;

              return (
                <tr
                  key={lead.id}
                  className="border-b border-[#0A0A0A]/5 hover:bg-[#0A0A0A]/[0.02]"
                >
                  <td className="px-4 py-3">
                    <Link
                      href={`/leads/${lead.id}`}
                      className="font-mono text-sm text-[#0A0A0A] hover:underline"
                    >
                      {lead.contactName}
                    </Link>
                  </td>
                  <td className="px-4 py-3 font-mono text-sm text-[#0A0A0A]/70">
                    {lead.companyName ?? "--"}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`px-2 py-0.5 text-[10px] font-mono ${STAGE_COLORS[lead.stage]}`}
                    >
                      {STAGE_LABELS[lead.stage]}
                    </span>
                  </td>
                  <td className="px-4 py-3 font-mono text-sm text-right text-[#0A0A0A]/70">
                    {fmtDollars(lead.estimatedValue)}
                  </td>
                  <td className="px-4 py-3 font-mono text-[10px] text-[#0A0A0A]/50 uppercase">
                    {lead.source ?? "--"}
                  </td>
                  <td className="px-4 py-3">
                    {lead.nextFollowUpAt ? (
                      <span
                        className={`font-mono text-xs ${isOverdue ? `${statusText.negative} font-medium` : "text-[#0A0A0A]/50"}`}
                      >
                        {lead.nextFollowUpAt.toLocaleDateString("en-US", {
                          month: "short",
                          day: "numeric",
                        })}
                        {isOverdue ? " (overdue)" : ""}
                      </span>
                    ) : (
                      <span className="font-mono text-xs text-[#0A0A0A]/30">
                        --
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <LeadActions lead={lead} />
                  </td>
                </tr>
              );
            })}
            {leads.length === 0 && (
              <tr>
                <td
                  colSpan={7}
                  className="px-4 py-12 text-center font-mono text-sm text-[#0A0A0A]/40"
                >
                  No leads yet. Create your first lead to get started.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
