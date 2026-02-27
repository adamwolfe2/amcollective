/**
 * Lead Detail -- activity timeline + info panel.
 */

import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { eq, desc } from "drizzle-orm";
import { notFound } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  Phone,
  Mail,
  Globe,
  Linkedin,
} from "lucide-react";
import { LeadDetailActions } from "./lead-detail-actions";
import { AddActivityForm } from "./add-activity-form";

const STAGE_LABELS: Record<string, string> = {
  awareness: "Awareness",
  interest: "Interest",
  consideration: "Consideration",
  intent: "Intent",
  closed_won: "Closed Won",
  closed_lost: "Closed Lost",
  nurture: "Nurture",
};

const STAGE_COLORS: Record<string, string> = {
  awareness: "bg-gray-100 text-gray-700",
  interest: "bg-blue-100 text-blue-700",
  consideration: "bg-purple-100 text-purple-700",
  intent: "bg-amber-100 text-amber-700",
  closed_won: "bg-green-100 text-green-700",
  closed_lost: "bg-red-100 text-red-700",
  nurture: "bg-cyan-100 text-cyan-700",
};

const ACTIVITY_LABELS: Record<string, string> = {
  note: "Note",
  email: "Email",
  call: "Call",
  meeting: "Meeting",
  stage_change: "Stage Change",
};

function fmtDollars(cents: number | null) {
  if (!cents) return "--";
  return "$" + (cents / 100).toLocaleString("en-US", { maximumFractionDigits: 0 });
}

export default async function LeadDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const [lead] = await db
    .select()
    .from(schema.leads)
    .where(eq(schema.leads.id, id))
    .limit(1);

  if (!lead) notFound();

  const activities = await db
    .select()
    .from(schema.leadActivities)
    .where(eq(schema.leadActivities.leadId, id))
    .orderBy(desc(schema.leadActivities.createdAt))
    .limit(50);

  return (
    <div className="space-y-6">
      {/* Back link */}
      <Link
        href="/leads"
        className="inline-flex items-center gap-2 font-mono text-sm text-[#0A0A0A]/50 hover:text-[#0A0A0A] transition-colors"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Pipeline
      </Link>

      <div className="flex items-start justify-between">
        <div>
          <h1 className="font-serif text-2xl font-bold text-[#0A0A0A]">
            {lead.contactName}
          </h1>
          {lead.companyName && (
            <p className="font-mono text-sm text-[#0A0A0A]/50 mt-1">
              {lead.companyName}
            </p>
          )}
        </div>
        <span
          className={`px-3 py-1 font-mono text-xs ${STAGE_COLORS[lead.stage]}`}
        >
          {STAGE_LABELS[lead.stage]}
        </span>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left -- Activity Timeline */}
        <div className="lg:col-span-2 space-y-4">
          <AddActivityForm leadId={id} />

          <div className="border border-[#0A0A0A]/10 bg-white">
            <div className="p-4 border-b border-[#0A0A0A]/10">
              <h2 className="font-serif text-lg font-bold text-[#0A0A0A]">
                Activity Timeline
              </h2>
            </div>
            <div className="divide-y divide-[#0A0A0A]/5">
              {activities.map((activity) => (
                <div key={activity.id} className="p-4">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-mono text-[10px] uppercase text-[#0A0A0A]/40 bg-[#0A0A0A]/5 px-1.5 py-0.5">
                      {ACTIVITY_LABELS[activity.type] ?? activity.type}
                    </span>
                    <span className="font-mono text-[10px] text-[#0A0A0A]/30">
                      {activity.createdAt.toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                        hour: "numeric",
                        minute: "2-digit",
                      })}
                    </span>
                  </div>
                  {activity.content && (
                    <p className="font-mono text-sm text-[#0A0A0A]/70 whitespace-pre-wrap">
                      {activity.content}
                    </p>
                  )}
                </div>
              ))}
              {activities.length === 0 && (
                <p className="p-8 text-center font-mono text-sm text-[#0A0A0A]/30">
                  No activity yet. Add a note or log a call to get started.
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Right -- Info Panel */}
        <div className="space-y-4">
          {/* Contact Info */}
          <div className="border border-[#0A0A0A]/10 bg-white p-4 space-y-3">
            <h3 className="font-mono text-[10px] uppercase text-[#0A0A0A]/50">
              Contact Info
            </h3>
            {lead.email && (
              <div className="flex items-center gap-2">
                <Mail className="h-3.5 w-3.5 text-[#0A0A0A]/30" />
                <a
                  href={`mailto:${lead.email}`}
                  className="font-mono text-sm text-[#0A0A0A] hover:underline"
                >
                  {lead.email}
                </a>
              </div>
            )}
            {lead.phone && (
              <div className="flex items-center gap-2">
                <Phone className="h-3.5 w-3.5 text-[#0A0A0A]/30" />
                <span className="font-mono text-sm text-[#0A0A0A]">
                  {lead.phone}
                </span>
              </div>
            )}
            {lead.website && (
              <div className="flex items-center gap-2">
                <Globe className="h-3.5 w-3.5 text-[#0A0A0A]/30" />
                <a
                  href={lead.website}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-mono text-sm text-[#0A0A0A] hover:underline truncate"
                >
                  {lead.website}
                </a>
              </div>
            )}
            {lead.linkedinUrl && (
              <div className="flex items-center gap-2">
                <Linkedin className="h-3.5 w-3.5 text-[#0A0A0A]/30" />
                <a
                  href={lead.linkedinUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-mono text-sm text-[#0A0A0A] hover:underline truncate"
                >
                  LinkedIn
                </a>
              </div>
            )}
          </div>

          {/* Opportunity */}
          <div className="border border-[#0A0A0A]/10 bg-white p-4 space-y-3">
            <h3 className="font-mono text-[10px] uppercase text-[#0A0A0A]/50">
              Opportunity
            </h3>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <p className="font-mono text-[10px] text-[#0A0A0A]/40">
                  Value
                </p>
                <p className="font-mono text-sm font-medium text-[#0A0A0A]">
                  {fmtDollars(lead.estimatedValue)}
                </p>
              </div>
              <div>
                <p className="font-mono text-[10px] text-[#0A0A0A]/40">
                  Probability
                </p>
                <p className="font-mono text-sm font-medium text-[#0A0A0A]">
                  {lead.probability != null ? `${lead.probability}%` : "--"}
                </p>
              </div>
              <div>
                <p className="font-mono text-[10px] text-[#0A0A0A]/40">
                  Source
                </p>
                <p className="font-mono text-sm text-[#0A0A0A]">
                  {lead.source ?? "--"}
                </p>
              </div>
              <div>
                <p className="font-mono text-[10px] text-[#0A0A0A]/40">
                  Expected Close
                </p>
                <p className="font-mono text-sm text-[#0A0A0A]">
                  {lead.expectedCloseDate ?? "--"}
                </p>
              </div>
            </div>
            {lead.industry && (
              <div>
                <p className="font-mono text-[10px] text-[#0A0A0A]/40">
                  Industry
                </p>
                <p className="font-mono text-sm text-[#0A0A0A]">
                  {lead.industry}
                </p>
              </div>
            )}
            {lead.companySize && (
              <div>
                <p className="font-mono text-[10px] text-[#0A0A0A]/40">
                  Company Size
                </p>
                <p className="font-mono text-sm text-[#0A0A0A]">
                  {lead.companySize}
                </p>
              </div>
            )}
          </div>

          {/* Notes */}
          {lead.notes && (
            <div className="border border-[#0A0A0A]/10 bg-white p-4">
              <h3 className="font-mono text-[10px] uppercase text-[#0A0A0A]/50 mb-2">
                Notes
              </h3>
              <p className="font-mono text-sm text-[#0A0A0A]/70 whitespace-pre-wrap">
                {lead.notes}
              </p>
            </div>
          )}

          {/* Actions */}
          <LeadDetailActions lead={lead} />
        </div>
      </div>
    </div>
  );
}
