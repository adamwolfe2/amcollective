import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { and, eq, isNotNull, or } from "drizzle-orm";

import { db } from "@/lib/db";
import { clients, engagements } from "@/lib/db/schema/crm";
import { portfolioProjects } from "@/lib/db/schema/projects";
import { captureError } from "@/lib/errors";
import { EngagementPayRow } from "./engagement-pay-row";

export const metadata: Metadata = {
  title: "Engagement Pay Schedules | AM Collective",
};

export const revalidate = 60;

export interface EngagementRow {
  id: string;
  title: string;
  clientName: string | null;
  projectName: string | null;
  status: string;
  type: string;
  value: number | null;
  valuePeriod: string | null;
  paymentCadence: string | null;
  nextPayDate: string | null; // ISO YYYY-MM-DD
  endDate: string | null;
}

async function getEngagementsForPayManagement(): Promise<EngagementRow[]> {
  const rows = await db
    .select({
      id: engagements.id,
      title: engagements.title,
      clientName: clients.name,
      projectName: portfolioProjects.name,
      status: engagements.status,
      type: engagements.type,
      value: engagements.value,
      valuePeriod: engagements.valuePeriod,
      paymentCadence: engagements.paymentCadence,
      nextPayDate: engagements.nextPayDate,
      endDate: engagements.endDate,
    })
    .from(engagements)
    .leftJoin(clients, eq(clients.id, engagements.clientId))
    .leftJoin(portfolioProjects, eq(portfolioProjects.id, engagements.projectId))
    .where(
      and(
        isNotNull(engagements.value),
        or(
          eq(engagements.status, "active"),
          eq(engagements.status, "discovery"),
          eq(engagements.status, "paused")
        )
      )
    )
    .orderBy(engagements.nextPayDate);

  return rows.map((r) => ({
    ...r,
    nextPayDate: r.nextPayDate ? r.nextPayDate.toISOString().slice(0, 10) : null,
    endDate: r.endDate ? r.endDate.toISOString().slice(0, 10) : null,
  }));
}

export default async function EngagementsPayPage() {
  let rows: EngagementRow[] = [];
  let fetchFailed = false;
  try {
    rows = await getEngagementsForPayManagement();
  } catch (err) {
    captureError(err, { tags: { component: "EngagementsPayPage" } });
    fetchFailed = true;
  }

  const todayIso = new Date().toISOString().slice(0, 10);

  // Bucket: overdue / next 7 / next 30 / later / unset
  const buckets = {
    overdue: [] as EngagementRow[],
    next7: [] as EngagementRow[],
    next30: [] as EngagementRow[],
    later: [] as EngagementRow[],
    unset: [] as EngagementRow[],
  };
  for (const r of rows) {
    if (!r.nextPayDate) {
      buckets.unset.push(r);
      continue;
    }
    const daysOut = Math.floor(
      (new Date(r.nextPayDate).getTime() - new Date(todayIso).getTime()) /
        (1000 * 60 * 60 * 24)
    );
    if (daysOut < 0) buckets.overdue.push(r);
    else if (daysOut <= 7) buckets.next7.push(r);
    else if (daysOut <= 30) buckets.next30.push(r);
    else buckets.later.push(r);
  }

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Link
            href="/finance"
            className="flex items-center gap-1 font-mono text-xs text-[#0A0A0A]/50 hover:text-[#0A0A0A]"
          >
            <ChevronLeft className="w-3 h-3" />
            Finance
          </Link>
          <span className="text-[#0A0A0A]/20">/</span>
          <h1 className="text-2xl font-bold font-serif tracking-tight">
            Engagement Pay Schedules
          </h1>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/finance/calendar"
            className="font-mono text-[10px] uppercase tracking-wider px-3 py-1.5 border border-[#0A0A0A]/10 hover:bg-[#0A0A0A]/[0.04]"
          >
            Calendar →
          </Link>
          <Link
            href="/finance/ventures"
            className="font-mono text-[10px] uppercase tracking-wider px-3 py-1.5 border border-[#0A0A0A]/10 hover:bg-[#0A0A0A]/[0.04]"
          >
            Venture P&amp;L →
          </Link>
        </div>
      </div>

      <p className="font-mono text-xs text-[#0A0A0A]/50 mb-6 max-w-2xl">
        Track when each active engagement pays next. Set <code>paymentCadence</code> +{" "}
        <code>nextPayDate</code> so the calendar can project income forward and Hermes can give
        you accurate countdowns.
      </p>

      {fetchFailed ? (
        <div className="border border-[#0A0A0A]/10 bg-white p-12 text-center font-mono text-sm text-[#0A0A0A]/60">
          Failed to load engagements.
        </div>
      ) : rows.length === 0 ? (
        <div className="border border-[#0A0A0A]/10 bg-white p-12 text-center">
          <p className="font-mono text-sm text-[#0A0A0A]/60 mb-2">
            No active engagements yet.
          </p>
          <p className="font-mono text-xs text-[#0A0A0A]/40">
            Create engagements on a client record to manage their pay schedule here.
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          <Section
            title="Overdue"
            description="Past the expected pay date — chase or update."
            rows={buckets.overdue}
            todayIso={todayIso}
            emptyHint="Nothing overdue."
          />
          <Section
            title="Next 7 days"
            description="Money expected this week."
            rows={buckets.next7}
            todayIso={todayIso}
            emptyHint="Nothing due in the next 7 days."
          />
          <Section
            title="Next 30 days"
            description="Money expected this month."
            rows={buckets.next30}
            todayIso={todayIso}
            emptyHint="Nothing due in the next 30 days."
          />
          <Section
            title="Later"
            description="Beyond 30 days."
            rows={buckets.later}
            todayIso={todayIso}
            emptyHint="Nothing scheduled beyond 30 days."
          />
          <Section
            title="Pay date not set"
            description="Active engagements with no next pay date — set one to include them in forecasts."
            rows={buckets.unset}
            todayIso={todayIso}
            emptyHint="Every active engagement has a pay date."
            danger
          />
        </div>
      )}
    </div>
  );
}

function Section({
  title,
  description,
  rows,
  todayIso,
  emptyHint,
  danger,
}: {
  title: string;
  description: string;
  rows: EngagementRow[];
  todayIso: string;
  emptyHint: string;
  danger?: boolean;
}) {
  return (
    <section className="border border-[#0A0A0A]/10 bg-white">
      <header className="border-b border-[#0A0A0A]/10 px-4 py-3 flex items-center justify-between">
        <div>
          <h2 className="font-serif font-bold text-[#0A0A0A]">
            {title}
            <span
              className={`ml-2 font-mono text-[10px] uppercase tracking-wider px-1.5 py-0.5 ${
                danger && rows.length > 0
                  ? "bg-[#0A0A0A] text-white"
                  : "bg-[#0A0A0A]/5 text-[#0A0A0A]/60"
              }`}
            >
              {rows.length}
            </span>
          </h2>
          <p className="font-mono text-[10px] text-[#0A0A0A]/40 mt-0.5">
            {description}
          </p>
        </div>
      </header>
      {rows.length === 0 ? (
        <p className="px-4 py-6 font-mono text-xs text-[#0A0A0A]/30">{emptyHint}</p>
      ) : (
        <ul className="divide-y divide-[#0A0A0A]/5">
          {rows.map((r) => (
            <EngagementPayRow key={r.id} engagement={r} todayIso={todayIso} />
          ))}
        </ul>
      )}
    </section>
  );
}
