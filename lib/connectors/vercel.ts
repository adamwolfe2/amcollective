/**
 * AM Collective — Vercel Connector (READ-ONLY)
 *
 * Pulls project data, deployments, and usage from the Vercel REST API.
 * VERCEL_API_TOKEN and VERCEL_TEAM_ID must be set in env.
 */

import { cached, safeCall, type ConnectorResult } from "./base";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface VercelProject {
  id: string;
  name: string;
  framework: string | null;
  latestDeployments?: VercelDeployment[];
  updatedAt: number;
  createdAt: number;
}

export interface VercelDeployment {
  uid: string;
  name: string;
  url: string;
  state: "BUILDING" | "ERROR" | "INITIALIZING" | "QUEUED" | "READY" | "CANCELED";
  created: number;
  meta?: { githubCommitMessage?: string; githubCommitRef?: string };
}

export interface VercelUsage {
  period: { start: string; end: string };
  functionInvocations: number;
  bandwidthBytes: number;
  buildMinutes: number;
}

// ─── Internals ───────────────────────────────────────────────────────────────

const VERCEL_API = "https://api.vercel.com";

function getHeaders(): HeadersInit {
  const token = process.env.VERCEL_API_TOKEN;
  if (!token) throw new Error("VERCEL_API_TOKEN is not set");
  return {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };
}

function teamParam(): string {
  const teamId = process.env.VERCEL_TEAM_ID;
  return teamId ? `teamId=${teamId}` : "";
}

async function vercelFetch<T>(path: string): Promise<T> {
  const sep = path.includes("?") ? "&" : "?";
  const url = `${VERCEL_API}${path}${sep}${teamParam()}`;
  const res = await fetch(url, { headers: getHeaders() });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Vercel API ${res.status}: ${body.slice(0, 200)}`);
  }
  return res.json() as Promise<T>;
}

// ─── Public API ──────────────────────────────────────────────────────────────

export async function getProjects(): Promise<ConnectorResult<VercelProject[]>> {
  return safeCall(() =>
    cached("vercel:projects", async () => {
      const res = await vercelFetch<{ projects: VercelProject[] }>(
        "/v9/projects?limit=50"
      );
      return res.projects;
    })
  );
}

export async function getProject(
  projectId: string
): Promise<ConnectorResult<VercelProject>> {
  return safeCall(() =>
    cached(`vercel:project:${projectId}`, () =>
      vercelFetch<VercelProject>(`/v9/projects/${projectId}`)
    )
  );
}

export async function getDeployments(
  projectId: string,
  limit = 10
): Promise<ConnectorResult<VercelDeployment[]>> {
  return safeCall(() =>
    cached(`vercel:deploys:${projectId}:${limit}`, async () => {
      const res = await vercelFetch<{ deployments: VercelDeployment[] }>(
        `/v6/deployments?projectId=${projectId}&limit=${limit}`
      );
      return res.deployments;
    })
  );
}

export async function getUsage(): Promise<ConnectorResult<VercelUsage>> {
  return safeCall(() =>
    cached(
      "vercel:usage",
      async () => {
        // Use the billing usage endpoint for the current period
        const now = new Date();
        const start = new Date(now.getFullYear(), now.getMonth(), 1);
        const res = await vercelFetch<VercelUsage>(
          `/v1/usage?from=${start.toISOString()}&to=${now.toISOString()}`
        );
        return res;
      },
      10 * 60 * 1000 // 10 min cache for usage
    )
  );
}

/**
 * Get all deployments across all projects (for the dashboard deploy feed).
 * Returns the most recent `limit` deployments.
 */
export async function getRecentDeployments(
  limit = 10
): Promise<ConnectorResult<VercelDeployment[]>> {
  return safeCall(() =>
    cached(`vercel:recent-deploys:${limit}`, async () => {
      const res = await vercelFetch<{ deployments: VercelDeployment[] }>(
        `/v6/deployments?limit=${limit}`
      );
      return res.deployments;
    })
  );
}
