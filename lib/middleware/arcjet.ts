import arcjet, { shield, detectBot, tokenBucket } from "@arcjet/next";

/**
 * ArcJet security middleware — rate limiting + bot detection + shield.
 *
 * Usage in API routes:
 *   import { aj, ajWebhook, ajAiChat } from "@/lib/middleware/arcjet";
 *   const decision = await aj.protect(req);
 *   if (decision.isDenied()) {
 *     return NextResponse.json({ error: "Forbidden" }, { status: 403 });
 *   }
 */

const key = process.env.ARCJET_KEY;

/** Default rate limiter: 100 req/min per IP + shield + bot detection */
export const aj = key
  ? arcjet({
      key,
      characteristics: ["ip.src"],
      rules: [
        shield({ mode: "LIVE" }),
        detectBot({
          mode: "LIVE",
          allow: [
            "CATEGORY:SEARCH_ENGINE",
            "CATEGORY:MONITOR",
            "CATEGORY:PREVIEW",
          ],
        }),
        tokenBucket({
          mode: "LIVE",
          refillRate: 100,
          interval: 60,
          capacity: 100,
        }),
      ],
    })
  : null;

/** Webhook rate limiter: 200 req/min per IP (webhooks come in bursts) */
export const ajWebhook = key
  ? arcjet({
      key,
      characteristics: ["ip.src"],
      rules: [
        shield({ mode: "LIVE" }),
        tokenBucket({
          mode: "LIVE",
          refillRate: 200,
          interval: 60,
          capacity: 200,
        }),
      ],
    })
  : null;

/**
 * MCP agent rate limiter: 30 req/min per IP.
 * Hermes sends ≤2 requests per cron run and ≤20 during a complex Slack
 * session, so 30/min is comfortable for legitimate use while blocking
 * brute-force token-probing and runaway agent loops.
 */
export const ajMcp = key
  ? arcjet({
      key,
      characteristics: ["ip.src"],
      rules: [
        shield({ mode: "LIVE" }),
        tokenBucket({
          mode: "LIVE",
          refillRate: 30,
          interval: 60,
          capacity: 30,
        }),
      ],
    })
  : null;

/** AI chat rate limiter: 20 req/min per IP (prevent runaway AI costs) */
export const ajAiChat = key
  ? arcjet({
      key,
      characteristics: ["ip.src"],
      rules: [
        shield({ mode: "LIVE" }),
        tokenBucket({
          mode: "LIVE",
          refillRate: 20,
          interval: 60,
          capacity: 20,
        }),
      ],
    })
  : null;
