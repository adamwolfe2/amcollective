/**
 * Linear Tools — issues, cycles, projects, teams
 */

import { tool } from "ai";
import { z } from "zod";
import * as linearConnector from "@/lib/connectors/linear";

export const linearTools = {
  get_linear_issues: tool({
    description:
      "Search and filter Linear issues by team or status. Use to answer questions about what is in progress, blocked, or due soon.",
    inputSchema: z.object({
      teamId: z.string().optional().describe("Filter by team ID"),
      stateTypes: z
        .array(
          z.enum([
            "triage",
            "backlog",
            "unstarted",
            "started",
            "completed",
            "cancelled",
          ])
        )
        .optional()
        .describe("Filter by issue state types"),
      limit: z.number().optional().describe("Max results (default 15)"),
    }),
    execute: async ({ teamId, stateTypes, limit: lim }) => {
      if (!linearConnector.isLinearConfigured())
        return { error: "Linear not configured" };
      return linearConnector.getIssues({
        teamId,
        stateTypes,
        limit: lim ?? 15,
      });
    },
  }),

  get_linear_my_issues: tool({
    description:
      "Get issues assigned to the current Linear user that are active or unstarted.",
    inputSchema: z.object({}),
    execute: async () => {
      if (!linearConnector.isLinearConfigured())
        return { error: "Linear not configured" };
      return linearConnector.getMyIssues();
    },
  }),

  get_linear_cycle: tool({
    description:
      "Get the active sprint/cycle for a Linear team, including progress and issue counts.",
    inputSchema: z.object({
      teamId: z.string().describe("The Linear team ID"),
    }),
    execute: async ({ teamId }) => {
      if (!linearConnector.isLinearConfigured())
        return { error: "Linear not configured" };
      return linearConnector.getActiveCycle(teamId);
    },
  }),

  get_linear_projects: tool({
    description:
      "Get Linear projects and their progress. Use when asked about project status, timelines, or roadmap.",
    inputSchema: z.object({
      teamId: z.string().optional().describe("Optional team ID filter"),
    }),
    execute: async ({ teamId }) => {
      if (!linearConnector.isLinearConfigured())
        return { error: "Linear not configured" };
      return linearConnector.getProjects(teamId);
    },
  }),

  get_linear_teams: tool({
    description:
      "List all Linear teams. Use to discover team IDs for other Linear tools.",
    inputSchema: z.object({}),
    execute: async () => {
      if (!linearConnector.isLinearConfigured())
        return { error: "Linear not configured" };
      return linearConnector.getTeams();
    },
  }),

  create_linear_issue: tool({
    description:
      "Create a new Linear issue. Requires teamId and title. Returns the issue URL.",
    inputSchema: z.object({
      teamId: z.string().describe("The Linear team ID"),
      title: z.string().describe("Issue title"),
      description: z.string().optional().describe("Markdown description"),
      priority: z
        .number()
        .min(0)
        .max(4)
        .optional()
        .describe("Priority 0=none, 1=urgent, 2=high, 3=medium, 4=low"),
      labelIds: z
        .array(z.string())
        .optional()
        .describe("Label IDs to attach"),
      assigneeId: z.string().optional().describe("Assignee user ID"),
    }),
    execute: async (input) => {
      if (!linearConnector.isLinearConfigured())
        return { error: "Linear not configured" };
      return linearConnector.createIssue(input);
    },
  }),

  update_linear_issue: tool({
    description:
      "Update an existing Linear issue — set priority, labels, state, or assignee.",
    inputSchema: z.object({
      issueId: z.string().describe("The Linear issue ID"),
      priority: z
        .number()
        .min(0)
        .max(4)
        .optional()
        .describe("Priority 0=none, 1=urgent, 2=high, 3=medium, 4=low"),
      labelIds: z
        .array(z.string())
        .optional()
        .describe("Label IDs to set"),
      stateId: z.string().optional().describe("Workflow state ID"),
      assigneeId: z.string().optional().describe("Assignee user ID"),
    }),
    execute: async ({ issueId, ...rest }) => {
      if (!linearConnector.isLinearConfigured())
        return { error: "Linear not configured" };
      return linearConnector.updateIssue(issueId, rest);
    },
  }),

  add_linear_comment: tool({
    description: "Post a comment on a Linear issue.",
    inputSchema: z.object({
      issueId: z.string().describe("The Linear issue ID"),
      body: z.string().describe("Comment body (Markdown)"),
    }),
    execute: async ({ issueId, body }) => {
      if (!linearConnector.isLinearConfigured())
        return { error: "Linear not configured" };
      return linearConnector.addComment(issueId, body);
    },
  }),
};
