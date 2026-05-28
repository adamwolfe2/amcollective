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
//
// Three supported env var shapes, in priority order:
//
//   1. EMAILBISON_WORKSPACES  — JSON array of {name, base_url, api_key} objects.
//                               The canonical format used in Vercel env vars.
//                               Each workspace may have its own base_url.
//
//   2. EMAILBISON_API_KEYS    — comma-separated "name:key,name:key" pairs.
//                               Legacy multi-workspace shape — uses the global
//                               EMAILBISON_BASE_URL for every workspace.
//
//   3. EMAILBISON_API_KEY     — single workspace fallback. Workspace name
//                               defaults to "default".

export interface WorkspaceCredential {
  workspace: string;
  apiKey: string;
  /** Per-workspace base URL — falls back to EMAILBISON_BASE_URL if absent */
  baseUrl?: string;
  /** Original display name (e.g. "Adam's Team") before slugification */
  displayName?: string;
}

/**
 * Slugify a workspace display name so it's safe as an identifier, URL segment,
 * filesystem path, and table column value.
 *   "Adam's Team"        → "adams_team"
 *   "Pitch&Co"           → "pitch_co"
 *   "Superhero Mentors"  → "superhero_mentors"
 *   "Task Space"         → "task_space"
 */
function slugifyWorkspace(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

export function getWorkspaceKeys(): WorkspaceCredential[] {
  // 1. JSON workspaces — preferred shape
  const json = process.env.EMAILBISON_WORKSPACES;
  if (json) {
    try {
      const parsed = JSON.parse(json) as Array<{
        name?: string;
        base_url?: string;
        api_key?: string;
      }>;
      if (Array.isArray(parsed)) {
        return parsed
          .filter((w) => w?.api_key && w?.name)
          .map((w) => ({
            workspace: slugifyWorkspace(w.name!),
            apiKey: w.api_key!,
            baseUrl: w.base_url,
            displayName: w.name!,
          }));
      }
    } catch {
      // fall through to legacy formats — never throw at boot
    }
  }

  // 2. Legacy comma-separated "ws:key,ws:key"
  const multi = process.env.EMAILBISON_API_KEYS;
  if (multi) {
    return multi
      .split(",")
      .map((entry) => {
        const colonIdx = entry.indexOf(":");
        if (colonIdx === -1)
          return { workspace: "default", apiKey: entry.trim() };
        return {
          workspace: entry.slice(0, colonIdx).trim(),
          apiKey: entry.slice(colonIdx + 1).trim(),
        };
      })
      .filter((e) => e.apiKey.length > 0);
  }

  // 3. Single key fallback
  const single = process.env.EMAILBISON_API_KEY;
  if (single) return [{ workspace: "default", apiKey: single }];
  return [];
}

/** Resolve the base URL for a workspace, falling back to the global default. */
export function getWorkspaceBaseUrl(workspace?: string): string | undefined {
  if (workspace) {
    const match = getWorkspaceKeys().find((k) => k.workspace === workspace);
    if (match?.baseUrl) return match.baseUrl;
  }
  return process.env.EMAILBISON_BASE_URL;
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

async function fetchCampaignsWithKey(
  apiKey: string,
  baseUrlOverride?: string
): Promise<EmailBisonCampaign[]> {
  const baseUrl = baseUrlOverride ?? process.env.EMAILBISON_BASE_URL;
  if (!baseUrl) throw new Error("EMAILBISON_BASE_URL not set");
  const res = await fetch(`${baseUrl}/api/campaigns?per_page=200`, {
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
    keys.map(async ({ workspace, apiKey, baseUrl }) => {
      const campaigns = await fetchCampaignsWithKey(apiKey, baseUrl);
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

// ─── Campaign Authoring & Editing ────────────────────────────────────────────
// These functions are how Bison creates new campaigns and deploys challenger
// variants. They mirror the API calls the upload-*-campaign.ts scripts make.

export interface CreateCampaignParams {
  name: string;
  /** Per-workspace API key override (multi-workspace mode) */
  apiKey?: string;
}

export interface CreatedCampaign {
  id: number;
  name: string;
}

/**
 * Multi-workspace-aware fetch — uses provided apiKey or falls back to default.
 */
async function bisonFetchWithKey<T>(
  apiKey: string,
  path: string,
  init: RequestInit = {},
  baseUrlOverride?: string
): Promise<T> {
  const baseUrl = baseUrlOverride ?? BASE_URL_GUARD;
  if (!baseUrl) {
    throw new Error("EMAILBISON_BASE_URL not set");
  }
  const res = await fetch(`${baseUrl}/api${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      Accept: "application/json",
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      ...(init.headers ?? {}),
    },
    next: { revalidate: 0 },
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`EmailBison ${res.status}: ${init.method ?? "GET"} ${path} — ${text}`);
  }
  return res.json() as Promise<T>;
}

const BASE_URL_GUARD = process.env.EMAILBISON_BASE_URL;

function resolveKey(workspace?: string, apiKeyOverride?: string): string {
  if (apiKeyOverride) return apiKeyOverride;
  if (workspace) {
    const match = getWorkspaceKeys().find((k) => k.workspace === workspace);
    if (match) return match.apiKey;
  }
  const fallback = process.env.EMAILBISON_API_KEY;
  if (!fallback) throw new Error("No EmailBison API key available");
  return fallback;
}

/** Resolve {apiKey, baseUrl} together so per-workspace base URLs are honored. */
function resolveCredentials(
  workspace?: string,
  apiKeyOverride?: string
): { apiKey: string; baseUrl?: string } {
  if (apiKeyOverride) return { apiKey: apiKeyOverride };
  if (workspace) {
    const match = getWorkspaceKeys().find((k) => k.workspace === workspace);
    if (match) return { apiKey: match.apiKey, baseUrl: match.baseUrl };
  }
  const fallback = process.env.EMAILBISON_API_KEY;
  if (!fallback) throw new Error("No EmailBison API key available");
  return { apiKey: fallback };
}

export async function createCampaign(
  params: CreateCampaignParams & { workspace?: string }
): Promise<CreatedCampaign> {
  const { apiKey, baseUrl } = resolveCredentials(params.workspace, params.apiKey);
  const res = await bisonFetchWithKey<{ data: CreatedCampaign }>(
    apiKey,
    "/campaigns",
    {
      method: "POST",
      body: JSON.stringify({ name: params.name }),
    },
    baseUrl
  );
  return res.data;
}

export async function pauseCampaign(
  campaignId: number,
  opts: { workspace?: string; apiKey?: string } = {}
): Promise<void> {
  const { apiKey, baseUrl } = resolveCredentials(opts.workspace, opts.apiKey);
  await bisonFetchWithKey<unknown>(
    apiKey,
    `/campaigns/${campaignId}/pause`,
    { method: "POST", body: JSON.stringify({}) },
    baseUrl
  );
}

export async function resumeCampaign(
  campaignId: number,
  opts: { workspace?: string; apiKey?: string } = {}
): Promise<void> {
  const { apiKey, baseUrl } = resolveCredentials(opts.workspace, opts.apiKey);
  await bisonFetchWithKey<unknown>(
    apiKey,
    `/campaigns/${campaignId}/resume`,
    { method: "POST", body: JSON.stringify({}) },
    baseUrl
  );
}

export async function archiveCampaign(
  campaignId: number,
  opts: { workspace?: string; apiKey?: string } = {}
): Promise<void> {
  const { apiKey, baseUrl } = resolveCredentials(opts.workspace, opts.apiKey);
  await bisonFetchWithKey<unknown>(
    apiKey,
    `/campaigns/${campaignId}/archive`,
    { method: "POST", body: JSON.stringify({}) },
    baseUrl
  );
}

// ─── Sequence Steps (the core of campaign editing) ──────────────────────────

export interface SequenceStepInput {
  email_subject: string;
  email_body: string;
  wait_in_days?: number;
  /** When true, this step is a variant of the previous step in the same group */
  variant?: boolean;
  /** Index of the step (within the sequence-step group) this variant tests against */
  variant_from_step?: number;
  /** When true, the email replies in the existing thread (follow-ups) */
  thread_reply?: boolean;
}

export interface SequenceStepOutput {
  id: number;
  email_subject: string;
  email_body: string;
  variant?: boolean;
  variant_from_step?: number | null;
  wait_in_days?: number;
  emails_sent?: number;
  opened?: number;
  replied?: number;
}

export interface AddSequenceStepGroupParams {
  campaignId: number;
  title: string;
  steps: SequenceStepInput[];
  workspace?: string;
  apiKey?: string;
}

/**
 * Append a new sequence-step group (with 1-N variants) to an existing campaign.
 * This is the canonical way Bison deploys a challenger.
 */
export async function addSequenceStepGroup(
  params: AddSequenceStepGroupParams
): Promise<SequenceStepOutput[]> {
  const { apiKey, baseUrl } = resolveCredentials(params.workspace, params.apiKey);
  const res = await bisonFetchWithKey<{
    data: { id: number; sequence_steps: SequenceStepOutput[] };
  }>(
    apiKey,
    `/campaigns/${params.campaignId}/sequence-steps`,
    {
      method: "POST",
      body: JSON.stringify({
        title: params.title,
        sequence_steps: params.steps,
      }),
    },
    baseUrl
  );
  return res.data?.sequence_steps ?? [];
}

/**
 * Update an existing sequence step in place (rename, swap subject/body, etc.)
 */
export interface UpdateSequenceStepParams {
  campaignId: number;
  stepId: number;
  patch: Partial<SequenceStepInput>;
  workspace?: string;
  apiKey?: string;
}

export async function updateSequenceStep(
  params: UpdateSequenceStepParams
): Promise<SequenceStepOutput> {
  const { apiKey, baseUrl } = resolveCredentials(params.workspace, params.apiKey);
  const res = await bisonFetchWithKey<{ data: SequenceStepOutput }>(
    apiKey,
    `/campaigns/${params.campaignId}/sequence-steps/${params.stepId}`,
    {
      method: "PUT",
      body: JSON.stringify(params.patch),
    },
    baseUrl
  );
  return res.data;
}

export interface ListSequenceStepsResp {
  data: Array<{
    id: number;
    title: string;
    sequence_steps: SequenceStepOutput[];
  }>;
}

export async function listSequenceSteps(
  campaignId: number,
  opts: { workspace?: string; apiKey?: string } = {}
): Promise<ListSequenceStepsResp["data"]> {
  const { apiKey, baseUrl } = resolveCredentials(opts.workspace, opts.apiKey);
  const res = await bisonFetchWithKey<ListSequenceStepsResp>(
    apiKey,
    `/campaigns/${campaignId}/sequence-steps`,
    {},
    baseUrl
  );
  return res.data ?? [];
}

// ─── Sender Account Attachment ───────────────────────────────────────────────

export async function attachSenderToCampaign(
  campaignId: number,
  senderEmailId: number,
  opts: { workspace?: string; apiKey?: string } = {}
): Promise<void> {
  const { apiKey, baseUrl } = resolveCredentials(opts.workspace, opts.apiKey);
  await bisonFetchWithKey<unknown>(
    apiKey,
    `/campaigns/${campaignId}/sender-emails`,
    {
      method: "POST",
      body: JSON.stringify({ sender_email_id: senderEmailId }),
    },
    baseUrl
  );
}

// ─── Spintax / Token Validation ──────────────────────────────────────────────
// EmailBison supports two interpolation patterns in subject + body:
//   1. Spintax randomization:   "{a|b|c}" — one of a/b/c is chosen at send time
//   2. Token with fallback:     "{TOKEN_NAME|fallback text}" — replaced per-lead
// These look identical syntactically; the distinguishing rule is that a TOKEN
// always starts with [A-Z_] and has no nested braces.
//
// We validate that:
//   - Every `{` has a matching `}`
//   - Spintax groups have at least 2 alternatives
//   - Tokens reference fields that exist on the lead schema we know about
//   - Bison rewrites preserve every original token (no silent drops)

export interface SpintaxValidationIssue {
  kind: "unbalanced_brace" | "empty_alt" | "single_alt" | "unknown_token" | "dropped_token";
  message: string;
  /** Token or fragment that triggered the issue */
  fragment?: string;
}

export interface SpintaxValidationResult {
  ok: boolean;
  issues: SpintaxValidationIssue[];
  tokensFound: string[];
  spintaxGroupsFound: number;
}

const KNOWN_TOKENS = new Set([
  "FIRST_NAME",
  "LAST_NAME",
  "FULL_NAME",
  "EMAIL",
  "COMPANY",
  "first_name",
  "last_name",
  "company_name",
  "job_title",
  "department",
  "industry",
  "cert_standard",
  "cert_focus",
  "painPoint",
  "school",
]);

/**
 * Validate that a subject or body string parses as valid spintax + tokens.
 * Also accepts an `originalTokens` array — useful when checking that a
 * challenger rewrite preserved every token from the baseline.
 */
export function validateSpintax(
  text: string,
  opts: { originalTokens?: string[] } = {}
): SpintaxValidationResult {
  const issues: SpintaxValidationIssue[] = [];
  const tokensFound: string[] = [];
  let spintaxGroupsFound = 0;

  // 1. Balanced braces check
  let depth = 0;
  for (const ch of text) {
    if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth < 0) {
        issues.push({ kind: "unbalanced_brace", message: "Closing brace with no opener" });
        break;
      }
    }
  }
  if (depth > 0)
    issues.push({ kind: "unbalanced_brace", message: `${depth} unclosed brace(s)` });

  // 2. Walk top-level groups
  const groupRegex = /\{([^{}]+)\}/g;
  let m: RegExpExecArray | null;
  while ((m = groupRegex.exec(text)) !== null) {
    const inner = m[1];
    const alts = inner.split("|");
    const first = alts[0]?.trim() ?? "";
    const isToken = /^[A-Z][A-Z0-9_]*$/.test(first) || /^[a-z][a-z0-9_]*$/.test(first);
    if (alts.length === 1 && isToken) {
      // Bare token with no fallback — allowed
      tokensFound.push(first);
      if (!KNOWN_TOKENS.has(first)) {
        issues.push({
          kind: "unknown_token",
          message: `Token "${first}" isn't in the known token set — verify the lead CSV provides it`,
          fragment: first,
        });
      }
    } else if (alts.length === 2 && isToken) {
      // Token with fallback
      tokensFound.push(first);
      if (!KNOWN_TOKENS.has(first)) {
        issues.push({
          kind: "unknown_token",
          message: `Token "${first}" with fallback isn't in the known token set`,
          fragment: first,
        });
      }
      if (!alts[1].trim()) {
        issues.push({ kind: "empty_alt", message: `Token "${first}" has empty fallback`, fragment: first });
      }
    } else {
      // Spintax group
      spintaxGroupsFound++;
      if (alts.length < 2) {
        issues.push({ kind: "single_alt", message: `Spintax group has only 1 alternative: ${inner}`, fragment: inner });
      }
      for (const a of alts) {
        if (!a.trim()) {
          issues.push({ kind: "empty_alt", message: `Spintax group has empty alternative: ${inner}`, fragment: inner });
        }
      }
    }
  }

  // 3. Check token preservation (Bison's #1 risk when rewriting)
  if (opts.originalTokens?.length) {
    for (const orig of opts.originalTokens) {
      if (!tokensFound.includes(orig)) {
        issues.push({
          kind: "dropped_token",
          message: `Original token "${orig}" was dropped in the rewrite`,
          fragment: orig,
        });
      }
    }
  }

  return {
    ok: issues.length === 0,
    issues,
    tokensFound,
    spintaxGroupsFound,
  };
}

/**
 * Extract every token from a piece of text — useful for capturing baseline
 * tokens before passing them to validateSpintax(originalTokens: ...).
 */
export function extractTokens(text: string): string[] {
  const tokens: string[] = [];
  const groupRegex = /\{([^{}]+)\}/g;
  let m: RegExpExecArray | null;
  while ((m = groupRegex.exec(text)) !== null) {
    const inner = m[1];
    const alts = inner.split("|");
    const first = alts[0]?.trim() ?? "";
    const isToken = /^[A-Z][A-Z0-9_]*$/.test(first) || /^[a-z][a-z0-9_]*$/.test(first);
    if (isToken && alts.length <= 2) {
      tokens.push(first);
    }
  }
  return tokens;
}

// ─── Existing addLeadsToCampaign (preserved below) ───────────────────────────

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
