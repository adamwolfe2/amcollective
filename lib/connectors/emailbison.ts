/**
 * EmailBison Connector
 *
 * Read-only snapshot of campaign performance, sender health, and reply metrics.
 * Used by: dashboard cards, strategy engine, Inngest sync job.
 *
 * Auth: EMAILBISON_API_KEY + EMAILBISON_BASE_URL from env
 */

import { safeCall, cached, type ConnectorResult } from "./base";

const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

function getAuth() {
  const apiKey = process.env.EMAILBISON_API_KEY;
  const baseUrl = process.env.EMAILBISON_BASE_URL;
  if (!apiKey || !baseUrl) throw new Error("EmailBison env vars not configured");
  return { apiKey, baseUrl };
}

export function isConfigured() {
  return !!(process.env.EMAILBISON_API_KEY && process.env.EMAILBISON_BASE_URL);
}

async function bisonFetch<T>(path: string): Promise<T> {
  const { apiKey, baseUrl } = getAuth();
  const res = await fetch(`${baseUrl}/api${path}`, {
    headers: {
      Authorization: `Bearer ${apiKey}`,
      Accept: "application/json",
    },
    next: { revalidate: 0 },
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`EmailBison API ${res.status}: ${path}`);
  return res.json() as Promise<T>;
}

async function bisonPost<T>(path: string, body: Record<string, unknown>): Promise<T> {
  const { apiKey, baseUrl } = getAuth();
  const res = await fetch(`${baseUrl}/api${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
    next: { revalidate: 0 },
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`EmailBison API ${res.status}: POST ${path}`);
  return res.json() as Promise<T>;
}

// ─── Types ────────────────────────────────────────────────────────────────────

export interface EmailBisonCampaign {
  id: number;
  name: string;
  status: string;
  emails_sent: number;
  opened: number;
  unique_opens: number;
  replied: number;
  unique_replies: number;
  bounced: number;
  unsubscribed: number;
  interested: number;
  total_leads_contacted: number;
  total_leads: number;
  max_emails_per_day: number;
  created_at: string;
  updated_at: string;
  tags: Array<{ id: number; name: string }>;
}

export interface EmailBisonSenderAccount {
  id: number;
  name: string;
  email: string;
  status: string; // "Connected" | "Disconnected"
  daily_limit: number;
  warmup_enabled: boolean;
  emails_sent_count: number;
  total_replied_count: number;
  bounced_count: number;
  type: string;
}

export interface EmailBisonSnapshot {
  campaigns: EmailBisonCampaign[];
  senderAccounts: EmailBisonSenderAccount[];
  workspaceStats: {
    emails_sent: number;
    total_leads_contacted: number;
    opened: number;
    opened_percentage: number;
    unique_replies_per_contact_percentage: number;
    bounced: number;
    bounced_percentage: number;
    unsubscribed: number;
    interested: number;
    interested_percentage: number;
  };
  // Derived
  activeCampaigns: number;
  totalSent: number;
  openRatePct: number;
  replyRatePct: number;
  bounceRatePct: number;
  connectedSenders: number;
}

// ─── Fetchers ─────────────────────────────────────────────────────────────────

async function fetchCampaigns(): Promise<EmailBisonCampaign[]> {
  const data = await bisonFetch<{ data: EmailBisonCampaign[] }>("/campaigns");
  return data.data ?? [];
}

async function fetchSenderAccounts(): Promise<EmailBisonSenderAccount[]> {
  const data = await bisonFetch<{ data: EmailBisonSenderAccount[] }>("/sender-emails");
  return data.data ?? [];
}

async function fetchWorkspaceStats() {
  const data = await bisonFetch<{ data: EmailBisonSnapshot["workspaceStats"] }>("/workspaces/stats");
  return data.data;
}

// ─── Main Snapshot ─────────────────────────────────────────────────────────────

async function _getSnapshot() {
  const [campaigns, senderAccounts, workspaceStats] = await Promise.all([
    fetchCampaigns(),
    fetchSenderAccounts(),
    fetchWorkspaceStats(),
  ]);

  const activeCampaigns = campaigns.filter(
    (c) => c.status === "active" || c.status === "running"
  ).length;

  const totalSent = workspaceStats.emails_sent;
  const openRatePct = workspaceStats.opened_percentage;
  const replyRatePct = workspaceStats.unique_replies_per_contact_percentage;
  const bounceRatePct = workspaceStats.bounced_percentage;
  const connectedSenders = senderAccounts.filter(
    (a) => a.status === "Connected"
  ).length;

  return {
    campaigns,
    senderAccounts,
    workspaceStats,
    activeCampaigns,
    totalSent,
    openRatePct,
    replyRatePct,
    bounceRatePct,
    connectedSenders,
  };
}

export function getSnapshot(): Promise<ConnectorResult<EmailBisonSnapshot>> {
  return cached("emailbison:snapshot", () => safeCall(_getSnapshot), CACHE_TTL);
}

// ─── Campaign Sync (called by /api/outreach/sync) ────────────────────────────

export async function syncCampaigns(): Promise<{
  campaigns: EmailBisonCampaign[];
  senderAccounts: EmailBisonSenderAccount[];
}> {
  const [campaigns, senderAccounts] = await Promise.all([
    fetchCampaigns(),
    fetchSenderAccounts(),
  ]);
  return { campaigns, senderAccounts };
}

// ─── Inbox / Replies ──────────────────────────────────────────────────────────

export interface EmailBisonReply {
  id: number;
  campaign_id?: number | null;
  campaign_name?: string | null;
  lead_email: string;
  lead_name?: string | null;
  sender_email?: string | null;
  subject?: string | null;
  body?: string | null;
  is_read: boolean;
  is_interested: boolean;
  received_at?: string | null;
  created_at: string;
}

export interface EmailBisonInboxParams {
  page?: number;
  perPage?: number;
  unreadOnly?: boolean;
}

export async function listReplies(params: EmailBisonInboxParams = {}): Promise<EmailBisonReply[]> {
  const qs = new URLSearchParams();
  qs.set("per_page", String(params.perPage ?? 100));
  if (params.page && params.page > 1) qs.set("page", String(params.page));
  if (params.unreadOnly) qs.set("status", "unread");
  const data = await bisonFetch<{ data: EmailBisonReply[] }>(`/unibox?${qs.toString()}`);
  return data.data ?? [];
}

export async function markReplyRead(replyId: number): Promise<void> {
  await bisonPost(`/unibox/${replyId}/mark-read`, {});
}

export async function markReplyInterested(replyId: number): Promise<void> {
  await bisonPost(`/unibox/${replyId}/interested`, {});
}
