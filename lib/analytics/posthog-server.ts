import { PostHog } from "posthog-node";

/**
 * PostHog server-side singleton.
 *
 * Usage in Server Actions / API routes with after():
 *   import { after } from "next/server";
 *   import { posthog } from "@/lib/analytics/posthog-server";
 *
 *   after(() => {
 *     posthog?.capture({
 *       distinctId: userId,
 *       event: "invoice_created",
 *       properties: { amount, clientId },
 *     });
 *   });
 */

let posthogInstance: PostHog | null = null;

function getPostHog(): PostHog | null {
  if (posthogInstance) return posthogInstance;

  const key = process.env.NEXT_PUBLIC_POSTHOG_KEY;
  const host = process.env.NEXT_PUBLIC_POSTHOG_HOST;

  if (!key || !host) return null;

  posthogInstance = new PostHog(key, {
    host,
    flushAt: 30,
    flushInterval: 5000,
  });

  return posthogInstance;
}

export const posthog = getPostHog();
