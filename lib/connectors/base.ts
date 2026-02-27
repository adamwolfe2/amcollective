/**
 * AM Collective — Connector Base Framework
 *
 * Standard interface + caching for all external service connectors.
 * Connectors are READ-ONLY wrappers around external APIs.
 */

// ─── Types ───────────────────────────────────────────────────────────────────

export interface ConnectorResult<T> {
  success: boolean;
  data?: T;
  error?: string;
  fetchedAt: Date;
}

// ─── In-Memory Cache with TTL ────────────────────────────────────────────────

interface CacheEntry<T> {
  data: T;
  expiresAt: number;
}

const cache = new Map<string, CacheEntry<unknown>>();

const DEFAULT_TTL_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Get a cached value, or run the fetcher and cache the result.
 * Simple in-memory Map — no Redis dependency for read-only connector calls.
 */
export async function cached<T>(
  key: string,
  fetcher: () => Promise<T>,
  ttlMs: number = DEFAULT_TTL_MS
): Promise<T> {
  const now = Date.now();
  const existing = cache.get(key) as CacheEntry<T> | undefined;

  if (existing && existing.expiresAt > now) {
    return existing.data;
  }

  const data = await fetcher();
  cache.set(key, { data, expiresAt: now + ttlMs });
  return data;
}

/** Manually invalidate a cache key or all keys matching a prefix. */
export function invalidateCache(prefixOrKey: string): void {
  if (cache.has(prefixOrKey)) {
    cache.delete(prefixOrKey);
    return;
  }
  for (const key of cache.keys()) {
    if (key.startsWith(prefixOrKey)) {
      cache.delete(key);
    }
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
