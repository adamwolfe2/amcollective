/**
 * EmailBison Connector
 *
 * Read-only snapshot of campaign performance, sender health, and reply metrics.
 * Used by: dashboard cards, strategy engine, Inngest sync job.
 *
 * Auth:
 *   Single workspace:  EMAILBISON_API_KEY + EMAILBISON_BASE_URL
 *   Multi-workspace:   EMAILBISON_API_KEYS (comma-separated workspace:key pairs)
 *                      e.g. "cursive:9|abc...,trackr:8|def...,campusgtm:7|ghi..."
 */

import { safeCall, cached, type ConnectorResult } from "./base";

// cached() expects SECONDS. Was 5*60*1000 = 300_000 seconds = 3.5 days of stale cache.
// Real intent: 5 minutes = 300 seconds.
const CACHE_TTL = 5 * 60;

function getAuth() {
  const apiKey = process.env.EMAILBISON_API_KEY;
  const baseUrl = process.env.EMAILBISON_BASE_URL;
  if (!apiKey || !baseUrl) throw new Error("EmailBison env vars not configured");
  return { apiKey, baseUrl };
}

export function isConfigured() {
  return !!(
    (process.env.EMAILBISON_API_KEYS || process.env.EMAILBISON_API_KEY) &&
    process.env.EMAILBISON_BASE_URL
  );
}

// ─── Multi-workspace key management ──────────────────────────────────────────

export function getWorkspaceKeys(): Array<{ workspace: string; apiKey: string }> {
  const multi = process.env.EMAILBISON_API_KEYS;
  if (multi) {
    return multi
      .split(",")
      .map((entry) => {
        const colonIdx = entry.indexOf(":");
        if (colonIdx === -1) return { workspace: "default", apiKey: entry.trim() };
        return {
          workspace: entry.slice(0, colonIdx).trim(),
          apiKey: entry.slice(colonIdx + 1).trim(),
        };
      })
      .filter((e) => e.apiKey.length > 0);
  }
  // Fall back to single key
  const single = process.env.EMAILBISON_API_KEY;
  if (single) return [{ workspace: "default", apiKey: single }];
  return [];
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

// ─── Multi-workspace fetch helpers ───────────────────────────────────────────

async function fetchCampaignsWithKey(apiKey: string): Promise<EmailBisonCampaign[]> {
  const baseUrl = process.env.EMAILBISON_BASE_URL;
  if (!baseUrl) throw new Error("EMAILBISON_BASE_URL not set");
  const res = await fetch(`${baseUrl}/api/campaigns`, {
    headers: {
      Authorization: `Bearer ${apiKey}`,
      Accept: "application/json",
    },
    next: { revalidate: 0 },
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`EmailBison API ${res.status}`);
  const data = (await res.json()) as { data: EmailBisonCampaign[] };
  return data.data ?? [];
}

export async function syncAllWorkspaces(): Promise<{
  campaigns: Array<EmailBisonCampaign & { workspace: string }>;
  workspaceCount: number;
}> {
  const keys = getWorkspaceKeys();
  const results = await Promise.allSettled(
    keys.map(async ({ workspace, apiKey }) => {
      const campaigns = await fetchCampaignsWithKey(apiKey);
      return campaigns.map((c) => ({ ...c, workspace }));
    })
  );
  const campaigns = results
    .filter(
      (r): r is PromiseFulfilledResult<Array<EmailBisonCampaign & { workspace: string }>> =>
        r.status === "fulfilled"
    )
    .flatMap((r) => r.value);
  return { campaigns, workspaceCount: keys.length };
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

// ─── Send a Reply Through EmailBison ──────────────────────────────────────────
// Posts back into the unibox thread so the response goes from the same warmed
// inbox the original was sent from. This is the only safe way to keep deliverability —
// sending via Resend or Gmail breaks the thread.
//
// EmailBison's API surface for replies isn't fully documented; we try the
// canonical `/unibox/{id}/reply` endpoint and surface any error so the
// approver sees it in the draft UI.

export interface SendReplyParams {
  replyId: number;
  body: string;
  subject?: string;
}

export interface SendReplyResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

export async function sendReply(params: SendReplyParams): Promise<SendReplyResult> {
  const { replyId, body, subject } = params;
  try {
    const payload: Record<string, unknown> = { body };
    if (subject) payload.subject = subject;

    const res = await bisonPost<{
      data?: { id?: string | number; message_id?: string };
      id?: string | number;
      message_id?: string;
    }>(`/unibox/${replyId}/reply`, payload);

    const messageId =
      (res.data?.message_id ?? res.message_id ?? res.data?.id ?? res.id ?? null)?.toString() ??
      undefined;

    return { success: true, messageId };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

// ─── Lead Upload ─────────────────────────────────────────────────────────────

export interface EmailBisonLead {
  email: string;
  first_name?: string;
  last_name?: string;
  company?: string;
  custom_fields?: Record<string, string>;
}

export interface AddLeadsResult {
  added: number;
  duplicates: number;
  errors: string[];
}

export async function addLeadsToCampaign(
  campaignId: number,
  leads: EmailBisonLead[]
): Promise<AddLeadsResult> {
  const response = await bisonPost<{
    data?: {
      added?: number;
      duplicates?: number;
      errors?: string[];
    };
    added?: number;
    duplicates?: number;
    errors?: string[];
  }>(`/campaigns/${campaignId}/leads`, { leads });

  // EmailBison may nest under `data` or return top-level
  const payload = response.data ?? response;
  return {
    added: payload.added ?? 0,
    duplicates: payload.duplicates ?? 0,
    errors: payload.errors ?? [],
  };
}
