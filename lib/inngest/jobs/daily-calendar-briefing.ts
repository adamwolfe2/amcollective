/**
 * Inngest Job — Daily Calendar Briefing
 *
 * Fires every weekday at 10:00 AM America/Los_Angeles. Reads today's events
 * across all connected Google Calendar accounts (adam@modern-amenities.com,
 * personal, cursive, etc.), checks for Littlebird-generated FOCUS: blocks
 * vs gaps, and posts a structured Slack briefing.
 *
 * This is the Claude-side mirror of Littlebird's morning routine. Where
 * Littlebird *creates* the time-blocked calendar, this job *reads* it and
 * (a) confirms the day is built, (b) flags drift (FOCUS blocks carrying
 * over too many days), (c) feeds the /command page.
 *
 * Cron: Mon-Fri 10am LA  ("TZ=America/Los_Angeles 0 10 * * 1-5")
 *
 * Slack format (concise, scannable):
 *   CALENDAR · Mon May 1 · 3 acct · 7 events · 2 FOCUS · EOD ✓
 *   09:00 — Sales Huddle  [MA]
 *   10:00 — L10 · Cursive  [CUR]
 *   13:00 — FOCUS: Randy Sequence ⏵  [PER] (carryover from 4/30)
 *   ...
 *   ⚠ Top roadmap tasks NOT in today's FOCUS blocks: ...
 */

import { inngest } from "../client";
import { captureError } from "@/lib/errors";
import { notifySlack } from "@/lib/webhooks/slack";
import {
  listTodaysEvents,
  findOpenSlots,
  isConfigured as isCalendarConfigured,
  type CalendarEvent,
} from "@/lib/connectors/google-calendar";
import { db } from "@/lib/db";
import { tasks } from "@/lib/db/schema";
import { and, asc, eq, inArray, not, sql } from "drizzle-orm";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtTime(d: Date | null): string {
  if (!d) return "??";
  return d.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "America/Los_Angeles",
  });
}

function fmtDate(d: Date): string {
  return d.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone: "America/Los_Angeles",
  });
}

function eventAccountTag(account: string): string {
  if (/cursive/i.test(account)) return "CUR";
  if (/modern[-\s]?amenities/i.test(account)) return "MA";
  if (/personal/i.test(account) || /adamwolfe10[02]/i.test(account)) return "PER";
  if (/leasestack/i.test(account)) return "LS";
  return account.slice(0, 3).toUpperCase();
}

function isCarryover(description: string | null | undefined): {
  carry: boolean;
  from?: string;
} {
  const desc = description ?? "";
  const m = desc.match(/carried over from\s+([0-9\/\-]+)/i);
  if (m) return { carry: true, from: m[1] };
  return { carry: false };
}

interface BriefingResult {
  message: string;
  accountCount: number;
  eventCount: number;
  focusBlockCount: number;
  carryoverCount: number;
  hasEodBlock: boolean;
  errors: Record<string, string>;
}

/**
 * Build the briefing inside a single step. We don't expose CalendarEvent
 * (which contains Date) across the step.run boundary — Inngest serializes
 * step results to JSON, which would clobber Dates. So we do all the date
 * math here and return only primitive analytics + the rendered message.
 */
async function buildBriefing(): Promise<BriefingResult> {
  const today = new Date();

  // 1. Fetch calendar
  const calendar = await listTodaysEvents();

  // 2. Fetch top roadmap tasks (urgent/high priority, ranked)
  const roadmapTasks = await db
    .select({
      id: tasks.id,
      title: tasks.title,
      priority: tasks.priority,
      labels: tasks.labels,
    })
    .from(tasks)
    .where(
      and(
        eq(tasks.isArchived, false),
        not(inArray(tasks.status, ["done", "cancelled"])),
        inArray(tasks.priority, ["urgent", "high"]),
        sql`${tasks.labels}::jsonb @> ${JSON.stringify(["roadmap:2026-q2"])}::jsonb`
      )
    )
    .orderBy(asc(tasks.position))
    .limit(5)
    .catch(() => [] as Array<{ id: string; title: string; priority: string; labels: string[] | null }>);

  if (calendar.accountCount === 0) {
    return {
      message: `CALENDAR · ${fmtDate(today)} · no google calendar accounts connected via Composio. Connect at /settings/integrations to enable daily briefing.`,
      accountCount: 0,
      eventCount: 0,
      focusBlockCount: 0,
      carryoverCount: 0,
      hasEodBlock: false,
      errors: calendar.errors,
    };
  }

  const events: CalendarEvent[] = calendar.events;
  const focusBlocks = events.filter((e) => e.isFocusBlock);
  const eodBlock = events.find((e) => e.isEodBlock);
  const carryovers = focusBlocks
    .map((e) => ({ event: e, info: isCarryover(e.description) }))
    .filter((x) => x.info.carry);
  const openSlots = findOpenSlots(events, { minDurationMin: 60 });

  const lines: string[] = [];
  lines.push(
    `CALENDAR · ${fmtDate(today)} · ${calendar.accountCount} acct · ${events.length} events · ${focusBlocks.length} FOCUS · ${eodBlock ? "EOD ✓" : "no EOD"}`
  );
  lines.push("");
  if (events.length === 0) {
    lines.push("(no events today — Littlebird hasn't built the day yet?)");
  } else {
    for (const e of events.slice(0, 12)) {
      const tag = eventAccountTag(e.account);
      const time = e.allDay ? "all-day" : fmtTime(e.start);
      const focusMark = e.isFocusBlock ? " ⏵" : "";
      const co = isCarryover(e.description);
      const coMark = co.carry ? ` (carryover from ${co.from ?? "?"})` : "";
      lines.push(`${time} — ${e.summary}${focusMark}  [${tag}]${coMark}`);
    }
    if (events.length > 12) {
      lines.push(`+ ${events.length - 12} more`);
    }
  }

  if (carryovers.length > 0) {
    lines.push("");
    lines.push(
      `⚠ ${carryovers.length} carryover focus block${carryovers.length === 1 ? "" : "s"} — same task slipping multiple days = delegate, kill, or stop avoiding`
    );
  }

  // Roadmap coverage check
  if (roadmapTasks.length > 0) {
    const covered = new Set<string>();
    for (const fb of focusBlocks) {
      for (const t of roadmapTasks) {
        const cleanTitle = t.title.replace(/^#\d+\s·\s/, "").toLowerCase();
        const probe = cleanTitle.slice(0, 20);
        if (
          fb.summary.toLowerCase().includes(probe) ||
          (fb.description ?? "").toLowerCase().includes(probe)
        ) {
          covered.add(t.id);
        }
      }
    }
    const uncovered = roadmapTasks.filter((t) => !covered.has(t.id));
    if (uncovered.length > 0) {
      lines.push("");
      lines.push("⚠ Top roadmap tasks NOT in today's FOCUS blocks:");
      for (const t of uncovered.slice(0, 3)) {
        lines.push(`  • ${t.title}`);
      }
    }
  }

  if (openSlots.length > 0 && focusBlocks.length === 0) {
    lines.push("");
    lines.push(
      `Open slots: ${openSlots.map((s) => `${fmtTime(s.start)}-${fmtTime(s.end)} (${Math.round(s.durationMin)}m)`).join(", ")}`
    );
  }

  if (Object.keys(calendar.errors).length > 0) {
    lines.push("");
    lines.push(`(account fetch errors: ${Object.keys(calendar.errors).join(", ")})`);
  }

  return {
    message: lines.join("\n"),
    accountCount: calendar.accountCount,
    eventCount: events.length,
    focusBlockCount: focusBlocks.length,
    carryoverCount: carryovers.length,
    hasEodBlock: !!eodBlock,
    errors: calendar.errors,
  };
}

// ─── Job ──────────────────────────────────────────────────────────────────────

export const dailyCalendarBriefing = inngest.createFunction(
  {
    id: "daily-calendar-briefing",
    name: "Daily Calendar Briefing",
    retries: 1,
    onFailure: async ({ error }) => {
      captureError(error, {
        tags: { source: "inngest", job: "daily-calendar-briefing" },
        level: "warning",
      });
    },
  },
  { cron: "TZ=America/Los_Angeles 0 10 * * 1-5" },
  async ({ step }) => {
    if (!isCalendarConfigured()) {
      return { skipped: true, reason: "Composio / google calendar not configured" };
    }

    const briefing = await step.run("build-briefing", buildBriefing);

    await step.run("post-slack", async () => {
      await notifySlack(briefing.message);
    });

    return {
      success: true,
      accountCount: briefing.accountCount,
      eventCount: briefing.eventCount,
      focusBlockCount: briefing.focusBlockCount,
      carryoverCount: briefing.carryoverCount,
      hasEodBlock: briefing.hasEodBlock,
      errors: briefing.errors,
    };
  }
);
