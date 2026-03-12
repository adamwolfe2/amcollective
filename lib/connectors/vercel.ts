/**
 * AM Collective — Vercel Connector (READ-ONLY)
 *
 * Pulls project data, deployments, and usage from the Vercel REST API.
 * VERCEL_API_TOKEN and VERCEL_TEAM_ID must be set in env.
 */

import { cached, safeCall, invalidateCache, CACHE_TTL, type ConnectorResult } from "./base";

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

export interface VercelProjectDetail {
  id: string;
  name: string;
  framework: string | null;
  nodeVersion: string;
  buildCommand: string | null;
  outputDirectory: string | null;
  rootDirectory: string | null;
  updatedAt: number;
  createdAt: number;
}

export interface VercelDomain {
  name: string;
  verified: boolean;
  redirect: string | null;
  redirectStatusCode: number | null;
  gitBranch: string | null;
}

export interface VercelBuildLogEntry {
  type: string;
  created: number;
  text: string;
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
    }, CACHE_TTL.SLOW_MOVING)
  );
}

export async function getProject(
  projectId: string
): Promise<ConnectorResult<VercelProject>> {
  return safeCall(() =>
    cached(`vercel:project:${projectId}`, () =>
      vercelFetch<VercelProject>(`/v9/projects/${projectId}`),
      CACHE_TTL.SLOW_MOVING
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
      10 * 60 // 10 min cache for usage
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

/**
 * Get detailed project information including framework, node version, build settings.
 */
export async function getProjectDetail(
  projectId: string
): Promise<ConnectorResult<VercelProjectDetail>> {
  return safeCall(() =>
    cached(`vercel:project-detail:${projectId}`, () =>
      vercelFetch<VercelProjectDetail>(`/v13/projects/${projectId}`),
      CACHE_TTL.SLOW_MOVING
    )
  );
}

/**
 * Get domains for a project with verified status.
 */
export async function getProjectDomains(
  projectId: string
): Promise<ConnectorResult<VercelDomain[]>> {
  return safeCall(() =>
    cached(`vercel:domains:${projectId}`, async () => {
      const res = await vercelFetch<{ domains: VercelDomain[] }>(
        `/v9/projects/${projectId}/domains`
      );
      return res.domains;
    })
  );
}

/**
 * Get count of environment variables for a project (never exposes values).
 */
export async function getProjectEnvVarCount(
  projectId: string
): Promise<ConnectorResult<number>> {
  return safeCall(() =>
    cached(`vercel:env-count:${projectId}`, async () => {
      const res = await vercelFetch<{ envs: unknown[] }>(
        `/v9/projects/${projectId}/env`
      );
      return res.envs.length;
    })
  );
}

/**
 * Get build logs from a deployment (last 100 lines).
 */
export async function getBuildLogs(
  deploymentId: string
): Promise<ConnectorResult<VercelBuildLogEntry[]>> {
  return safeCall(() =>
    cached(`vercel:build-logs:${deploymentId}`, async () => {
      const events = await vercelFetch<VercelBuildLogEntry[]>(
        `/v2/deployments/${deploymentId}/events`
      );
      return events.slice(-100);
    })
  );
}

// ─── Portfolio Constants ─────────────────────────────────────────────────────

/** Known portfolio projects — maps Vercel project IDs to display names. */
const PORTFOLIO_PROJECTS: Record<string, string> = {
  prj_pWERrQuAlX8doYVNcMl0LrsqQuRT: "AM Collective",
  prj_YiLrYZG8axICSIpa7pOILUC7obfG: "TaskSpace",
  prj_Fyn7Gb9ew75vyxySNzOoghzekbMW: "Cursive",
  prj_GxMgXdOYErqgqg6Hsabk5oom5M94: "TBGC",
  prj_rOTfyyrnzCje8W2XyQAv3OgC2j19: "Wholesail",
  prj_iKdtrJrRjsS6JVLEjDiLLedIGzep: "Trackr",
  prj_kSQ0hEjqGqDADD2Y8wjNVvWqwFCh: "Hook",
};

// ─── Project Activity ────────────────────────────────────────────────────────

export interface VercelProjectActivity {
  projectId: string;
  projectName: string;
  framework: string | null;
  totalDeploys: number;
  successfulDeploys: number;
  failedDeploys: number;
  lastDeployAt: number | null;
  lastDeployState: string | null;
}

export interface VercelPortfolioSummary {
  totalProjects: number;
  totalDeploys: number;
  failedDeploys: number;
  successRate: number;
  projects: VercelProjectActivity[];
}

/**
 * Get deployment activity for all portfolio projects (last 30 days).
 * Returns per-project deploy counts, success rates, and overall summary.
 */
export async function getPortfolioActivity(): Promise<ConnectorResult<VercelPortfolioSummary>> {
  return safeCall(() =>
    cached(
      "vercel:portfolio-activity",
      async () => {
        const thirtyDaysAgo = Math.floor(
          (Date.now() - 30 * 24 * 60 * 60 * 1000) / 1000
        );

        const projectsResult = await vercelFetch<{
          projects: VercelProject[];
        }>("/v9/projects?limit=50");

        const activities: VercelProjectActivity[] = [];

        // Fetch deployments for each known portfolio project in parallel
        const knownProjects = projectsResult.projects.filter(
          (p) => p.id in PORTFOLIO_PROJECTS
        );

        const deployResults = await Promise.allSettled(
          knownProjects.map((project) =>
            vercelFetch<{ deployments: VercelDeployment[] }>(
              `/v6/deployments?projectId=${project.id}&limit=100&since=${thirtyDaysAgo * 1000}`
            ).then((res) => ({ project, deployments: res.deployments }))
          )
        );

        for (const result of deployResults) {
          if (result.status === "rejected") continue;
          const { project, deployments } = result.value;

          const successful = deployments.filter(
            (d) => d.state === "READY"
          ).length;
          const failed = deployments.filter(
            (d) => d.state === "ERROR"
          ).length;
          const latest = deployments[0] ?? null;

          activities.push({
            projectId: project.id,
            projectName: PORTFOLIO_PROJECTS[project.id] ?? project.name,
            framework: project.framework,
            totalDeploys: deployments.length,
            successfulDeploys: successful,
            failedDeploys: failed,
            lastDeployAt: latest?.created ?? null,
            lastDeployState: latest?.state ?? null,
          });
        }

        // Sort by most recent activity
        activities.sort(
          (a, b) => (b.lastDeployAt ?? 0) - (a.lastDeployAt ?? 0)
        );

        const totalDeploys = activities.reduce(
          (s, a) => s + a.totalDeploys,
          0
        );
        const failedDeploys = activities.reduce(
          (s, a) => s + a.failedDeploys,
          0
        );

        return {
          totalProjects: activities.length,
          totalDeploys,
          failedDeploys,
          successRate:
            totalDeploys > 0
              ? Math.round(
                  ((totalDeploys - failedDeploys) / totalDeploys) * 100
                )
              : 100,
          projects: activities,
        };
      },
      10 * 60 // 10 min cache
    )
  );
}

/**
 * Trigger a redeployment for a project (uses latest deployment as source).
 */
export async function redeployProject(
  projectId: string
): Promise<ConnectorResult<VercelDeployment>> {
  const token = process.env.VERCEL_API_TOKEN;
  if (!token) {
    return { success: false, error: "VERCEL_API_TOKEN is not set", fetchedAt: new Date() };
  }

  // Get the latest deployment to use as source
  const deploys = await getDeployments(projectId, 1);
  if (!deploys.success || !deploys.data?.length) {
    return { success: false, error: "No deployments found to redeploy", fetchedAt: new Date() };
  }

  const latestDeploy = deploys.data[0];
  const sep = "?";
  const url = `${VERCEL_API}/v13/deployments${sep}${teamParam()}`;

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: getHeaders(),
      body: JSON.stringify({
        name: latestDeploy.name,
        deploymentId: latestDeploy.uid,
      }),
    });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Vercel API ${res.status}: ${body.slice(0, 200)}`);
    }
    const deployment = (await res.json()) as VercelDeployment;
    // Invalidate deploy caches
    invalidateCache(`vercel:deploys:${projectId}`);
    invalidateCache("vercel:recent-deploys");
    return { success: true, data: deployment, fetchedAt: new Date() };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Redeploy failed";
    return { success: false, error: message, fetchedAt: new Date() };
  }
}
