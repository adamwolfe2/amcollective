// Command — single morning answer for Adam.
// Three questions, five seconds:
//   1. What did agents do for me overnight?
//   2. What's blocked on me today?
//   3. What's blocked on someone else?

import type { Metadata } from "next";
import Link from "next/link";
import { format, formatDistanceToNow } from "date-fns";
import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import {
  eq,
  desc,
  asc,
  count,
  and,
  gte,
  lte,
  isNotNull,
  not,
  inArray,
  sql,
} from "drizzle-orm";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export const metadata: Metadata = {
  title: "Command | AM Collective",
};

// ─── Helpers ────────────────────────────────────────────────────────────────

function formatDollars(cents: number): string {
  const dollars = cents / 100;
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(dollars);
}

function formatDuration(ms: number | null): string {
  if (ms == null) return "—";
  if (ms < 1000) return `${ms}ms`;
  const s = ms / 1000;
  if (s < 60) return `${s.toFixed(1)}s`;
  const m = s / 60;
  return `${m.toFixed(1)}m`;
}

function isHighPriorityIntent(intent: string | null): boolean {
  if (!intent) return false;
  const v = intent.toLowerCase();
  return v === "interested" || v === "question";
}

// ─── Roadmap label helpers ──────────────────────────────────────────────────
// Roadmap tasks get structured labels: rank:NN, wave:top10|1..5, tier:1..3,
// tag:content|research|engineering, est:Nhr, venture:<slug>, depends:#NN

interface RoadmapMeta {
  rank: number | null;
  wave: string | null;
  tier: string | null;
  tag: string | null;
  est: string | null;
  ventures: string[];
  depends: string[];
}

function parseRoadmapMeta(labels: string[] | null | undefined): RoadmapMeta {
  const meta: RoadmapMeta = {
    rank: null,
    wave: null,
    tier: null,
    tag: null,
    est: null,
    ventures: [],
    depends: [],
  };
  if (!labels) return meta;
  for (const label of labels) {
    if (label.startsWith("rank:")) {
      const n = parseInt(label.slice(5), 10);
      if (!Number.isNaN(n)) meta.rank = n;
    } else if (label.startsWith("wave:")) {
      meta.wave = label.slice(5);
    } else if (label.startsWith("tier:")) {
      meta.tier = label.slice(5);
    } else if (label.startsWith("tag:")) {
      meta.tag = label.slice(4);
    } else if (label.startsWith("est:")) {
      meta.est = label.slice(4);
    } else if (label.startsWith("venture:")) {
      meta.ventures.push(label.slice(8));
    } else if (label.startsWith("depends:")) {
      meta.depends.push(label.slice(8));
    }
  }
  return meta;
}

function waveLabel(wave: string | null): string {
  if (!wave) return "—";
  if (wave === "top10") return "TOP 10";
  return `WAVE ${wave}`;
}

function waveBadgeStyle(wave: string | null, tier: string | null): string {
  if (wave === "top10" && tier === "1") return "bg-[#0A0A0A] text-white";
  if (wave === "top10") return "bg-white text-[#0A0A0A] border border-[#0A0A0A]";
  if (wave === "1") return "bg-white text-[#0A0A0A] border border-[#0A0A0A]/60";
  return "bg-[#0A0A0A]/5 text-[#0A0A0A]/60";
}

// ─── Page ───────────────────────────────────────────────────────────────────

export default async function CommandPage() {
  const now = new Date();
  const todayEnd = new Date(now);
  todayEnd.setHours(23, 59, 59, 999);
  const last24h = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const sevenDaysOut = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

  // Pull everything in parallel. Each query is wrapped in its own catch so
  // a single missing/broken table doesn't kill the page.
  const [
    pendingDrafts,
    recentRuns,
    outstandingInvoices,
    openTasks,
    hotLeads,
    tasksDueTodayCount,
    agentRunsLast24hCount,
    outstandingTotalRow,
    roadmapTasks,
  ] = await Promise.all([
    db
      .select({
        id: schema.emailDrafts.id,
        to: schema.emailDrafts.to,
        subject: schema.emailDrafts.subject,
        replyIntent: schema.emailDrafts.replyIntent,
        replyConfidence: schema.emailDrafts.replyConfidence,
        createdAt: schema.emailDrafts.createdAt,
      })
      .from(schema.emailDrafts)
      .where(
        and(
          isNotNull(schema.emailDrafts.replyExternalId),
          eq(schema.emailDrafts.status, "ready")
        )
      )
      .orderBy(desc(schema.emailDrafts.createdAt))
      .limit(10)
      .catch(() => []),

    db
      .select({
        id: schema.inngestRunHistory.id,
        functionId: schema.inngestRunHistory.functionId,
        functionName: schema.inngestRunHistory.functionName,
        status: schema.inngestRunHistory.status,
        durationMs: schema.inngestRunHistory.durationMs,
        completedAt: schema.inngestRunHistory.completedAt,
        startedAt: schema.inngestRunHistory.startedAt,
      })
      .from(schema.inngestRunHistory)
      .orderBy(desc(schema.inngestRunHistory.startedAt))
      .limit(10)
      .catch(() => []),

    db
      .select({
        id: schema.invoices.id,
        number: schema.invoices.number,
        amount: schema.invoices.amount,
        dueDate: schema.invoices.dueDate,
        status: schema.invoices.status,
        clientName: schema.clients.name,
      })
      .from(schema.invoices)
      .leftJoin(
        schema.clients,
        eq(schema.invoices.clientId, schema.clients.id)
      )
      .where(
        not(
          inArray(schema.invoices.status, [
            "paid",
            "void",
            "cancelled",
            "draft",
          ])
        )
      )
      .orderBy(desc(schema.invoices.amount))
      .limit(10)
      .catch(() => []),

    db
      .select({
        id: schema.tasks.id,
        title: schema.tasks.title,
        status: schema.tasks.status,
        priority: schema.tasks.priority,
        dueDate: schema.tasks.dueDate,
      })
      .from(schema.tasks)
      .where(
        and(
          eq(schema.tasks.isArchived, false),
          not(inArray(schema.tasks.status, ["done", "cancelled"]))
        )
      )
      .orderBy(
        asc(schema.tasks.dueDate),
        desc(schema.tasks.priority)
      )
      .limit(10)
      .catch(() => []),

    db
      .select({
        id: schema.leads.id,
        contactName: schema.leads.contactName,
        companyName: schema.leads.companyName,
        stage: schema.leads.stage,
        nextFollowUpAt: schema.leads.nextFollowUpAt,
        estimatedValue: schema.leads.estimatedValue,
      })
      .from(schema.leads)
      .where(
        and(
          eq(schema.leads.isArchived, false),
          isNotNull(schema.leads.nextFollowUpAt),
          lte(schema.leads.nextFollowUpAt, sevenDaysOut),
          not(
            inArray(schema.leads.stage, [
              "closed_won",
              "closed_lost",
            ])
          )
        )
      )
      .orderBy(asc(schema.leads.nextFollowUpAt))
      .limit(10)
      .catch(() => []),

    // KPI: tasks due today or earlier (still open)
    db
      .select({ value: count() })
      .from(schema.tasks)
      .where(
        and(
          eq(schema.tasks.isArchived, false),
          not(inArray(schema.tasks.status, ["done", "cancelled"])),
          isNotNull(schema.tasks.dueDate),
          lte(schema.tasks.dueDate, todayEnd)
        )
      )
      .catch(() => [{ value: 0 }]),

    // KPI: completed agent runs in last 24h
    db
      .select({ value: count() })
      .from(schema.inngestRunHistory)
      .where(
        and(
          gte(schema.inngestRunHistory.startedAt, last24h),
          eq(schema.inngestRunHistory.status, "completed")
        )
      )
      .catch(() => [{ value: 0 }]),

    // KPI: total outstanding invoiced cents
    db
      .select({
        total: sql<number>`COALESCE(SUM(${schema.invoices.amount}), 0)`,
      })
      .from(schema.invoices)
      .where(
        not(
          inArray(schema.invoices.status, [
            "paid",
            "void",
            "cancelled",
            "draft",
          ])
        )
      )
      .catch(() => [{ total: 0 }]),

    // Strategic Roadmap — pull the next 10 active roadmap tasks ordered by rank
    db
      .select({
        id: schema.tasks.id,
        title: schema.tasks.title,
        status: schema.tasks.status,
        priority: schema.tasks.priority,
        dueDate: schema.tasks.dueDate,
        labels: schema.tasks.labels,
        position: schema.tasks.position,
      })
      .from(schema.tasks)
      .where(
        and(
          eq(schema.tasks.isArchived, false),
          not(inArray(schema.tasks.status, ["done", "cancelled"])),
          sql`${schema.tasks.labels}::jsonb @> ${JSON.stringify(["roadmap:2026-q2"])}::jsonb`
        )
      )
      .orderBy(asc(schema.tasks.position))
      .limit(10)
      .catch(() => []),
  ]);

  const repliesAwaiting = pendingDrafts.length;
  const outstandingTotalCents = Number(outstandingTotalRow[0]?.total ?? 0);
  const tasksDueToday = Number(tasksDueTodayCount[0]?.value ?? 0);
  const agentRunsLast24h = Number(agentRunsLast24hCount[0]?.value ?? 0);

  return (
    <div>
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold font-serif tracking-tight">
          Command
        </h1>
        <p className="font-mono text-xs text-[#0A0A0A]/40 mt-1">
          Single morning answer ·{" "}
          <span className="text-[#0A0A0A]/60">
            {format(now, "EEE MMM d")}
          </span>
        </p>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <div className="border border-[#0A0A0A] bg-white p-4">
          <p className="font-mono text-[10px] uppercase tracking-widest text-[#0A0A0A]/50 mb-1">
            Replies Awaiting You
          </p>
          <p className="font-mono text-xl font-bold">{repliesAwaiting}</p>
        </div>
        <div className="border border-[#0A0A0A] bg-white p-4">
          <p className="font-mono text-[10px] uppercase tracking-widest text-[#0A0A0A]/50 mb-1">
            Outstanding Invoiced
          </p>
          <p className="font-mono text-xl font-bold">
            {formatDollars(outstandingTotalCents)}
          </p>
        </div>
        <div className="border border-[#0A0A0A] bg-white p-4">
          <p className="font-mono text-[10px] uppercase tracking-widest text-[#0A0A0A]/50 mb-1">
            Tasks Due Today
          </p>
          <p className="font-mono text-xl font-bold">{tasksDueToday}</p>
        </div>
        <div className="border border-[#0A0A0A] bg-white p-4">
          <p className="font-mono text-[10px] uppercase tracking-widest text-[#0A0A0A]/50 mb-1">
            Agent Runs Last 24h
          </p>
          <p className="font-mono text-xl font-bold">{agentRunsLast24h}</p>
        </div>
      </div>

      {/* Strategic Roadmap — 40-task Q2 plan ordered by rank */}
      {roadmapTasks.length > 0 && (
        <div className="mb-4">
          <Section
            title="Strategic Roadmap"
            subtitle={`Next ${roadmapTasks.length} of the 40-task Q2 plan · ranked by unblocking power`}
          >
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="border-[#0A0A0A]/20">
                    <TableHead className="font-mono text-xs uppercase tracking-wider text-[#0A0A0A]/50 w-12">
                      #
                    </TableHead>
                    <TableHead className="font-mono text-xs uppercase tracking-wider text-[#0A0A0A]/50">
                      Wave
                    </TableHead>
                    <TableHead className="font-mono text-xs uppercase tracking-wider text-[#0A0A0A]/50">
                      Task
                    </TableHead>
                    <TableHead className="font-mono text-xs uppercase tracking-wider text-[#0A0A0A]/50">
                      Tag
                    </TableHead>
                    <TableHead className="font-mono text-xs uppercase tracking-wider text-[#0A0A0A]/50">
                      Est
                    </TableHead>
                    <TableHead className="font-mono text-xs uppercase tracking-wider text-[#0A0A0A]/50">
                      Ventures
                    </TableHead>
                    <TableHead className="font-mono text-xs uppercase tracking-wider text-[#0A0A0A]/50">
                      Status
                    </TableHead>
                    <TableHead className="font-mono text-xs uppercase tracking-wider text-[#0A0A0A]/50">
                      Due
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {roadmapTasks.map((t) => {
                    const meta = parseRoadmapMeta(t.labels);
                    const overdue =
                      t.dueDate != null && new Date(t.dueDate) < now;
                    return (
                      <TableRow
                        key={t.id}
                        className="border-[#0A0A0A]/10 hover:bg-[#0A0A0A]/[0.02]"
                      >
                        <TableCell className="font-mono text-xs font-bold text-[#0A0A0A]/70">
                          #{meta.rank ? String(meta.rank).padStart(2, "0") : "—"}
                        </TableCell>
                        <TableCell>
                          <span
                            className={`inline-flex items-center px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wider ${waveBadgeStyle(meta.wave, meta.tier)}`}
                          >
                            {waveLabel(meta.wave)}
                            {meta.tier && meta.wave === "top10"
                              ? ` · T${meta.tier}`
                              : ""}
                          </span>
                        </TableCell>
                        <TableCell className="font-serif text-sm max-w-[360px] truncate">
                          {t.title.replace(/^#\d+\s·\s/, "")}
                        </TableCell>
                        <TableCell className="font-mono text-[10px] uppercase tracking-wider text-[#0A0A0A]/60">
                          {meta.tag ?? "—"}
                        </TableCell>
                        <TableCell className="font-mono text-xs text-[#0A0A0A]/60">
                          {meta.est ?? "—"}
                        </TableCell>
                        <TableCell className="font-mono text-[10px] text-[#0A0A0A]/60 max-w-[120px] truncate">
                          {meta.ventures.length > 0
                            ? meta.ventures.join(", ")
                            : "—"}
                        </TableCell>
                        <TableCell className="font-mono text-xs text-[#0A0A0A]/60">
                          {t.status}
                        </TableCell>
                        <TableCell
                          className={`font-mono text-xs whitespace-nowrap ${
                            overdue ? "text-[#0A0A0A]" : "text-[#0A0A0A]/40"
                          }`}
                        >
                          {t.dueDate
                            ? format(new Date(t.dueDate), "MMM d")
                            : "—"}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
            <div className="px-3 py-2 border-t border-[#0A0A0A]/10 bg-[#0A0A0A]/[0.02]">
              <Link
                href="/tasks"
                className="font-mono text-[10px] uppercase tracking-widest text-[#0A0A0A]/60 hover:text-[#0A0A0A]"
              >
                View full roadmap →
              </Link>
            </div>
          </Section>
        </div>
      )}

      {/* Two-column grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* LEFT COL */}
        <div className="space-y-4">
          {/* Replies Awaiting You */}
          <Section
            title="Replies Awaiting You"
            subtitle="Reply drafts ready for review"
          >
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="border-[#0A0A0A]/20">
                    <TableHead className="font-mono text-xs uppercase tracking-wider text-[#0A0A0A]/50">
                      Intent
                    </TableHead>
                    <TableHead className="font-mono text-xs uppercase tracking-wider text-[#0A0A0A]/50">
                      To
                    </TableHead>
                    <TableHead className="font-mono text-xs uppercase tracking-wider text-[#0A0A0A]/50">
                      Subject
                    </TableHead>
                    <TableHead className="font-mono text-xs uppercase tracking-wider text-[#0A0A0A]/50">
                      Conf.
                    </TableHead>
                    <TableHead className="font-mono text-xs uppercase tracking-wider text-[#0A0A0A]/50">
                      When
                    </TableHead>
                    <TableHead className="font-mono text-xs uppercase tracking-wider text-[#0A0A0A]/50" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pendingDrafts.length === 0 && (
                    <TableRow>
                      <TableCell
                        colSpan={6}
                        className="text-center py-8 text-[#0A0A0A]/40 font-serif italic"
                      >
                        No reply drafts pending. Inbox is quiet.
                      </TableCell>
                    </TableRow>
                  )}
                  {pendingDrafts.map((d) => {
                    const high = isHighPriorityIntent(d.replyIntent);
                    return (
                      <TableRow
                        key={d.id}
                        className="border-[#0A0A0A]/10 hover:bg-[#0A0A0A]/[0.02]"
                      >
                        <TableCell>
                          <span
                            className={`inline-flex items-center px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wider ${
                              high
                                ? "bg-[#0A0A0A] text-white"
                                : "bg-[#0A0A0A]/5 text-[#0A0A0A]/60"
                            }`}
                          >
                            {d.replyIntent ?? "reply"}
                          </span>
                        </TableCell>
                        <TableCell className="font-mono text-xs max-w-[140px] truncate">
                          {d.to}
                        </TableCell>
                        <TableCell className="font-serif text-sm max-w-[180px] truncate">
                          {d.subject}
                        </TableCell>
                        <TableCell className="font-mono text-xs text-[#0A0A0A]/60">
                          {d.replyConfidence != null
                            ? `${d.replyConfidence}%`
                            : "—"}
                        </TableCell>
                        <TableCell className="font-mono text-[10px] text-[#0A0A0A]/40 whitespace-nowrap">
                          {formatDistanceToNow(d.createdAt, {
                            addSuffix: true,
                          })}
                        </TableCell>
                        <TableCell>
                          <Link
                            href="/email"
                            className="inline-flex items-center px-2 py-1 font-mono text-[10px] uppercase tracking-wider border border-[#0A0A0A] bg-white hover:bg-[#0A0A0A] hover:text-white transition-colors"
                          >
                            Approve
                          </Link>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </Section>

          {/* Tasks blocked on me */}
          <Section
            title="Blocked On Me"
            subtitle="Open tasks, soonest due first"
          >
            <Table>
              <TableHeader>
                <TableRow className="border-[#0A0A0A]/20">
                  <TableHead className="font-mono text-xs uppercase tracking-wider text-[#0A0A0A]/50">
                    Task
                  </TableHead>
                  <TableHead className="font-mono text-xs uppercase tracking-wider text-[#0A0A0A]/50">
                    Priority
                  </TableHead>
                  <TableHead className="font-mono text-xs uppercase tracking-wider text-[#0A0A0A]/50">
                    Status
                  </TableHead>
                  <TableHead className="font-mono text-xs uppercase tracking-wider text-[#0A0A0A]/50">
                    Due
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {openTasks.length === 0 && (
                  <TableRow>
                    <TableCell
                      colSpan={4}
                      className="text-center py-8 text-[#0A0A0A]/40 font-serif italic"
                    >
                      No open tasks. Inbox zero.
                    </TableCell>
                  </TableRow>
                )}
                {openTasks.map((t) => {
                  const overdue =
                    t.dueDate != null && new Date(t.dueDate) < now;
                  const high =
                    t.priority === "high" || t.priority === "urgent";
                  return (
                    <TableRow
                      key={t.id}
                      className="border-[#0A0A0A]/10 hover:bg-[#0A0A0A]/[0.02]"
                    >
                      <TableCell className="font-serif text-sm max-w-[260px] truncate">
                        {t.title}
                      </TableCell>
                      <TableCell>
                        <span
                          className={`inline-flex items-center px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wider ${
                            high
                              ? "bg-[#0A0A0A] text-white"
                              : "bg-[#0A0A0A]/5 text-[#0A0A0A]/60"
                          }`}
                        >
                          {t.priority}
                        </span>
                      </TableCell>
                      <TableCell className="font-mono text-xs text-[#0A0A0A]/60">
                        {t.status}
                      </TableCell>
                      <TableCell
                        className={`font-mono text-xs ${
                          overdue
                            ? "text-[#0A0A0A]"
                            : "text-[#0A0A0A]/40"
                        }`}
                      >
                        {t.dueDate
                          ? format(new Date(t.dueDate), "MMM d")
                          : "—"}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </Section>
        </div>

        {/* RIGHT COL */}
        <div className="space-y-4">
          {/* Outstanding invoices */}
          <Section
            title="Blocked On Counterparties"
            subtitle="Outstanding invoices, largest first"
          >
            <Table>
              <TableHeader>
                <TableRow className="border-[#0A0A0A]/20">
                  <TableHead className="font-mono text-xs uppercase tracking-wider text-[#0A0A0A]/50">
                    Client
                  </TableHead>
                  <TableHead className="font-mono text-xs uppercase tracking-wider text-[#0A0A0A]/50">
                    Amount
                  </TableHead>
                  <TableHead className="font-mono text-xs uppercase tracking-wider text-[#0A0A0A]/50">
                    Due
                  </TableHead>
                  <TableHead className="font-mono text-xs uppercase tracking-wider text-[#0A0A0A]/50">
                    Status
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {outstandingInvoices.length === 0 && (
                  <TableRow>
                    <TableCell
                      colSpan={4}
                      className="text-center py-8 text-[#0A0A0A]/40 font-serif italic"
                    >
                      Nothing outstanding. All paid up.
                    </TableCell>
                  </TableRow>
                )}
                {outstandingInvoices.map((inv) => {
                  const daysOverdue = inv.dueDate
                    ? Math.floor(
                        (now.getTime() -
                          new Date(inv.dueDate).getTime()) /
                          (1000 * 60 * 60 * 24)
                      )
                    : null;
                  return (
                    <TableRow
                      key={inv.id}
                      className="border-[#0A0A0A]/10 hover:bg-[#0A0A0A]/[0.02]"
                    >
                      <TableCell className="font-serif text-sm max-w-[180px] truncate">
                        {inv.clientName ?? "—"}
                      </TableCell>
                      <TableCell className="font-mono text-sm font-bold">
                        {formatDollars(inv.amount)}
                      </TableCell>
                      <TableCell className="font-mono text-xs">
                        {inv.dueDate ? (
                          <span
                            className={
                              daysOverdue != null && daysOverdue > 0
                                ? "text-[#0A0A0A]"
                                : "text-[#0A0A0A]/40"
                            }
                          >
                            {format(new Date(inv.dueDate), "MMM d")}
                            {daysOverdue != null && daysOverdue > 0 && (
                              <span className="ml-1 text-[10px] uppercase tracking-wider">
                                +{daysOverdue}d
                              </span>
                            )}
                          </span>
                        ) : (
                          <span className="text-[#0A0A0A]/40">—</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <span className="inline-flex items-center px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wider bg-[#0A0A0A]/5 text-[#0A0A0A]/60">
                          {inv.status}
                        </span>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </Section>

          {/* Hot pipeline */}
          <Section
            title="Pipeline Next Actions"
            subtitle="Follow-ups due in next 7 days"
          >
            <Table>
              <TableHeader>
                <TableRow className="border-[#0A0A0A]/20">
                  <TableHead className="font-mono text-xs uppercase tracking-wider text-[#0A0A0A]/50">
                    Lead
                  </TableHead>
                  <TableHead className="font-mono text-xs uppercase tracking-wider text-[#0A0A0A]/50">
                    Stage
                  </TableHead>
                  <TableHead className="font-mono text-xs uppercase tracking-wider text-[#0A0A0A]/50">
                    Value
                  </TableHead>
                  <TableHead className="font-mono text-xs uppercase tracking-wider text-[#0A0A0A]/50">
                    When
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {hotLeads.length === 0 && (
                  <TableRow>
                    <TableCell
                      colSpan={4}
                      className="text-center py-8 text-[#0A0A0A]/40 font-serif italic"
                    >
                      No follow-ups due this week.
                    </TableCell>
                  </TableRow>
                )}
                {hotLeads.map((lead) => (
                  <TableRow
                    key={lead.id}
                    className="border-[#0A0A0A]/10 hover:bg-[#0A0A0A]/[0.02]"
                  >
                    <TableCell className="font-serif text-sm max-w-[180px] truncate">
                      {lead.companyName
                        ? `${lead.contactName} · ${lead.companyName}`
                        : lead.contactName}
                    </TableCell>
                    <TableCell>
                      <span className="inline-flex items-center px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wider bg-[#0A0A0A]/5 text-[#0A0A0A]/60">
                        {lead.stage}
                      </span>
                    </TableCell>
                    <TableCell className="font-mono text-xs">
                      {lead.estimatedValue != null
                        ? formatDollars(lead.estimatedValue)
                        : "—"}
                    </TableCell>
                    <TableCell className="font-mono text-[10px] text-[#0A0A0A]/40 whitespace-nowrap">
                      {lead.nextFollowUpAt
                        ? formatDistanceToNow(lead.nextFollowUpAt, {
                            addSuffix: true,
                          })
                        : "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Section>

          {/* Agent runs */}
          <Section
            title="Agent Runs"
            subtitle="What ran in the last 24 hours"
          >
            <Table>
              <TableHeader>
                <TableRow className="border-[#0A0A0A]/20">
                  <TableHead className="font-mono text-xs uppercase tracking-wider text-[#0A0A0A]/50">
                    Function
                  </TableHead>
                  <TableHead className="font-mono text-xs uppercase tracking-wider text-[#0A0A0A]/50">
                    Status
                  </TableHead>
                  <TableHead className="font-mono text-xs uppercase tracking-wider text-[#0A0A0A]/50">
                    Duration
                  </TableHead>
                  <TableHead className="font-mono text-xs uppercase tracking-wider text-[#0A0A0A]/50">
                    Finished
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {recentRuns.length === 0 && (
                  <TableRow>
                    <TableCell
                      colSpan={4}
                      className="text-center py-8 text-[#0A0A0A]/40 font-serif italic"
                    >
                      No agent runs recorded.
                    </TableCell>
                  </TableRow>
                )}
                {recentRuns.map((r) => {
                  const failed = r.status === "failed";
                  return (
                    <TableRow
                      key={r.id}
                      className="border-[#0A0A0A]/10 hover:bg-[#0A0A0A]/[0.02]"
                    >
                      <TableCell className="font-serif text-sm max-w-[180px] truncate">
                        {r.functionName}
                      </TableCell>
                      <TableCell>
                        <span
                          className={`inline-flex items-center px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wider ${
                            failed
                              ? "bg-[#0A0A0A] text-white"
                              : "bg-[#0A0A0A]/5 text-[#0A0A0A]/60"
                          }`}
                        >
                          {r.status}
                        </span>
                      </TableCell>
                      <TableCell className="font-mono text-xs text-[#0A0A0A]/60">
                        {formatDuration(r.durationMs)}
                      </TableCell>
                      <TableCell className="font-mono text-[10px] text-[#0A0A0A]/40 whitespace-nowrap">
                        {r.completedAt
                          ? formatDistanceToNow(r.completedAt, {
                              addSuffix: true,
                            })
                          : formatDistanceToNow(r.startedAt, {
                              addSuffix: true,
                            })}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </Section>
        </div>
      </div>
    </div>
  );
}

// ─── Section Wrapper ────────────────────────────────────────────────────────

function Section({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="border border-[#0A0A0A] bg-white">
      <div className="border-b border-[#0A0A0A]/20 px-4 py-3">
        <h2 className="font-serif text-base font-bold tracking-tight">
          {title}
        </h2>
        {subtitle && (
          <p className="font-mono text-[10px] uppercase tracking-widest text-[#0A0A0A]/50 mt-0.5">
            {subtitle}
          </p>
        )}
      </div>
      <div className="overflow-x-auto">{children}</div>
    </div>
  );
}
