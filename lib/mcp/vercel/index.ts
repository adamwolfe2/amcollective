/**
 * Vercel AI Agent Tools
 *
 * Tool definitions + executors for the ClaudeBot to query Vercel infrastructure.
 */

import type Anthropic from "@anthropic-ai/sdk";
import * as vercelConnector from "@/lib/connectors/vercel";
import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { eq, desc } from "drizzle-orm";

// ─── Tool Definitions ───────────────────────────────────────────────────────

export const VERCEL_TOOL_DEFINITIONS: Anthropic.Tool[] = [
  {
    name: "list_vercel_projects",
    description:
      "List all Vercel projects with status, framework, and last deploy info.",
    input_schema: {
      type: "object" as const,
      properties: {},
      required: [],
    },
  },
  {
    name: "get_vercel_project_costs",
    description:
      "Get Vercel usage and spend data from snapshots for a specific project.",
    input_schema: {
      type: "object" as const,
      properties: {
        project_name: {
          type: "string",
          description: "Project name to look up",
        },
      },
      required: ["project_name"],
    },
  },
  {
    name: "redeploy_vercel_project",
    description: "Trigger a redeploy of a Vercel project by name.",
    input_schema: {
      type: "object" as const,
      properties: {
        project_name: {
          type: "string",
          description: "Project name to redeploy",
        },
      },
      required: ["project_name"],
    },
  },
  {
    name: "get_vercel_build_logs",
    description: "Get the last 100 build log lines from the most recent deployment of a project.",
    input_schema: {
      type: "object" as const,
      properties: {
        project_name: {
          type: "string",
          description: "Project name to get build logs for",
        },
      },
      required: ["project_name"],
    },
  },
  {
    name: "check_vercel_domain_status",
    description: "Check DNS and SSL status for all domains on a Vercel project.",
    input_schema: {
      type: "object" as const,
      properties: {
        project_name: {
          type: "string",
          description: "Project name to check domains for",
        },
      },
      required: ["project_name"],
    },
  },
];

// ─── Helpers ────────────────────────────────────────────────────────────────

async function findVercelProjectByName(name: string) {
  const result = await vercelConnector.getProjects();
  if (!result.success || !result.data) return null;
  return (
    result.data.find(
      (p) => p.name.toLowerCase() === name.toLowerCase()
    ) ?? null
  );
}

// ─── Tool Executor ──────────────────────────────────────────────────────────

export async function executeVercelTool(
  name: string,
  input: Record<string, unknown>
): Promise<string> {
  try {
    switch (name) {
      case "list_vercel_projects": {
        const result = await vercelConnector.getProjects();
        if (!result.success)
          return JSON.stringify({ error: result.error });
        const projects = result.data ?? [];

        // Enrich with latest deploy info
        const enriched = await Promise.all(
          projects.map(async (p) => {
            const deploys = await vercelConnector.getDeployments(p.id, 1);
            const latestDeploy =
              deploys.success && deploys.data?.length
                ? deploys.data[0]
                : null;
            return {
              name: p.name,
              framework: p.framework,
              lastDeploy: latestDeploy
                ? {
                    state: latestDeploy.state,
                    created: latestDeploy.created,
                    commit: latestDeploy.meta?.githubCommitMessage,
                  }
                : null,
            };
          })
        );
        return JSON.stringify(enriched);
      }

      case "get_vercel_project_costs": {
        const projectName = input.project_name as string;
        const vProject = await findVercelProjectByName(projectName);
        if (!vProject)
          return JSON.stringify({ error: `Project "${projectName}" not found` });

        // Get latest snapshot
        const snapshots = await db
          .select()
          .from(schema.vercelProjectSnapshots)
          .where(
            eq(schema.vercelProjectSnapshots.vercelProjectId, vProject.id)
          )
          .orderBy(desc(schema.vercelProjectSnapshots.snapshotDate))
          .limit(1);

        if (snapshots.length === 0) {
          return JSON.stringify({
            project: projectName,
            message: "No snapshots yet. Run the sync-vercel-full job first.",
          });
        }

        const snap = snapshots[0];
        return JSON.stringify({
          project: projectName,
          framework: snap.framework,
          envVarCount: snap.envVarCount,
          latestDeployState: snap.latestDeployState,
          latestDeployAt: snap.latestDeployAt,
          bandwidthBytes: snap.bandwidthBytes,
          functionInvocations: snap.functionInvocations,
          buildMinutes: snap.buildMinutes,
          snapshotDate: snap.snapshotDate,
        });
      }

      case "redeploy_vercel_project": {
        const projectName = input.project_name as string;
        const vProject = await findVercelProjectByName(projectName);
        if (!vProject)
          return JSON.stringify({ error: `Project "${projectName}" not found` });

        const result = await vercelConnector.redeployProject(vProject.id);
        if (!result.success)
          return JSON.stringify({ error: result.error });

        return JSON.stringify({
          success: true,
          project: projectName,
          deploymentUrl: result.data?.url,
        });
      }

      case "get_vercel_build_logs": {
        const projectName = input.project_name as string;
        const vProject = await findVercelProjectByName(projectName);
        if (!vProject)
          return JSON.stringify({ error: `Project "${projectName}" not found` });

        const deploys = await vercelConnector.getDeployments(vProject.id, 1);
        if (!deploys.success || !deploys.data?.length)
          return JSON.stringify({ error: "No deployments found" });

        const logs = await vercelConnector.getBuildLogs(
          deploys.data[0].uid
        );
        if (!logs.success)
          return JSON.stringify({ error: logs.error });

        return JSON.stringify({
          project: projectName,
          deploymentId: deploys.data[0].uid,
          state: deploys.data[0].state,
          logs: (logs.data ?? []).map((l) => l.text).join("\n"),
        });
      }

      case "check_vercel_domain_status": {
        const projectName = input.project_name as string;
        const vProject = await findVercelProjectByName(projectName);
        if (!vProject)
          return JSON.stringify({ error: `Project "${projectName}" not found` });

        const domains = await vercelConnector.getProjectDomains(vProject.id);
        if (!domains.success)
          return JSON.stringify({ error: domains.error });

        return JSON.stringify({
          project: projectName,
          domains: (domains.data ?? []).map((d) => ({
            name: d.name,
            verified: d.verified,
            redirect: d.redirect,
          })),
        });
      }

      default:
        return JSON.stringify({ error: `Unknown Vercel tool: ${name}` });
    }
  } catch (error) {
    return JSON.stringify({
      error: `Vercel tool ${name} failed: ${error instanceof Error ? error.message : "unknown"}`,
    });
  }
}
