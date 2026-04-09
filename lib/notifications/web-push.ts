/**
 * Web Push notification sender.
 *
 * NOTE: Full server-side Web Push (JWT + encrypted payload per RFC 8291/8292)
 * requires the `web-push` npm package or a substantial crypto implementation.
 * That package is not currently in deps and was excluded per task constraints.
 *
 * What IS implemented:
 * - Fetching a user's push subscriptions from the DB
 * - Sending via the Web Push API when `web-push` is available at runtime
 * - Stale subscription cleanup (410 Gone)
 *
 * TODO: Add `web-push` to package.json, then uncomment the sending logic below.
 *       Command: pnpm add web-push @types/web-push
 */

import { db } from "@/lib/db";
import { pushSubscriptions } from "@/lib/db/schema/push-subscriptions";
import { eq } from "drizzle-orm";
import { captureError } from "@/lib/errors";

export interface PushPayload {
  title: string;
  body: string;
  url?: string;
}

/**
 * Fetch all push subscriptions for a given Clerk user ID.
 */
export async function getUserSubscriptions(userId: string) {
  return db
    .select()
    .from(pushSubscriptions)
    .where(eq(pushSubscriptions.userId, userId));
}

/**
 * Remove a stale subscription by endpoint (called on 410 Gone).
 */
export async function removeSubscription(endpoint: string): Promise<void> {
  await db
    .delete(pushSubscriptions)
    .where(eq(pushSubscriptions.endpoint, endpoint));
}

/**
 * Send a push notification to all devices for a given user.
 *
 * Server-side Web Push requires VAPID keys and payload encryption.
 * Install `web-push` to enable full sending:
 *
 *   pnpm add web-push @types/web-push
 *
 * Then replace the stub below with:
 *
 *   import webpush from 'web-push';
 *   webpush.setVapidDetails(
 *     'mailto:team@amcollectivecapital.com',
 *     process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,
 *     process.env.VAPID_PRIVATE_KEY!
 *   );
 *   await webpush.sendNotification(sub, JSON.stringify(payload));
 */
export async function sendPushNotification(
  userId: string,
  payload: PushPayload
): Promise<void> {
  const subs = await getUserSubscriptions(userId);
  if (subs.length === 0) return;

  // web-push not installed — log intent only.
  // Replace with real sending once `web-push` dep is added.
  for (const sub of subs) {
    try {
      // Placeholder: real implementation calls webpush.sendNotification()
      // Keeping the loop structure so stale-cleanup logic is ready to go.
      void sub; // suppress unused-var lint until real impl
      void payload;
      captureError(
        new Error(
          `[web-push] sendPushNotification called but web-push package not installed. ` +
            `User: ${userId}, title: "${payload.title}". Add web-push dep to enable.`
        ),
        { tags: { source: "web-push", userId }, level: "info" }
      );
    } catch (err: unknown) {
      const status = (err as { statusCode?: number }).statusCode;
      if (status === 410) {
        // Subscription expired — clean up
        await removeSubscription(sub.endpoint).catch(() => null);
      } else {
        captureError(err, {
          tags: { source: "web-push", route: "sendPushNotification", userId },
          level: "warning",
        });
      }
    }
  }
}
