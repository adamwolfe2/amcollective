/**
 * Notifications Repository
 *
 * CRUD operations for user-facing in-app notifications.
 */

import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { eq, desc, and, count, inArray } from "drizzle-orm";

type NotificationType = (typeof schema.notificationTypeEnum.enumValues)[number];

export async function createNotification(data: {
  userId: string;
  type: NotificationType;
  title: string;
  message?: string;
  link?: string;
  metadata?: Record<string, unknown>;
}) {
  const [notification] = await db
    .insert(schema.notifications)
    .values({
      userId: data.userId,
      type: data.type,
      title: data.title,
      message: data.message ?? null,
      link: data.link ?? null,
      metadata: data.metadata ?? null,
    })
    .returning();

  return notification;
}

/**
 * Create a notification for all admin users.
 * Pass an array of admin Clerk user IDs.
 */
export async function createNotificationForAdmins(
  adminUserIds: string[],
  data: {
    type: NotificationType;
    title: string;
    message?: string;
    link?: string;
    metadata?: Record<string, unknown>;
  }
) {
  if (adminUserIds.length === 0) return [];

  const values = adminUserIds.map((userId) => ({
    userId,
    type: data.type,
    title: data.title,
    message: data.message ?? null,
    link: data.link ?? null,
    metadata: data.metadata ?? null,
  }));

  return db.insert(schema.notifications).values(values).returning();
}

export async function getNotifications(
  userId: string,
  options?: {
    unreadOnly?: boolean;
    limit?: number;
    offset?: number;
  }
) {
  const conditions = [eq(schema.notifications.userId, userId)];

  if (options?.unreadOnly) {
    conditions.push(eq(schema.notifications.isRead, false));
  }

  return db
    .select()
    .from(schema.notifications)
    .where(and(...conditions))
    .orderBy(desc(schema.notifications.createdAt))
    .limit(options?.limit ?? 50)
    .offset(options?.offset ?? 0);
}

export async function getUnreadCount(userId: string): Promise<number> {
  const [result] = await db
    .select({ count: count() })
    .from(schema.notifications)
    .where(
      and(
        eq(schema.notifications.userId, userId),
        eq(schema.notifications.isRead, false)
      )
    );
  return result?.count ?? 0;
}

export async function markAsRead(id: string, userId: string) {
  const [notification] = await db
    .update(schema.notifications)
    .set({ isRead: true, readAt: new Date() })
    .where(
      and(
        eq(schema.notifications.id, id),
        eq(schema.notifications.userId, userId)
      )
    )
    .returning();

  return notification ?? null;
}

export async function markAllAsRead(userId: string) {
  const result = await db
    .update(schema.notifications)
    .set({ isRead: true, readAt: new Date() })
    .where(
      and(
        eq(schema.notifications.userId, userId),
        eq(schema.notifications.isRead, false)
      )
    )
    .returning();

  return result.length;
}

export async function deleteNotification(id: string, userId: string) {
  const [notification] = await db
    .delete(schema.notifications)
    .where(
      and(
        eq(schema.notifications.id, id),
        eq(schema.notifications.userId, userId)
      )
    )
    .returning();

  return notification ?? null;
}

export async function deleteNotifications(ids: string[], userId: string) {
  return db
    .delete(schema.notifications)
    .where(
      and(
        inArray(schema.notifications.id, ids),
        eq(schema.notifications.userId, userId)
      )
    )
    .returning();
}

/**
 * Convenience: create a notification for all configured super-admin users.
 * Reads SUPER_ADMIN_USER_IDS from environment (same source as auth).
 */
export async function notifyAdmins(data: {
  type: NotificationType;
  title: string;
  message?: string;
  link?: string;
  metadata?: Record<string, unknown>;
}) {
  const adminIds = (
    process.env.SUPER_ADMIN_USER_IDS || "user_2vqM8MZ1z7MxvJRLjJolHJAGnXp"
  )
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  return createNotificationForAdmins(adminIds, data);
}
