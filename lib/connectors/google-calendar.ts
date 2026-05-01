/**
 * Google Calendar Connector
 *
 * Pulls today's events across all connected Google accounts via Composio's
 * GOOGLECALENDAR_FIND_EVENT tool. Used by the calendar-aware morning briefing
 * and the /command Calendar widget.
 *
 * Setup:
 *   1. COMPOSIO_API_KEY in .env.local
 *   2. In Composio dashboard, configure googlecalendar auth config
 *   3. Set COMPOSIO_GOOGLECALENDAR_AUTH_CONFIG (defaults to "googlecalendar")
 *   4. Connect each Google account via OAuth (adam@modern-amenities.com,
 *      personal, cursive). Each becomes a row in connected_accounts with
 *      provider='googlecalendar'.
 *
 * Why Composio: matches the existing Gmail integration pattern. No new auth
 * scaffolding needed — same OAuth flow, same connectedAccounts table.
 */

import { getComposioClient, isComposioConfigured } from "@/lib/integrations/composio";
import { db } from "@/lib/db";
import { connectedAccounts } from "@/lib/db/schema";
import { and, eq } from "drizzle-orm";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface CalendarEvent {
  id: string;
  /** Calendar account this came from (display label) */
  account: string;
  /** Calendar account email if known */
  accountEmail?: string;
  summary: string;
  description?: string | null;
  location?: string | null;
  start: Date | null;
  end: Date | null;
  /** True for all-day events */
  allDay: boolean;
  /** Other attendees' emails */
  attendees: string[];
  /** Hangout / Meet / Zoom URL if attached */
  conferenceUrl?: string | null;
  /** Calendar ID this event belongs to within the account */
  calendarId?: string;
  /** "FOCUS:" prefix indicates a Littlebird-generated focus block */
  isFocusBlock: boolean;
  /** "EOD" / "Week Wrap" detection */
  isEodBlock: boolean;
  htmlLink?: string | null;
  /** transparency: "transparent" = free / non-blocking */
  transparency?: string | null;
  status?: string | null;
  /** raw payload for downstream agents */
  raw?: Record<string, unknown>;
}

export interface CalendarFetchResult {
  events: CalendarEvent[];
  /** Per-account error messages, keyed by account label */
  errors: Record<string, string>;
  accountCount: number;
}

// ─── Auth config ──────────────────────────────────────────────────────────────

function getCalendarAuthConfigId(): string {
  return process.env.COMPOSIO_GOOGLECALENDAR_AUTH_CONFIG ?? "googlecalendar";
}

export function isConfigured(): boolean {
  return isComposioConfigured();
}

// ─── Internal: list connected calendar accounts ───────────────────────────────

interface CalendarAccount {
  composioAccountId: string;
  userId: string;
  email: string | null;
  label: string; // display label
}

async function listCalendarAccounts(): Promise<CalendarAccount[]> {
  const rows = await db
    .select({
      composioAccountId: connectedAccounts.composioAccountId,
      userId: connectedAccounts.userId,
      email: connectedAccounts.email,
      metadata: connectedAccounts.metadata,
    })
    .from(connectedAccounts)
    .where(
      and(
        eq(connectedAccounts.provider, "googlecalendar"),
        eq(connectedAccounts.status, "active")
      )
    );

  return rows
    .filter((r) => !!r.composioAccountId)
    .map((r) => {
      const meta = (r.metadata ?? {}) as Record<string, unknown>;
      const label =
        (meta.label as string | undefined) ??
        r.email ??
        r.composioAccountId ??
        "calendar";
      return {
        composioAccountId: r.composioAccountId!,
        userId: r.userId,
        email: r.email,
        label,
      };
    });
}

// ─── Event normalization ──────────────────────────────────────────────────────

function parseEvent(
  raw: Record<string, unknown>,
  accountLabel: string,
  accountEmail: string | null
): CalendarEvent {
  const start = parseEventDate(raw.start as Record<string, unknown> | undefined);
  const end = parseEventDate(raw.end as Record<string, unknown> | undefined);
  const summary = (raw.summary as string | undefined) ?? "(no title)";
  const description = (raw.description as string | null | undefined) ?? null;
  const location = (raw.location as string | null | undefined) ?? null;
  const status = (raw.status as string | null | undefined) ?? null;
  const transparency = (raw.transparency as string | null | undefined) ?? null;
  const htmlLink = (raw.htmlLink as string | null | undefined) ?? null;

  const startObj = (raw.start as Record<string, unknown> | undefined) ?? {};
  const allDay = startObj.date != null && startObj.dateTime == null;

  const attendeesRaw = (raw.attendees as Record<string, unknown>[] | undefined) ?? [];
  const attendees = attendeesRaw
    .map((a) => (a.email as string | undefined) ?? "")
    .filter(Boolean);

  const conferenceData = raw.conferenceData as Record<string, unknown> | undefined;
  const entryPoints = (conferenceData?.entryPoints as Record<string, unknown>[] | undefined) ?? [];
  const conferenceUrl =
    (entryPoints.find((e) => e.entryPointType === "video")?.uri as string | undefined) ??
    (raw.hangoutLink as string | undefined) ??
    null;

  const isFocusBlock = /^FOCUS:/i.test(summary);
  const isEodBlock = /eod report|week wrap/i.test(summary);

  return {
    id: (raw.id as string) ?? `${accountLabel}-${start?.toISOString() ?? "unknown"}`,
    account: accountLabel,
    accountEmail: accountEmail ?? undefined,
    summary,
    description,
    location,
    start,
    end,
    allDay,
    attendees,
    conferenceUrl,
    calendarId: raw.organizer
      ? ((raw.organizer as Record<string, unknown>).email as string | undefined)
      : undefined,
    isFocusBlock,
    isEodBlock,
    htmlLink,
    transparency,
    status,
    raw,
  };
}

function parseEventDate(
  date: Record<string, unknown> | undefined
): Date | null {
  if (!date) return null;
  const dateTime = date.dateTime as string | undefined;
  const dateOnly = date.date as string | undefined;
  if (dateTime) return new Date(dateTime);
  if (dateOnly) return new Date(dateOnly);
  return null;
}

// ─── Public API ───────────────────────────────────────────────────────────────

export interface ListEventsParams {
  /** UTC ISO start of window. Defaults to today 00:00 in the configured TZ. */
  timeMin?: Date;
  /** UTC ISO end of window. Defaults to today 23:59 in the configured TZ. */
  timeMax?: Date;
  /** Max events to return per account */
  maxPerAccount?: number;
  /** Override calendar to read; defaults to "primary" */
  calendarId?: string;
}

/**
 * Pull events for today across every connected Google Calendar account.
 *
 * Returns merged + sorted events. Each account is queried in parallel. If
 * one account fails, the others still return — error message is recorded
 * per-account in the result.
 */
export async function listTodaysEvents(
  params: ListEventsParams = {}
): Promise<CalendarFetchResult> {
  if (!isConfigured()) {
    return { events: [], errors: { _global: "Composio not configured" }, accountCount: 0 };
  }

  const accounts = await listCalendarAccounts();
  if (accounts.length === 0) {
    return {
      events: [],
      errors: { _global: "No google calendar accounts connected" },
      accountCount: 0,
    };
  }

  const composio = getComposioClient();

  const now = new Date();
  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);
  const endOfToday = new Date(now);
  endOfToday.setHours(23, 59, 59, 999);

  const timeMin = (params.timeMin ?? startOfToday).toISOString();
  const timeMax = (params.timeMax ?? endOfToday).toISOString();
  const calendarId = params.calendarId ?? "primary";
  const maxResults = params.maxPerAccount ?? 50;

  const results = await Promise.allSettled(
    accounts.map(async (acct) => {
      const result = await composio.tools.execute("GOOGLECALENDAR_FIND_EVENT", {
        userId: acct.userId,
        connectedAccountId: acct.composioAccountId,
        arguments: {
          calendar_id: calendarId,
          time_min: timeMin,
          time_max: timeMax,
          single_events: true,
          order_by: "startTime",
          max_results: maxResults,
        },
      });
      const data = result.data as Record<string, unknown> | undefined;
      const items = (data?.items ?? data?.events ?? []) as Record<string, unknown>[];
      return {
        account: acct,
        events: items.map((raw) => parseEvent(raw, acct.label, acct.email)),
      };
    })
  );

  const events: CalendarEvent[] = [];
  const errors: Record<string, string> = {};
  for (let i = 0; i < results.length; i++) {
    const r = results[i];
    const acct = accounts[i];
    if (r.status === "fulfilled") {
      events.push(...r.value.events);
    } else {
      errors[acct.label] = r.reason instanceof Error ? r.reason.message : String(r.reason);
    }
  }

  // Sort merged events by start time, all-day first
  events.sort((a, b) => {
    if (a.allDay !== b.allDay) return a.allDay ? -1 : 1;
    const at = a.start?.getTime() ?? 0;
    const bt = b.start?.getTime() ?? 0;
    return at - bt;
  });

  return { events, errors, accountCount: accounts.length };
}

/**
 * Find open focus-block windows in today's calendar — used by the briefing
 * agent to suggest where to schedule new FOCUS: blocks if Littlebird hasn't
 * already done it.
 */
export interface OpenSlot {
  start: Date;
  end: Date;
  durationMin: number;
}

export function findOpenSlots(
  events: CalendarEvent[],
  opts: { dayStart?: Date; dayEnd?: Date; minDurationMin?: number } = {}
): OpenSlot[] {
  const dayStart = opts.dayStart ?? (() => {
    const d = new Date();
    d.setHours(8, 0, 0, 0);
    return d;
  })();
  const dayEnd = opts.dayEnd ?? (() => {
    const d = new Date();
    d.setHours(18, 0, 0, 0);
    return d;
  })();
  const minDuration = opts.minDurationMin ?? 60;

  // Only consider non-transparent (i.e. blocking) events
  const blocking = events
    .filter((e) => e.transparency !== "transparent" && !e.allDay && e.start && e.end)
    .map((e) => ({ start: e.start as Date, end: e.end as Date }))
    .sort((a, b) => a.start.getTime() - b.start.getTime());

  const slots: OpenSlot[] = [];
  let cursor = dayStart;
  for (const evt of blocking) {
    if (evt.start.getTime() > cursor.getTime()) {
      const durationMin = (evt.start.getTime() - cursor.getTime()) / 60_000;
      if (durationMin >= minDuration) {
        slots.push({ start: cursor, end: evt.start, durationMin });
      }
    }
    if (evt.end.getTime() > cursor.getTime()) {
      cursor = evt.end;
    }
  }
  if (cursor.getTime() < dayEnd.getTime()) {
    const durationMin = (dayEnd.getTime() - cursor.getTime()) / 60_000;
    if (durationMin >= minDuration) {
      slots.push({ start: cursor, end: dayEnd, durationMin });
    }
  }
  return slots;
}
