import { Redis } from "@upstash/redis";
import { unstable_cache } from "next/cache";

// ─── Cache Duration Constants (seconds) ──────────────────────────────────────

/** Frequently changing data — 60 seconds */
export const CACHE_SHORT = 60;

/** Moderate churn data — 5 minutes */
export const CACHE_MEDIUM = 300;

/** Low churn / expensive queries — 30 minutes */
export const CACHE_LONG = 1800;

/** Near-static data — 1 hour */
export const CACHE_STATIC = 3600;

/**
 * Create a cached version of any async function using Next.js unstable_cache.
 * Tags are used for on-demand revalidation via revalidateTag().
 */
export function cached<T>(
  fn: () => Promise<T>,
  keyParts: string[],
  opts: { revalidate: number; tags?: string[] }
): () => Promise<T> {
  return unstable_cache(fn, keyParts, {
    revalidate: opts.revalidate,
    tags: opts.tags,
  });
}

// If Upstash Redis is configured, use it. Otherwise fall back to in-memory.
const redis =
  process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN
    ? new Redis({
        url: process.env.UPSTASH_REDIS_REST_URL.trim(),
        token: process.env.UPSTASH_REDIS_REST_TOKEN.trim(),
      })
    : null;

const memoryCache = new Map<string, { data: unknown; expiresAt: number }>();

export const cache = {
  async get<T>(key: string): Promise<T | null> {
    if (redis) {
      const val = await redis.get<T>(key);
      return val;
    }
    const entry = memoryCache.get(key);
    if (entry && entry.expiresAt > Date.now()) return entry.data as T;
    if (entry) memoryCache.delete(key);
    return null;
  },

  async set(key: string, value: unknown, ttlSeconds: number): Promise<void> {
    if (redis) {
      await redis.set(key, value, { ex: ttlSeconds });
      return;
    }
    memoryCache.set(key, {
      data: value,
      expiresAt: Date.now() + ttlSeconds * 1000,
    });
  },

  async invalidate(key: string): Promise<void> {
    if (redis) {
      await redis.del(key);
      return;
    }
    memoryCache.delete(key);
  },

  async invalidatePattern(pattern: string): Promise<void> {
    if (redis) {
      const keys = await redis.keys(pattern);
      if (keys.length > 0) {
        await redis.del(...keys);
      }
      return;
    }
    // In-memory: match glob-like patterns (supports trailing *)
    const prefix = pattern.replace(/\*$/, "");
    for (const key of memoryCache.keys()) {
      if (key.startsWith(prefix)) {
        memoryCache.delete(key);
      }
    }
  },
};
