import arcjet, { shield, detectBot, tokenBucket } from "@arcjet/next";

/**
 * ArcJet security middleware — rate limiting + bot detection + shield.
 *
 * Usage in API routes:
 *   import { aj } from "@/lib/middleware/arcjet";
 *   const decision = await aj.protect(req);
 *   if (decision.isDenied()) {
 *     return NextResponse.json({ error: "Forbidden" }, { status: 403 });
 *   }
 */

const key = process.env.ARCJET_KEY;

export const aj = key
  ? arcjet({
      key,
      characteristics: ["ip.src"],
      rules: [
        // Shield protects against common attacks (SQL injection, XSS, etc.)
        shield({ mode: "LIVE" }),
        // Bot detection blocks automated requests
        detectBot({
          mode: "LIVE",
          allow: [
            "CATEGORY:SEARCH_ENGINE",
            "CATEGORY:MONITOR",
            "CATEGORY:PREVIEW",
          ],
        }),
        // Rate limiting: 100 requests per 60 seconds per IP
        tokenBucket({
          mode: "LIVE",
          refillRate: 100,
          interval: 60,
          capacity: 100,
        }),
      ],
    })
  : null;
