/**
 * Vercel Tools — deployment, costs, domains, build logs
 */

import { tool } from "ai";
import { z } from "zod";
import * as vercelConnector from "@/lib/connectors/vercel";
import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { eq, desc } from "drizzle-orm";

async function findVercelProjectByName(name: string) {
  const result = await vercelConnector.getProjects();
  if (!result.success || !result.data) return null;
  return (
    result.data.find((p) => p.name.toLowerCase() === name.toLowerCase()) ??
    null
  );
}

export const vercelTools = {
  list_vercel_projects: tool({
    description:
      "List all Vercel projects with status, framework, and last deploy info.",
    inputSchema: z.object({}),
    execute: async () => {
      const result = await vercelConnector.getProjects();
      if (!result.success) return { error: result.error };
      const projects = result.data ?? [];
      const enriched = await Promise.all(
        projects.map(async (p) => {
          const deploys = await vercelConnector.getDeployments(p.id, 1);
          const latestDeploy =
            deploys.success && deploys.data?.length ? deploys.data[0] : null;
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
      return enriched;
    },
  }),

  get_vercel_project_costs: tool({
    description:
      "Get Vercel usage and spend data from snapshots for a specific project.",
    inputSchema: z.object({
      project_name: z.string().describe("Project name to look up"),
    }),
    execute: async ({ project_name }) => {
      const vProject = await findVercelProjectByName(project_name);
      if (!vProject)
        return { error: `Project "${project_name}" not found` };

      const snapshots = await db
        .select()
        .from(schema.vercelProjectSnapshots)
        .where(
          eq(schema.vercelProjectSnapshots.vercelProjectId, vProject.id)
        )
        .orderBy(desc(schema.vercelProjectSnapshots.snapshotDate))
        .limit(1);

      if (snapshots.length === 0) {
        return {
          project: project_name,
          message: "No snapshots yet. Run the sync-vercel-full job first.",
        };
      }

      const snap = snapshots[0];
      return {
        project: project_name,
        framework: snap.framework,
        envVarCount: snap.envVarCount,
        latestDeployState: snap.latestDeployState,
        latestDeployAt: snap.latestDeployAt,
        bandwidthBytes: snap.bandwidthBytes,
        functionInvocations: snap.functionInvocations,
        buildMinutes: snap.buildMinutes,
        snapshotDate: snap.snapshotDate,
      };
    },
  }),

  redeploy_vercel_project: tool({
    description: "Trigger a redeploy of a Vercel project by name.",
    inputSchema: z.object({
      project_name: z.string().describe("Project name to redeploy"),
    }),
    execute: async ({ project_name }) => {
      const vProject = await findVercelProjectByName(project_name);
      if (!vProject)
        return { error: `Project "${project_name}" not found` };

      const result = await vercelConnector.redeployProject(vProject.id);
      if (!result.success) return { error: result.error };

      return {
        success: true,
        project: project_name,
        deploymentUrl: result.data?.url,
      };
    },
  }),

  get_vercel_build_logs: tool({
    description:
      "Get the last 100 build log lines from the most recent deployment of a project.",
    inputSchema: z.object({
      project_name: z
        .string()
        .describe("Project name to get build logs for"),
    }),
    execute: async ({ project_name }) => {
      const vProject = await findVercelProjectByName(project_name);
      if (!vProject)
        return { error: `Project "${project_name}" not found` };

      const deploys = await vercelConnector.getDeployments(vProject.id, 1);
      if (!deploys.success || !deploys.data?.length)
        return { error: "No deployments found" };

      const logs = await vercelConnector.getBuildLogs(deploys.data[0].uid);
      if (!logs.success) return { error: logs.error };

      return {
        project: project_name,
        deploymentId: deploys.data[0].uid,
        state: deploys.data[0].state,
        logs: (logs.data ?? []).map((l) => l.text).join("\n"),
      };
    },
  }),

  check_vercel_domain_status: tool({
    description:
      "Check DNS and SSL status for all domains on a Vercel project.",
    inputSchema: z.object({
      project_name: z
        .string()
        .describe("Project name to check domains for"),
    }),
    execute: async ({ project_name }) => {
      const vProject = await findVercelProjectByName(project_name);
      if (!vProject)
        return { error: `Project "${project_name}" not found` };

      const domains = await vercelConnector.getProjectDomains(vProject.id);
      if (!domains.success) return { error: domains.error };

      return {
        project: project_name,
        domains: (domains.data ?? []).map((d) => ({
          name: d.name,
          verified: d.verified,
          redirect: d.redirect,
        })),
      };
    },
  }),
};
