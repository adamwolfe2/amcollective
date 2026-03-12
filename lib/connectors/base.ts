/**
 * AM Collective — Connector Base Framework
 *
 * Standard interface + caching for all external service connectors.
 * Connectors are READ-ONLY wrappers around external APIs.
 *
 * Cache backend: Upstash Redis (survives serverless cold starts).
 * Graceful fallback: if Redis is unavailable, every request hits the source.
 */

import { Redis } from "@upstash/redis";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface ConnectorResult<T> {
  success: boolean;
  data?: T;
  error?: string;
  fetchedAt: Date;
}

// ─── Redis Client (module-level singleton) ────────────────────────────────────

interface RedisCacheEntry<T> {
  d: T;       // data
  t: number;  // fetchedAt unix ms
}

let _redis: Redis | null | undefined = undefined; // undefined = not yet initialized

function getRedis(): Redis | null {
  if (_redis !== undefined) return _redis;
  if (
    !process.env.UPSTASH_REDIS_REST_URL ||
    !process.env.UPSTASH_REDIS_REST_TOKEN
  ) {
    _redis = null;
    return null;
  }
  try {
    _redis = Redis.fromEnv();
  } catch {
    _redis = null;
  }
  return _redis;
}

const CACHE_PREFIX = "amc:conn:";
const DEFAULT_TTL_SECONDS = 5 * 60; // 5 minutes

/** Exported TTL constants for connectors to use */
export const CACHE_TTL = {
  REALTIME: 60,        // 1 min — analytics, alerts
  STANDARD: 300,       // 5 min — default
  STABLE: 1800,        // 30 min — MRR, subscriptions
  SLOW_MOVING: 3600,   // 1 hour — bank balances, project list
} as const;

// ─── Cache API ────────────────────────────────────────────────────────────────

/**
 * Get a cached value from Redis, or run the fetcher and cache the result.
 * Graceful fallback: if Redis is unavailable, always runs the fetcher.
 */
export async function cached<T>(
  key: string,
  fetcher: () => Promise<T>,
  ttlSeconds: number = DEFAULT_TTL_SECONDS
): Promise<T> {
  const redis = getRedis();
  const redisKey = `${CACHE_PREFIX}${key}`;

  if (redis) {
    try {
      const hit = await redis.get<RedisCacheEntry<T>>(redisKey);
      if (hit !== null && hit !== undefined) {
        return hit.d;
      }
    } catch {
      // Redis unavailable — fall through to fetcher
    }
  }

  const data = await fetcher();

  if (redis) {
    // Fire-and-forget — don't block the response on Redis writes
    redis
      .set(redisKey, { d: data, t: Date.now() } as RedisCacheEntry<T>, {
        ex: ttlSeconds,
      })
      .catch(() => {});
  }

  return data;
}

/**
 * Return the UTC timestamp when a key was last fetched, or null.
 * Used for data freshness indicators in the dashboard.
 */
export async function getCachedAt(key: string): Promise<Date | null> {
  const redis = getRedis();
  if (!redis) return null;
  try {
    const entry = await redis.get<RedisCacheEntry<unknown>>(
      `${CACHE_PREFIX}${key}`
    );
    if (entry && entry.t) return new Date(entry.t);
  } catch {
    // ignore
  }
  return null;
}

/** Manually invalidate a cache key. Best-effort — ignores Redis errors. */
export async function invalidateCache(key: string): Promise<void> {
  const redis = getRedis();
  if (!redis) return;
  try {
    await redis.del(`${CACHE_PREFIX}${key}`);
  } catch {
    // Ignore Redis errors — invalidation is best-effort
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Wrap any async call into a ConnectorResult. */
export async function safeCall<T>(
  fn: () => Promise<T>
): Promise<ConnectorResult<T>> {
  try {
    const data = await fn();
    return { success: true, data, fetchedAt: new Date() };
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Unknown connector error";
    console.error(`[Connector Error] ${message}`);
    return { success: false, error: message, fetchedAt: new Date() };
  }
}
