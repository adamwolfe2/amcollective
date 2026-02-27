import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

function createRedis(): Redis | null {
  if (
    !process.env.UPSTASH_REDIS_REST_URL ||
    !process.env.UPSTASH_REDIS_REST_TOKEN
  ) {
    return null;
  }
  return new Redis({
    url: process.env.UPSTASH_REDIS_REST_URL,
    token: process.env.UPSTASH_REDIS_REST_TOKEN,
  });
}

function createLimiter(
  redis: Redis | null,
  requests: number,
  window: `${number} ${"ms" | "s" | "m" | "h" | "d"}`
): Ratelimit | null {
  if (!redis) return null;
  return new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(requests, window),
    analytics: false,
  });
}

const redis = createRedis();

/** 60 API requests per user per minute */
export const apiLimiter = createLimiter(redis, 60, "1 m");

/** 10 write operations per user per minute */
export const writeLimiter = createLimiter(redis, 10, "1 m");

/** 5 AI chat requests per user per minute */
export const aiLimiter = createLimiter(redis, 5, "1 m");

/**
 * Check if a request should be allowed under the rate limit.
 * Skips gracefully if limiter is null (env vars not set).
 */
export async function checkRateLimit(
  limiter: Ratelimit | null,
  identifier: string
): Promise<{
  allowed: boolean;
  limit: number;
  remaining: number;
  reset: number;
}> {
  if (!limiter) {
    return { allowed: true, limit: 0, remaining: 0, reset: 0 };
  }
  const result = await limiter.limit(identifier);
  return {
    allowed: result.success,
    limit: result.limit,
    remaining: result.remaining,
    reset: result.reset,
  };
}

/** Extract the best available IP address from a request. */
export function getIp(req: Request): string {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return "127.0.0.1";
}
