/**
 * Bloo.io Messaging API v2 Integration
 *
 * Sole iMessage/SMS/RCS provider for TBGC.
 * API Docs: https://backend.blooio.com/v2/api/openapi.json
 * Dashboard: https://blooio.com
 *
 * Auth: Bearer token (BLOOIO_API_KEY env var)
 * Phone number: BLOOIO_FROM_NUMBER (+17143170561)
 * Webhooks: HMAC-SHA256 signed (BLOOIO_WEBHOOK_SECRET)
 *
 * Setup:
 * 1. Set BLOOIO_API_KEY, BLOOIO_FROM_NUMBER in .env.local
 * 2. Deploy /api/webhooks/blooio
 * 3. Create webhook at blooio.com dashboard → save the signing secret as BLOOIO_WEBHOOK_SECRET
 */

import crypto from "crypto";

const BLOOIO_BASE = "https://backend.blooio.com/v2/api";

// ============================================================
// Config
// ============================================================

export function isConfigured(): boolean {
  return !!(process.env.BLOOIO_API_KEY && process.env.BLOOIO_FROM_NUMBER);
}

function getApiKey(): string {
  const key = process.env.BLOOIO_API_KEY;
  if (!key) throw new Error("Bloo.io not configured. Set BLOOIO_API_KEY.");
  return key;
}

// ============================================================
// Phone normalization — convert any US number to E.164
// Returns null if the number can't be normalized
// ============================================================

export function toE164(phone: string): string | null {
  const digits = phone.replace(/\D/g, '')
  if (digits.length === 10) return `+1${digits}`
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`
  return null
}

// ============================================================
// Core HTTP client
// ============================================================

async function blooFetch(path: string, options: RequestInit = {}): Promise<Response> {
  return fetch(`${BLOOIO_BASE}${path}`, {
    ...options,
    headers: {
      "Authorization": `Bearer ${getApiKey()}`,
      "Content-Type": "application/json",
      ...(options.headers as Record<string, string> || {}),
    },
  });
}

// ============================================================
// Send a message
//
// Matches the existing sendMessage({ to, message }) interface
// so all callers work without changes.
// ============================================================

export interface SendMessageInput {
  to: string;     // E.164 phone number e.g. +15551234567
  message: string;
  attachments?: string[];  // Optional media URLs
}

export interface SendMessageResult {
  success: boolean;
  chatId?: string;      // URL-encoded phone number — use as chatId for follow-ups
  messageId?: string;
  error?: string;
}

export async function sendMessage(input: SendMessageInput): Promise<SendMessageResult> {
  const { to, message, attachments } = input;

  const chatId = encodeURIComponent(to);
  const idempotencyKey = crypto.randomUUID();

  try {
    const res = await blooFetch(`/chats/${chatId}/messages`, {
      method: "POST",
      headers: {
        "Idempotency-Key": idempotencyKey,
      },
      body: JSON.stringify({
        text: message,
        attachments: attachments ?? [],
      }),
    });

    if (res.status === 202 || res.status === 200 || res.status === 201) {
      const data = await res.json();
      return {
        success: true,
        chatId,
        messageId: data.message_id,
      };
    }

    const err = await res.json().catch(() => ({}));
    return {
      success: false,
      chatId,
      error: err.message ?? `HTTP ${res.status}`,
    };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Unknown error",
    };
  }
}

// ============================================================
// Get message delivery status
// ============================================================

export async function getMessageStatus(
  toPhone: string,
  messageId: string
): Promise<{ status: string; protocol?: string } | null> {
  const chatId = encodeURIComponent(toPhone);
  try {
    const res = await blooFetch(`/chats/${chatId}/messages/${messageId}/status`);
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

// ============================================================
// Webhook signature verification
// ============================================================

export function verifyWebhookSignature(
  rawBody: string,
  signature: string,
  secret: string
): boolean {
  try {
    const expected = crypto
      .createHmac("sha256", secret)
      .update(rawBody)
      .digest("hex");
    return crypto.timingSafeEqual(
      Buffer.from(signature, "utf8"),
      Buffer.from(expected, "utf8")
    );
  } catch {
    return false;
  }
}

// ============================================================
// TBGC message templates
// ============================================================

export function orderConfirmationMessage(orderNumber: string, businessName: string): string {
  return `Hi ${businessName} — your TBGC order #${orderNumber} has been confirmed. We'll be in touch shortly with delivery details. Questions? Reply here.`;
}

export function orderShippedMessage(orderNumber: string, businessName: string): string {
  return `${businessName} — TBGC order #${orderNumber} is on its way. Expect delivery within your confirmed window. Reply here if you need anything.`;
}

export function orderDeliveredMessage(orderNumber: string, businessName: string): string {
  return `${businessName} — TBGC order #${orderNumber} has been delivered. Enjoy! Reply here if anything is missing or needs attention.`;
}

export function invoiceReminderMessage(
  invoiceNumber: string,
  amount: string,
  dueDate: string
): string {
  const siteUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://truffleboys.com'
  return `TBGC Invoice #${invoiceNumber} for $${amount} is due on ${dueDate}. Log in at ${siteUrl} to pay or view details. Questions? Reply here.`;
}

export function welcomePartnerMessage(businessName: string, contactName: string | null): string {
  const name = contactName ?? businessName;
  const siteUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://truffleboys.com'
  return `Welcome to TBGC, ${name}! Your wholesale account is ready. Browse our full catalog at ${siteUrl}. Your account rep will reach out shortly. — The TBGC Team`;
}
