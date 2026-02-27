/**
 * AM Collective — PostHog Connector (READ-ONLY)
 *
 * Pulls analytics data from the PostHog Query API.
 * Requires POSTHOG_PERSONAL_API_KEY for the query API (not currently set).
 * Falls back gracefully when not configured.
 *
 * TODO: Add POSTHOG_PERSONAL_API_KEY and POSTHOG_PROJECT_ID to env vars
 */

import { cached, safeCall, type ConnectorResult } from "./base";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface ActiveUsersData {
  dau: number;
  wau: number;
  mau: number;
}

export interface TopEvent {
  event: string;
  count: number;
}

export interface PageviewTrend {
  date: string;
  count: number;
}

// ─── Internals ───────────────────────────────────────────────────────────────

function isConfigured(): boolean {
  return !!(
    process.env.POSTHOG_PERSONAL_API_KEY && process.env.POSTHOG_PROJECT_ID
  );
}

function getHeaders(): HeadersInit {
  return {
    Authorization: `Bearer ${process.env.POSTHOG_PERSONAL_API_KEY}`,
    "Content-Type": "application/json",
  };
}

function getBaseUrl(): string {
  const host = process.env.NEXT_PUBLIC_POSTHOG_HOST || "https://us.i.posthog.com";
  return host;
}

async function posthogQuery<T>(query: string): Promise<T> {
  const projectId = process.env.POSTHOG_PROJECT_ID;
  const res = await fetch(`${getBaseUrl()}/api/projects/${projectId}/query/`, {
    method: "POST",
    headers: getHeaders(),
    body: JSON.stringify({ query: { kind: "HogQLQuery", query } }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`PostHog API ${res.status}: ${body.slice(0, 200)}`);
  }
  return res.json() as Promise<T>;
}

// ─── Public API ──────────────────────────────────────────────────────────────

export async function getActiveUsers(): Promise<ConnectorResult<ActiveUsersData>> {
  if (!isConfigured()) {
    return {
      success: false,
      error: "PostHog query API not configured (need POSTHOG_PERSONAL_API_KEY + POSTHOG_PROJECT_ID)",
      fetchedAt: new Date(),
    };
  }
  return safeCall(() =>
    cached(
      "posthog:active-users",
      async () => {
        const res = await posthogQuery<{
          results: Array<Array<number>>;
        }>(`
          SELECT
            countDistinctIf(distinct_id, timestamp > now() - interval 1 day) as dau,
            countDistinctIf(distinct_id, timestamp > now() - interval 7 day) as wau,
            countDistinctIf(distinct_id, timestamp > now() - interval 30 day) as mau
          FROM events
          WHERE event != '$feature_flag_called'
        `);
        const [dau, wau, mau] = res.results?.[0] ?? [0, 0, 0];
        return { dau, wau, mau };
      },
      10 * 60 * 1000
    )
  );
}

export async function getTopEvents(
  limit = 10
): Promise<ConnectorResult<TopEvent[]>> {
  if (!isConfigured()) {
    return {
      success: false,
      error: "PostHog query API not configured",
      fetchedAt: new Date(),
    };
  }
  return safeCall(() =>
    cached(`posthog:top-events:${limit}`, async () => {
      const res = await posthogQuery<{
        results: Array<[string, number]>;
      }>(`
        SELECT event, count() as cnt
        FROM events
        WHERE timestamp > now() - interval 7 day
          AND event NOT IN ('$feature_flag_called', '$pageleave')
        GROUP BY event
        ORDER BY cnt DESC
        LIMIT ${limit}
      `);
      return (res.results ?? []).map(([event, count]) => ({ event, count }));
    })
  );
}

export async function getPageviews(
  days = 14
): Promise<ConnectorResult<PageviewTrend[]>> {
  if (!isConfigured()) {
    return {
      success: false,
      error: "PostHog query API not configured",
      fetchedAt: new Date(),
    };
  }
  return safeCall(() =>
    cached(`posthog:pageviews:${days}`, async () => {
      const res = await posthogQuery<{
        results: Array<[string, number]>;
      }>(`
        SELECT toDate(timestamp) as day, count() as cnt
        FROM events
        WHERE event = '$pageview'
          AND timestamp > now() - interval ${days} day
        GROUP BY day
        ORDER BY day ASC
      `);
      return (res.results ?? []).map(([date, count]) => ({ date, count }));
    })
  );
}
