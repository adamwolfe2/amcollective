/**
 * PostHog AI Agent Tools
 *
 * Tool definitions + executors for the ClaudeBot to query PostHog analytics.
 */

import type Anthropic from "@anthropic-ai/sdk";
import * as posthogConnector from "@/lib/connectors/posthog";
import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { eq, desc, and, isNotNull } from "drizzle-orm";

// ─── Tool Definitions ───────────────────────────────────────────────────────

export const POSTHOG_TOOL_DEFINITIONS: Anthropic.Tool[] = [
  {
    name: "get_posthog_analytics",
    description:
      "Get DAU/WAU/MAU and top events for a project from PostHog snapshots.",
    input_schema: {
      type: "object" as const,
      properties: {
        project_name: {
          type: "string",
          description: "Project name to get analytics for",
        },
      },
      required: ["project_name"],
    },
  },
  {
    name: "get_posthog_funnel",
    description: "Get signup funnel drop-off data for a project.",
    input_schema: {
      type: "object" as const,
      properties: {
        project_name: {
          type: "string",
          description: "Project name to get funnel data for",
        },
      },
      required: ["project_name"],
    },
  },
  {
    name: "get_posthog_top_pages",
    description: "Get top 10 pages by sessions for a project.",
    input_schema: {
      type: "object" as const,
      properties: {
        project_name: {
          type: "string",
          description: "Project name to get top pages for",
        },
      },
      required: ["project_name"],
    },
  },
  {
    name: "get_posthog_user_count",
    description: "Get DAU/WAU/MAU per product across all PostHog-configured projects.",
    input_schema: {
      type: "object" as const,
      properties: {},
      required: [],
    },
  },
];

// ─── Helpers ────────────────────────────────────────────────────────────────

async function findProjectByName(name: string) {
  const projects = await db
    .select()
    .from(schema.portfolioProjects)
    .where(
      and(
        isNotNull(schema.portfolioProjects.posthogProjectId),
        isNotNull(schema.portfolioProjects.posthogApiKey)
      )
    );
  return (
    projects.find((p) => p.name.toLowerCase() === name.toLowerCase()) ?? null
  );
}

// ─── Tool Executor ──────────────────────────────────────────────────────────

export async function executePosthogTool(
  name: string,
  input: Record<string, unknown>
): Promise<string> {
  try {
    switch (name) {
      case "get_posthog_analytics": {
        const projectName = input.project_name as string;
        const project = await findProjectByName(projectName);
        if (!project)
          return JSON.stringify({
            error: `Project "${projectName}" not found or PostHog not configured`,
          });

        // Get latest snapshot
        const snapshots = await db
          .select()
          .from(schema.posthogSnapshots)
          .where(eq(schema.posthogSnapshots.projectId, project.id))
          .orderBy(desc(schema.posthogSnapshots.snapshotDate))
          .limit(1);

        if (snapshots.length === 0) {
          // Try live query
          const activeUsers = await posthogConnector.getActiveUsersForProject(
            project.posthogApiKey!,
            project.posthogProjectId!
          );
          const topEvents = await posthogConnector.getTopEventsForProject(
            project.posthogApiKey!,
            project.posthogProjectId!,
            10
          );
          return JSON.stringify({
            project: projectName,
            source: "live",
            activeUsers: activeUsers.success ? activeUsers.data : null,
            topEvents: topEvents.success ? topEvents.data : null,
          });
        }

        const snap = snapshots[0];
        return JSON.stringify({
          project: projectName,
          source: "snapshot",
          snapshotDate: snap.snapshotDate,
          dau: snap.dau,
          wau: snap.wau,
          mau: snap.mau,
          totalPageviews: snap.totalPageviews,
          topEvents: snap.topEvents,
          signupCount: snap.signupCount,
        });
      }

      case "get_posthog_funnel": {
        const projectName = input.project_name as string;
        const project = await findProjectByName(projectName);
        if (!project)
          return JSON.stringify({
            error: `Project "${projectName}" not found or PostHog not configured`,
          });

        // Get recent snapshots to show signup trend
        const snapshots = await db
          .select()
          .from(schema.posthogSnapshots)
          .where(eq(schema.posthogSnapshots.projectId, project.id))
          .orderBy(desc(schema.posthogSnapshots.snapshotDate))
          .limit(7);

        return JSON.stringify({
          project: projectName,
          funnel: snapshots.map((s) => ({
            date: s.snapshotDate,
            mau: s.mau,
            signups: s.signupCount,
            conversionRate:
              s.mau && s.signupCount
                ? ((s.signupCount / s.mau) * 100).toFixed(1) + "%"
                : "N/A",
          })),
        });
      }

      case "get_posthog_top_pages": {
        const projectName = input.project_name as string;
        const project = await findProjectByName(projectName);
        if (!project)
          return JSON.stringify({
            error: `Project "${projectName}" not found or PostHog not configured`,
          });

        // Try snapshot first
        const [snapshot] = await db
          .select()
          .from(schema.posthogSnapshots)
          .where(eq(schema.posthogSnapshots.projectId, project.id))
          .orderBy(desc(schema.posthogSnapshots.snapshotDate))
          .limit(1);

        if (snapshot?.topPages) {
          return JSON.stringify({
            project: projectName,
            source: "snapshot",
            topPages: snapshot.topPages,
          });
        }

        // Fall back to live query
        const result = await posthogConnector.getTopPagesForProject(
          project.posthogApiKey!,
          project.posthogProjectId!,
          10
        );
        return JSON.stringify({
          project: projectName,
          source: "live",
          topPages: result.success ? result.data : null,
          error: result.success ? undefined : result.error,
        });
      }

      case "get_posthog_user_count": {
        // Get latest snapshot for each project
        const allProjects = await db
          .select()
          .from(schema.portfolioProjects)
          .where(
            and(
              isNotNull(schema.portfolioProjects.posthogProjectId),
              isNotNull(schema.portfolioProjects.posthogApiKey)
            )
          );

        const results = await Promise.all(
          allProjects.map(async (project) => {
            const [snapshot] = await db
              .select()
              .from(schema.posthogSnapshots)
              .where(eq(schema.posthogSnapshots.projectId, project.id))
              .orderBy(desc(schema.posthogSnapshots.snapshotDate))
              .limit(1);

            return {
              project: project.name,
              dau: snapshot?.dau ?? 0,
              wau: snapshot?.wau ?? 0,
              mau: snapshot?.mau ?? 0,
              snapshotDate: snapshot?.snapshotDate ?? null,
            };
          })
        );

        return JSON.stringify({
          products: results,
          totals: {
            dau: results.reduce((sum, r) => sum + r.dau, 0),
            wau: results.reduce((sum, r) => sum + r.wau, 0),
            mau: results.reduce((sum, r) => sum + r.mau, 0),
          },
        });
      }

      default:
        return JSON.stringify({ error: `Unknown PostHog tool: ${name}` });
    }
  } catch (error) {
    return JSON.stringify({
      error: `PostHog tool ${name} failed: ${error instanceof Error ? error.message : "unknown"}`,
    });
  }
}
