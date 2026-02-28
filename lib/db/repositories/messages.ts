/**
 * Messages Repository — Unified inbox across email, SMS, internal
 *
 * Adapted from existing operations.ts schema (messages table already defined).
 */

import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { eq, desc, and, count, sql } from "drizzle-orm";
import { createAuditLog } from "./audit";

export async function getMessages(filters?: {
  channel?: string;
  clientId?: string;
  isRead?: boolean;
  limit?: number;
}) {
  const conditions = [];
  if (filters?.channel) {
    conditions.push(
      eq(schema.messages.channel, filters.channel as "email" | "sms" | "blooio" | "slack" | "gmail")
    );
  }
  if (filters?.clientId) {
    conditions.push(eq(schema.messages.clientId, filters.clientId));
  }
  if (filters?.isRead !== undefined) {
    conditions.push(eq(schema.messages.isRead, filters.isRead));
  }

  return db
    .select({
      message: schema.messages,
      client: {
        id: schema.clients.id,
        name: schema.clients.name,
        companyName: schema.clients.companyName,
      },
    })
    .from(schema.messages)
    .leftJoin(schema.clients, eq(schema.messages.clientId, schema.clients.id))
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(schema.messages.createdAt))
    .limit(filters?.limit ?? 50);
}

export async function getMessageThreads() {
  // Group by threadId, return latest message per thread
  return db
    .select({
      threadId: schema.messages.threadId,
      channel: schema.messages.channel,
      subject: schema.messages.subject,
      lastMessage: sql<string>`(array_agg(${schema.messages.body} ORDER BY ${schema.messages.createdAt} DESC))[1]`.as("last_message"),
      lastAt: sql<Date>`MAX(${schema.messages.createdAt})`.as("last_at"),
      unreadCount: sql<number>`COUNT(*) FILTER (WHERE ${schema.messages.isRead} = false)`.as("unread_count"),
      messageCount: count(),
      clientId: schema.messages.clientId,
    })
    .from(schema.messages)
    .groupBy(
      schema.messages.threadId,
      schema.messages.channel,
      schema.messages.subject,
      schema.messages.clientId
    )
    .orderBy(desc(sql`MAX(${schema.messages.createdAt})`))
    .limit(50);
}

export async function getThread(threadId: string) {
  return db
    .select()
    .from(schema.messages)
    .where(eq(schema.messages.threadId, threadId))
    .orderBy(schema.messages.createdAt);
}

export async function getMessage(id: string) {
  const [msg] = await db
    .select()
    .from(schema.messages)
    .where(eq(schema.messages.id, id))
    .limit(1);
  return msg ?? null;
}

export async function createMessage(
  data: {
    threadId?: string;
    direction: "inbound" | "outbound";
    channel: "email" | "sms" | "blooio" | "slack" | "gmail";
    from: string;
    to: string;
    subject?: string;
    body?: string;
    clientId?: string;
    projectId?: string;
    metadata?: Record<string, unknown>;
  },
  actorId: string
) {
  const threadId = data.threadId ?? `thread_${Date.now()}`;
  const [msg] = await db
    .insert(schema.messages)
    .values({
      ...data,
      threadId,
      subject: data.subject ?? null,
      body: data.body ?? null,
      clientId: data.clientId ?? null,
      projectId: data.projectId ?? null,
      metadata: data.metadata ?? null,
    })
    .returning();

  await createAuditLog({
    actorId,
    actorType: "user",
    action: "send_message",
    entityType: "message",
    entityId: msg.id,
    metadata: { channel: data.channel, to: data.to },
  });

  return msg;
}

export async function markRead(id: string) {
  const [msg] = await db
    .update(schema.messages)
    .set({ isRead: true })
    .where(eq(schema.messages.id, id))
    .returning();
  return msg ?? null;
}

export async function markThreadRead(threadId: string) {
  await db
    .update(schema.messages)
    .set({ isRead: true })
    .where(eq(schema.messages.threadId, threadId));
}

export async function getUnreadCount() {
  const [result] = await db
    .select({ count: count() })
    .from(schema.messages)
    .where(eq(schema.messages.isRead, false));
  return result?.count ?? 0;
}

export async function getClientMessages(clientId: string) {
  return db
    .select()
    .from(schema.messages)
    .where(eq(schema.messages.clientId, clientId))
    .orderBy(desc(schema.messages.createdAt))
    .limit(50);
}
