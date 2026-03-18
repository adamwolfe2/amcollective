"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronDown, ChevronRight, ExternalLink, Calendar, DollarSign, User, Tag } from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

interface EngagementRow {
  id: string;
  companyName: string | null;
  contactName: string;
  stage: string;
  assignedTo: string | null;
  estimatedValue: number | null; // cents
  probability: number | null;
  notes: string | null;
  tags: string[] | null;
  nextFollowUpAt: string | null;
  lastContactedAt: string | null;
  // Joined engagement data (for Won/Active)
  engagementTitle?: string | null;
  engagementStatus?: string | null;
  engagementValue?: number | null; // cents
  engagementPeriod?: string | null;
  clientMrr?: number | null; // cents
}

interface StageGroup {
  stage: string;
  label: string;
  count: number;
  totalValue: number; // cents
  leads: EngagementRow[];
}

interface Props {
  groups: StageGroup[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatCurrency(cents: number) {
  return (cents / 100).toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });
}

function stageColor(stage: string) {
  switch (stage) {
    case "closed_won":
      return "bg-[#0A0A0A] text-white";
    case "intent":
      return "border border-[#0A0A0A] text-[#0A0A0A]";
    case "consideration":
      return "bg-[#0A0A0A]/10 text-[#0A0A0A]";
    case "interest":
      return "bg-[#0A0A0A]/5 text-[#0A0A0A]/70";
    case "nurture":
      return "bg-[#0A0A0A]/5 text-[#0A0A0A]/50";
    default:
      return "bg-[#0A0A0A]/5 text-[#0A0A0A]/50";
  }
}

function stageLabel(stage: string) {
  switch (stage) {
    case "closed_won": return "Won / Active";
    case "intent": return "Intent";
    case "consideration": return "Consideration";
    case "interest": return "Interest";
    case "nurture": return "Nurture / Strategic";
    case "awareness": return "Awareness";
    default: return stage;
  }
}

function formatDate(dateStr: string | null) {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function daysUntil(dateStr: string | null) {
  if (!dateStr) return null;
  const diff = Math.floor((new Date(dateStr).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
  if (diff < 0) return `${Math.abs(diff)}d overdue`;
  if (diff === 0) return "today";
  return `in ${diff}d`;
}

// ─── Notes parser — extract sections from structured notes ────────────────────

function parseNotes(notes: string | null): { contacts: string[]; context: string[]; nextActions: string[] } {
  if (!notes) return { contacts: [], context: [], nextActions: [] };

  const contacts: string[] = [];
  const context: string[] = [];
  const nextActions: string[] = [];

  let currentSection = "context";
  for (const line of notes.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    if (trimmed.startsWith("CONTACTS:") || trimmed.startsWith("TYPE:")) {
      currentSection = "contacts";
      continue;
    }
    if (trimmed.startsWith("DEAL CONTEXT:")) {
      currentSection = "context";
      continue;
    }
    if (trimmed.startsWith("NEXT ACTIONS:") || trimmed.startsWith("FINANCIAL BLOCKER:")) {
      currentSection = "next";
      if (trimmed.startsWith("FINANCIAL BLOCKER:")) {
        nextActions.push(trimmed);
      }
      continue;
    }
    if (trimmed.startsWith("NEEDS QUALIFICATION")) {
      nextActions.push(trimmed);
      continue;
    }

    if (trimmed.startsWith("- ")) {
      const content = trimmed.slice(2);
      if (currentSection === "contacts") contacts.push(content);
      else if (currentSection === "next") nextActions.push(content);
      else context.push(content);
    }
  }

  return { contacts, context, nextActions };
}

// ─── Lead Row (expandable) ─────────────────────────────────────────────────────

function LeadRow({ lead }: { lead: EngagementRow }) {
  const [expanded, setExpanded] = useState(false);
  const parsed = parseNotes(lead.notes);
  const followUpStatus = daysUntil(lead.nextFollowUpAt);
  const isOverdue = followUpStatus?.includes("overdue");

  return (
    <div className="border-b border-[#0A0A0A]/5 last:border-b-0">
      {/* Collapsed row */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full px-4 py-3 flex items-center gap-3 hover:bg-[#0A0A0A]/[0.02] transition-colors text-left"
      >
        {expanded ? (
          <ChevronDown className="w-3.5 h-3.5 text-[#0A0A0A]/40 shrink-0" />
        ) : (
          <ChevronRight className="w-3.5 h-3.5 text-[#0A0A0A]/40 shrink-0" />
        )}

        {/* Company / Contact name */}
        <div className="flex-1 min-w-0">
          <span className="font-serif font-bold text-[13px] sm:text-sm text-[#0A0A0A] truncate block">
            {lead.companyName || lead.contactName}
          </span>
          {lead.companyName && lead.contactName !== lead.companyName && (
            <span className="font-mono text-[10px] text-[#0A0A0A]/40 truncate block">
              {lead.contactName}
            </span>
          )}
        </div>

        {/* Owner — hidden on small screens */}
        {lead.assignedTo && (
          <span className="font-mono text-[10px] text-[#0A0A0A]/40 shrink-0 hidden sm:block">
            {lead.assignedTo}
          </span>
        )}

        {/* Value */}
        {(lead.engagementValue || lead.estimatedValue) ? (
          <span className="font-mono text-[11px] sm:text-xs font-medium text-[#0A0A0A] shrink-0">
            {formatCurrency(lead.engagementValue || lead.estimatedValue || 0)}
            {lead.engagementPeriod === "monthly" && (
              <span className="text-[#0A0A0A]/40 text-[10px]">/mo</span>
            )}
          </span>
        ) : null}

        {/* Follow-up badge — hidden on very small screens, show just icon */}
        {followUpStatus && (
          <span className={`font-mono text-[9px] sm:text-[10px] px-1 sm:px-1.5 py-0.5 shrink-0 ${
            isOverdue ? "bg-[#0A0A0A] text-white" : "bg-[#0A0A0A]/5 text-[#0A0A0A]/60"
          }`}>
            <span className="hidden sm:inline">{followUpStatus}</span>
            <span className="sm:hidden">{isOverdue ? "!" : formatDate(lead.nextFollowUpAt)}</span>
          </span>
        )}

        {/* Probability — hidden on mobile */}
        {lead.probability != null && lead.probability < 100 && (
          <span className="font-mono text-[10px] text-[#0A0A0A]/30 shrink-0 hidden sm:block">
            {lead.probability}%
          </span>
        )}
      </button>

      {/* Expanded content */}
      {expanded && (
        <div className="px-3 sm:px-4 pb-4 pl-6 sm:pl-10 space-y-3">
          {/* Tags */}
          {lead.tags && lead.tags.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {lead.tags.slice(0, 8).map((tag) => (
                <span
                  key={tag}
                  className="inline-flex items-center gap-1 px-1.5 py-0.5 font-mono text-[9px] bg-[#0A0A0A]/5 text-[#0A0A0A]/50"
                >
                  <Tag className="w-2 h-2" />
                  {tag}
                </span>
              ))}
            </div>
          )}

          {/* Engagement info (for Won/Active) */}
          {lead.engagementTitle && (
            <div className="flex items-center gap-3 p-2 bg-[#0A0A0A]/[0.02] border border-[#0A0A0A]/5">
              <DollarSign className="w-3.5 h-3.5 text-[#0A0A0A]/40 shrink-0" />
              <div className="min-w-0">
                <span className="font-mono text-[11px] font-medium text-[#0A0A0A] block">
                  {lead.engagementTitle}
                </span>
                <span className="font-mono text-[10px] text-[#0A0A0A]/40">
                  {lead.engagementStatus}
                  {lead.engagementValue ? ` — ${formatCurrency(lead.engagementValue)}` : ""}
                  {lead.engagementPeriod ? `/${lead.engagementPeriod}` : ""}
                  {lead.clientMrr ? ` — MRR: ${formatCurrency(lead.clientMrr)}` : ""}
                </span>
              </div>
            </div>
          )}

          {/* Contacts */}
          {parsed.contacts.length > 0 && (
            <div>
              <h4 className="font-mono text-[9px] uppercase tracking-wider text-[#0A0A0A]/40 mb-1.5 flex items-center gap-1">
                <User className="w-2.5 h-2.5" />
                Contacts
              </h4>
              <div className="space-y-1">
                {parsed.contacts.map((c, i) => (
                  <p key={i} className="font-serif text-[11px] text-[#0A0A0A]/70 leading-relaxed">
                    {c}
                  </p>
                ))}
              </div>
            </div>
          )}

          {/* Context highlights (first 4 lines) */}
          {parsed.context.length > 0 && (
            <div>
              <h4 className="font-mono text-[9px] uppercase tracking-wider text-[#0A0A0A]/40 mb-1.5">
                Context
              </h4>
              <div className="space-y-1">
                {parsed.context.slice(0, 5).map((c, i) => (
                  <p key={i} className="font-serif text-[11px] text-[#0A0A0A]/60 leading-relaxed">
                    {c}
                  </p>
                ))}
                {parsed.context.length > 5 && (
                  <p className="font-mono text-[10px] text-[#0A0A0A]/30">
                    +{parsed.context.length - 5} more...
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Next Actions */}
          {parsed.nextActions.length > 0 && (
            <div>
              <h4 className="font-mono text-[9px] uppercase tracking-wider text-[#0A0A0A]/40 mb-1.5 flex items-center gap-1">
                <Calendar className="w-2.5 h-2.5" />
                Next Actions
              </h4>
              <div className="space-y-1">
                {parsed.nextActions.map((a, i) => (
                  <div key={i} className="flex items-start gap-2">
                    <span className="w-1 h-1 bg-[#0A0A0A]/30 mt-1.5 shrink-0" />
                    <p className="font-serif text-[11px] text-[#0A0A0A]/70 leading-relaxed">{a}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Metadata row */}
          <div className="flex flex-wrap items-center gap-2 sm:gap-4 pt-1">
            {lead.lastContactedAt && (
              <span className="font-mono text-[9px] text-[#0A0A0A]/30">
                Last contact: {formatDate(lead.lastContactedAt)}
              </span>
            )}
            {lead.nextFollowUpAt && (
              <span className={`font-mono text-[9px] ${isOverdue ? "text-[#0A0A0A] font-medium" : "text-[#0A0A0A]/30"}`}>
                Follow-up: {formatDate(lead.nextFollowUpAt)}
              </span>
            )}
            <Link
              href={`/leads`}
              className="font-mono text-[9px] text-[#0A0A0A]/40 hover:text-[#0A0A0A] flex items-center gap-0.5 ml-auto"
            >
              Open in Pipeline <ExternalLink className="w-2.5 h-2.5" />
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Stage Group (collapsible) ────────────────────────────────────────────────

function StageGroupSection({ group }: { group: StageGroup }) {
  const [expanded, setExpanded] = useState(group.stage === "closed_won" || group.stage === "intent");

  return (
    <div className="border border-[#0A0A0A]/10 bg-white">
      {/* Stage header */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full px-4 py-2.5 flex items-center gap-3 hover:bg-[#0A0A0A]/[0.02] transition-colors"
      >
        {expanded ? (
          <ChevronDown className="w-3.5 h-3.5 text-[#0A0A0A]/50" />
        ) : (
          <ChevronRight className="w-3.5 h-3.5 text-[#0A0A0A]/50" />
        )}
        <span className={`inline-flex items-center px-2 py-0.5 font-mono text-[9px] uppercase tracking-wider ${stageColor(group.stage)}`}>
          {stageLabel(group.stage)}
        </span>
        <span className="font-mono text-xs text-[#0A0A0A]/60">
          {group.count} {group.count === 1 ? "deal" : "deals"}
        </span>
        {group.totalValue > 0 && (
          <span className="font-mono text-xs font-medium text-[#0A0A0A] ml-auto">
            {formatCurrency(group.totalValue)}
          </span>
        )}
      </button>

      {/* Expanded leads */}
      {expanded && (
        <div className="border-t border-[#0A0A0A]/5">
          {group.leads.map((lead) => (
            <LeadRow key={lead.id} lead={lead} />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Main Component ──────────────────────────────────────────────────────────

export function EngagementsAccordion({ groups }: Props) {
  const totalDeals = groups.reduce((s, g) => s + g.count, 0);
  const totalValue = groups.reduce((s, g) => s + g.totalValue, 0);

  return (
    <div className="space-y-2">
      {/* Summary bar */}
      <div className="flex items-center justify-between px-1 gap-2">
        <h2 className="font-mono text-[10px] uppercase tracking-wider text-[#0A0A0A]/40 shrink-0">
          Pipeline
        </h2>
        <div className="flex items-center gap-2 sm:gap-3 min-w-0">
          <span className="font-mono text-[10px] text-[#0A0A0A]/40 shrink-0">
            {totalDeals} deals
          </span>
          {totalValue > 0 && (
            <span className="font-mono text-[10px] font-medium text-[#0A0A0A] shrink-0 hidden sm:block">
              {formatCurrency(totalValue)} pipeline
            </span>
          )}
          <Link
            href="/leads"
            className="font-mono text-[10px] text-[#0A0A0A]/40 hover:text-[#0A0A0A] shrink-0"
          >
            View all →
          </Link>
        </div>
      </div>

      {/* Stage groups */}
      {groups.map((group) => (
        <StageGroupSection key={group.stage} group={group} />
      ))}
    </div>
  );
}
