/**
 * AM Collective — Neon Connector (READ-ONLY)
 *
 * Pulls project and usage data from the Neon Management API.
 * Requires NEON_API_KEY env var (not currently set — connector will gracefully degrade).
 *
 * API docs: https://api-docs.neon.tech/reference/getting-started
 */

import { cached, safeCall, type ConnectorResult } from "./base";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface NeonProject {
  id: string;
  name: string;
  region_id: string;
  created_at: string;
  updated_at: string;
  pg_version: number;
}

export interface NeonProjectUsage {
  compute_time_seconds: number;
  data_storage_bytes: number;
  data_transfer_bytes: number;
  written_data_bytes: number;
}

// ─── Internals ───────────────────────────────────────────────────────────────

const NEON_API = "https://console.neon.tech/api/v2";

function isConfigured(): boolean {
  return !!process.env.NEON_API_KEY;
}

function getHeaders(): HeadersInit {
  const key = process.env.NEON_API_KEY;
  if (!key) throw new Error("NEON_API_KEY is not set");
  return {
    Authorization: `Bearer ${key}`,
    Accept: "application/json",
  };
}

async function neonFetch<T>(path: string): Promise<T> {
  const res = await fetch(`${NEON_API}${path}`, { headers: getHeaders() });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Neon API ${res.status}: ${body.slice(0, 200)}`);
  }
  return res.json() as Promise<T>;
}

// ─── Public API ──────────────────────────────────────────────────────────────

export async function getProjects(): Promise<ConnectorResult<NeonProject[]>> {
  if (!isConfigured()) {
    return { success: false, error: "NEON_API_KEY not set", fetchedAt: new Date() };
  }
  return safeCall(() =>
    cached("neon:projects", async () => {
      const res = await neonFetch<{ projects: NeonProject[] }>("/projects");
      return res.projects;
    })
  );
}

export async function getProjectUsage(
  projectId: string
): Promise<ConnectorResult<NeonProjectUsage>> {
  if (!isConfigured()) {
    return { success: false, error: "NEON_API_KEY not set", fetchedAt: new Date() };
  }
  return safeCall(() =>
    cached(
      `neon:usage:${projectId}`,
      async () => {
        // Neon consumption endpoint for the current billing period
        const now = new Date();
        const start = new Date(now.getFullYear(), now.getMonth(), 1);
        const res = await neonFetch<NeonProjectUsage>(
          `/projects/${projectId}/consumption?from=${start.toISOString()}&to=${now.toISOString()}`
        );
        return res;
      },
      10 * 60
    )
  );
}

export async function getDatabaseSize(
  projectId: string
): Promise<ConnectorResult<{ sizeBytes: number; sizeMB: number }>> {
  if (!isConfigured()) {
    return { success: false, error: "NEON_API_KEY not set", fetchedAt: new Date() };
  }
  return safeCall(() =>
    cached(`neon:dbsize:${projectId}`, async () => {
      const res = await neonFetch<{ branches: Array<{ logical_size: number }> }>(
        `/projects/${projectId}/branches`
      );
      const totalBytes = res.branches.reduce(
        (sum, b) => sum + (b.logical_size ?? 0),
        0
      );
      return {
        sizeBytes: totalBytes,
        sizeMB: Math.round((totalBytes / (1024 * 1024)) * 100) / 100,
      };
    })
  );
}
