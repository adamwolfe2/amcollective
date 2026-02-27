/**
 * AM Collective — PostHog Connector (READ-ONLY)
 *
 * Multi-project PostHog analytics via HogQL query API.
 * Supports per-project credentials for querying across portfolio products.
 * Falls back gracefully when not configured.
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

function getBaseUrl(host?: string): string {
  return host || process.env.NEXT_PUBLIC_POSTHOG_HOST || "https://us.i.posthog.com";
}

async function posthogQueryForProject<T>(
  apiKey: string,
  projectId: string,
  query: string,
  host?: string
): Promise<T> {
  const baseUrl = getBaseUrl(host);
  const res = await fetch(`${baseUrl}/api/projects/${projectId}/query/`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query: { kind: "HogQLQuery", query } }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`PostHog API ${res.status}: ${body.slice(0, 200)}`);
  }
  return res.json() as Promise<T>;
}

/** Legacy internal helper using global env vars */
async function posthogQuery<T>(query: string): Promise<T> {
  const apiKey = process.env.POSTHOG_PERSONAL_API_KEY!;
  const projectId = process.env.POSTHOG_PROJECT_ID!;
  return posthogQueryForProject<T>(apiKey, projectId, query);
}

// ─── Per-Project API ────────────────────────────────────────────────────────

export async function getActiveUsersForProject(
  apiKey: string,
  projectId: string,
  host?: string
): Promise<ConnectorResult<ActiveUsersData>> {
  return safeCall(() =>
    cached(
      `posthog:active-users:${projectId}`,
      async () => {
        const res = await posthogQueryForProject<{
          results: Array<Array<number>>;
        }>(
          apiKey,
          projectId,
          `
          SELECT
            countDistinctIf(distinct_id, timestamp > now() - interval 1 day) as dau,
            countDistinctIf(distinct_id, timestamp > now() - interval 7 day) as wau,
            countDistinctIf(distinct_id, timestamp > now() - interval 30 day) as mau
          FROM events
          WHERE event != '$feature_flag_called'
        `,
          host
        );
        const [dau, wau, mau] = res.results?.[0] ?? [0, 0, 0];
        return { dau, wau, mau };
      },
      10 * 60 * 1000
    )
  );
}

export async function getTopEventsForProject(
  apiKey: string,
  projectId: string,
  limit = 10,
  host?: string
): Promise<ConnectorResult<TopEvent[]>> {
  return safeCall(() =>
    cached(`posthog:top-events:${projectId}:${limit}`, async () => {
      const res = await posthogQueryForProject<{
        results: Array<[string, number]>;
      }>(
        apiKey,
        projectId,
        `
        SELECT event, count() as cnt
        FROM events
        WHERE timestamp > now() - interval 7 day
          AND event NOT IN ('$feature_flag_called', '$pageleave')
        GROUP BY event
        ORDER BY cnt DESC
        LIMIT ${limit}
      `,
        host
      );
      return (res.results ?? []).map(([event, count]) => ({ event, count }));
    })
  );
}

export async function getTopPagesForProject(
  apiKey: string,
  projectId: string,
  limit = 10,
  host?: string
): Promise<ConnectorResult<PageviewTrend[]>> {
  return safeCall(() =>
    cached(`posthog:top-pages:${projectId}:${limit}`, async () => {
      const res = await posthogQueryForProject<{
        results: Array<[string, number]>;
      }>(
        apiKey,
        projectId,
        `
        SELECT properties.$current_url as page, count() as cnt
        FROM events
        WHERE event = '$pageview'
          AND timestamp > now() - interval 7 day
        GROUP BY page
        ORDER BY cnt DESC
        LIMIT ${limit}
      `,
        host
      );
      return (res.results ?? []).map(([date, count]) => ({ date, count }));
    })
  );
}

export async function getSignupCountForProject(
  apiKey: string,
  projectId: string,
  days = 30,
  host?: string
): Promise<ConnectorResult<number>> {
  return safeCall(() =>
    cached(`posthog:signups:${projectId}:${days}`, async () => {
      const res = await posthogQueryForProject<{
        results: Array<[number]>;
      }>(
        apiKey,
        projectId,
        `
        SELECT count() as cnt
        FROM events
        WHERE event IN ('$signup', 'user_signed_up', 'signup')
          AND timestamp > now() - interval ${days} day
      `,
        host
      );
      return res.results?.[0]?.[0] ?? 0;
    })
  );
}

export async function getPageviewsForProject(
  apiKey: string,
  projectId: string,
  days = 14,
  host?: string
): Promise<ConnectorResult<PageviewTrend[]>> {
  return safeCall(() =>
    cached(`posthog:pageviews:${projectId}:${days}`, async () => {
      const res = await posthogQueryForProject<{
        results: Array<[string, number]>;
      }>(
        apiKey,
        projectId,
        `
        SELECT toDate(timestamp) as day, count() as cnt
        FROM events
        WHERE event = '$pageview'
          AND timestamp > now() - interval ${days} day
        GROUP BY day
        ORDER BY day ASC
      `,
        host
      );
      return (res.results ?? []).map(([date, count]) => ({ date, count }));
    })
  );
}

// ─── Backward-Compatible Wrappers (use global env vars) ─────────────────────

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
