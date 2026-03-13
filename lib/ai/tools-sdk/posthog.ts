/**
 * PostHog Tools — analytics, funnels, top pages, user counts
 */

import { tool } from "ai";
import { z } from "zod";
import * as posthogConnector from "@/lib/connectors/posthog";
import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { eq, desc, and, isNotNull } from "drizzle-orm";

async function findPosthogProject(name: string) {
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

export const posthogTools = {
  get_posthog_analytics: tool({
    description:
      "Get DAU/WAU/MAU and top events for a project from PostHog snapshots.",
    inputSchema: z.object({
      project_name: z
        .string()
        .describe("Project name to get analytics for"),
    }),
    execute: async ({ project_name }) => {
      const project = await findPosthogProject(project_name);
      if (!project)
        return {
          error: `Project "${project_name}" not found or PostHog not configured`,
        };

      const snapshots = await db
        .select()
        .from(schema.posthogSnapshots)
        .where(eq(schema.posthogSnapshots.projectId, project.id))
        .orderBy(desc(schema.posthogSnapshots.snapshotDate))
        .limit(1);

      if (snapshots.length === 0) {
        const activeUsers = await posthogConnector.getActiveUsersForProject(
          project.posthogApiKey!,
          project.posthogProjectId!
        );
        const topEvents = await posthogConnector.getTopEventsForProject(
          project.posthogApiKey!,
          project.posthogProjectId!,
          10
        );
        return {
          project: project_name,
          source: "live",
          activeUsers: activeUsers.success ? activeUsers.data : null,
          topEvents: topEvents.success ? topEvents.data : null,
        };
      }

      const snap = snapshots[0];
      return {
        project: project_name,
        source: "snapshot",
        snapshotDate: snap.snapshotDate,
        dau: snap.dau,
        wau: snap.wau,
        mau: snap.mau,
        totalPageviews: snap.totalPageviews,
        topEvents: snap.topEvents,
        signupCount: snap.signupCount,
      };
    },
  }),

  get_posthog_funnel: tool({
    description: "Get signup funnel drop-off data for a project.",
    inputSchema: z.object({
      project_name: z
        .string()
        .describe("Project name to get funnel data for"),
    }),
    execute: async ({ project_name }) => {
      const project = await findPosthogProject(project_name);
      if (!project)
        return {
          error: `Project "${project_name}" not found or PostHog not configured`,
        };

      const snapshots = await db
        .select()
        .from(schema.posthogSnapshots)
        .where(eq(schema.posthogSnapshots.projectId, project.id))
        .orderBy(desc(schema.posthogSnapshots.snapshotDate))
        .limit(7);

      return {
        project: project_name,
        funnel: snapshots.map((s) => ({
          date: s.snapshotDate,
          mau: s.mau,
          signups: s.signupCount,
          conversionRate:
            s.mau && s.signupCount
              ? ((s.signupCount / s.mau) * 100).toFixed(1) + "%"
              : "N/A",
        })),
      };
    },
  }),

  get_posthog_top_pages: tool({
    description: "Get top 10 pages by sessions for a project.",
    inputSchema: z.object({
      project_name: z
        .string()
        .describe("Project name to get top pages for"),
    }),
    execute: async ({ project_name }) => {
      const project = await findPosthogProject(project_name);
      if (!project)
        return {
          error: `Project "${project_name}" not found or PostHog not configured`,
        };

      const [snapshot] = await db
        .select()
        .from(schema.posthogSnapshots)
        .where(eq(schema.posthogSnapshots.projectId, project.id))
        .orderBy(desc(schema.posthogSnapshots.snapshotDate))
        .limit(1);

      if (snapshot?.topPages) {
        return {
          project: project_name,
          source: "snapshot",
          topPages: snapshot.topPages,
        };
      }

      const result = await posthogConnector.getTopPagesForProject(
        project.posthogApiKey!,
        project.posthogProjectId!,
        10
      );
      return {
        project: project_name,
        source: "live",
        topPages: result.success ? result.data : null,
        error: result.success ? undefined : result.error,
      };
    },
  }),

  get_posthog_user_count: tool({
    description:
      "Get DAU/WAU/MAU per product across all PostHog-configured projects.",
    inputSchema: z.object({}),
    execute: async () => {
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

      return {
        products: results,
        totals: {
          dau: results.reduce((sum, r) => sum + r.dau, 0),
          wau: results.reduce((sum, r) => sum + r.wau, 0),
          mau: results.reduce((sum, r) => sum + r.mau, 0),
        },
      };
    },
  }),
};
