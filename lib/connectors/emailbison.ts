/**
 * AM Collective — EmailBison Connector
 *
 * READ-ONLY wrapper around the EmailBison API for fetching campaign data.
 * Base URL: https://dedi.emailbison.com
 * Auth: Bearer token
 */

import { cached, safeCall, type ConnectorResult } from "./base";

const BASE_URL = "https://dedi.emailbison.com";

function getApiKey(): string {
  const key = process.env.EMAILBISON_API_KEY;
  if (!key) throw new Error("EMAILBISON_API_KEY not configured");
  return key;
}

export function isConfigured(): boolean {
  return !!process.env.EMAILBISON_API_KEY;
}

async function apiFetch<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: {
      Authorization: `Bearer ${getApiKey()}`,
      Accept: "application/json",
    },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`EmailBison API ${path} returned ${res.status}: ${body}`);
  }
  return res.json();
}

// ─── Types ──────────────────────────────────────────────────────────────────

export interface Campaign {
  id: number;
  name: string;
  status: string;
  created_at: string;
  updated_at: string;
  [key: string]: unknown;
}

export interface CampaignStats {
  id: number;
  name: string;
  status: string;
  leads_count?: number;
  contacted?: number;
  opened?: number;
  replied?: number;
  interested?: number;
  bounced?: number;
  unsubscribed?: number;
}

export interface CampaignsResponse {
  campaigns: Campaign[];
  [key: string]: unknown;
}

// ─── API Functions ──────────────────────────────────────────────────────────

export async function getCampaigns(): Promise<ConnectorResult<Campaign[]>> {
  if (!isConfigured()) {
    return {
      success: false,
      error: "EmailBison not configured",
      fetchedAt: new Date(),
    };
  }
  return safeCall(() =>
    cached("emailbison:campaigns", async () => {
      const data = await apiFetch<CampaignsResponse | Campaign[]>(
        "/api/campaigns"
      );
      // API might return { campaigns: [...] } or just [...]
      if (Array.isArray(data)) return data;
      if ("campaigns" in data && Array.isArray(data.campaigns))
        return data.campaigns;
      return [];
    })
  );
}

export async function getCampaign(
  id: number
): Promise<ConnectorResult<Campaign>> {
  if (!isConfigured()) {
    return {
      success: false,
      error: "EmailBison not configured",
      fetchedAt: new Date(),
    };
  }
  return safeCall(() =>
    cached(`emailbison:campaign:${id}`, () =>
      apiFetch<Campaign>(`/api/campaigns/${id}`)
    )
  );
}

export async function getCampaignAnalytics(
  id: number
): Promise<ConnectorResult<Record<string, unknown>>> {
  if (!isConfigured()) {
    return {
      success: false,
      error: "EmailBison not configured",
      fetchedAt: new Date(),
    };
  }
  return safeCall(() =>
    cached(`emailbison:campaign:${id}:analytics`, () =>
      apiFetch<Record<string, unknown>>(`/api/campaigns/${id}/analytics`)
    )
  );
}
