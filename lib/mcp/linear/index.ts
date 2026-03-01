/**
 * Linear MCP Tools — Anthropic SDK format
 *
 * Tool definitions + executor for Linear issue tracking integration.
 */

import type Anthropic from "@anthropic-ai/sdk";
import {
  getTeams,
  getIssues,
  getActiveCycle,
  getProjects,
  getMyIssues,
  isLinearConfigured,
  createIssue,
  updateIssue,
  addComment,
} from "@/lib/connectors/linear";
import { captureError } from "@/lib/errors";

export const LINEAR_TOOL_DEFINITIONS: Anthropic.Tool[] = [
  {
    name: "get_linear_issues",
    description:
      "Search and filter Linear issues by team, status, or assignee. Use to answer questions about what is in progress, blocked, or due soon.",
    input_schema: {
      type: "object" as const,
      properties: {
        teamId: { type: "string", description: "Filter by team ID" },
        stateTypes: {
          type: "array",
          items: { type: "string" },
          description:
            "Filter by issue state types: triage, backlog, unstarted, started, completed, cancelled",
        },
        limit: {
          type: "number",
          description: "Max results (default 15)",
        },
      },
      required: [],
    },
  },
  {
    name: "get_linear_my_issues",
    description:
      "Get issues assigned to the authenticated Linear user that are active or unstarted.",
    input_schema: {
      type: "object" as const,
      properties: {},
      required: [],
    },
  },
  {
    name: "get_linear_cycle",
    description:
      "Get the active sprint/cycle for a Linear team, including progress and issue counts.",
    input_schema: {
      type: "object" as const,
      properties: {
        teamId: {
          type: "string",
          description: "The Linear team ID",
        },
      },
      required: ["teamId"],
    },
  },
  {
    name: "get_linear_projects",
    description:
      "Get Linear projects and their progress. Use when asked about project status, timelines, or roadmap.",
    input_schema: {
      type: "object" as const,
      properties: {
        teamId: { type: "string", description: "Optional team ID filter" },
      },
      required: [],
    },
  },
  {
    name: "get_linear_teams",
    description:
      "List all Linear teams. Use to discover team IDs for other Linear tools.",
    input_schema: {
      type: "object" as const,
      properties: {},
      required: [],
    },
  },
  {
    name: "create_linear_issue",
    description:
      "Create a new Linear issue. Requires teamId and title. Returns the issue URL.",
    input_schema: {
      type: "object" as const,
      properties: {
        teamId: { type: "string", description: "The Linear team ID" },
        title: { type: "string", description: "Issue title" },
        description: { type: "string", description: "Markdown description" },
        priority: {
          type: "number",
          description: "Priority 0=none, 1=urgent, 2=high, 3=medium, 4=low",
        },
        labelIds: {
          type: "array",
          items: { type: "string" },
          description: "Label IDs to attach",
        },
        assigneeId: { type: "string", description: "Assignee user ID" },
      },
      required: ["teamId", "title"],
    },
  },
  {
    name: "update_linear_issue",
    description:
      "Update an existing Linear issue — set priority, labels, state, or assignee.",
    input_schema: {
      type: "object" as const,
      properties: {
        issueId: { type: "string", description: "The Linear issue ID" },
        priority: {
          type: "number",
          description: "Priority 0=none, 1=urgent, 2=high, 3=medium, 4=low",
        },
        labelIds: {
          type: "array",
          items: { type: "string" },
          description: "Label IDs to set",
        },
        stateId: { type: "string", description: "Workflow state ID" },
        assigneeId: { type: "string", description: "Assignee user ID" },
      },
      required: ["issueId"],
    },
  },
  {
    name: "add_linear_comment",
    description: "Post a comment on a Linear issue.",
    input_schema: {
      type: "object" as const,
      properties: {
        issueId: { type: "string", description: "The Linear issue ID" },
        body: { type: "string", description: "Comment body (Markdown)" },
      },
      required: ["issueId", "body"],
    },
  },
];

export async function executeLinearTool(
  name: string,
  input: Record<string, unknown>
): Promise<string> {
  if (!isLinearConfigured()) {
    return JSON.stringify({
      error: "Linear not configured. Set LINEAR_API_KEY in environment.",
    });
  }

  try {
    switch (name) {
      case "get_linear_issues": {
        const issues = await getIssues({
          teamId: input.teamId as string | undefined,
          stateTypes: input.stateTypes as string[] | undefined,
          limit: (input.limit as number) || 15,
        });
        return JSON.stringify(issues);
      }

      case "get_linear_my_issues": {
        const issues = await getMyIssues();
        return JSON.stringify(issues);
      }

      case "get_linear_cycle": {
        const cycle = await getActiveCycle(input.teamId as string);
        if (!cycle) return JSON.stringify({ message: "No active cycle" });
        return JSON.stringify(cycle);
      }

      case "get_linear_projects": {
        const projects = await getProjects(input.teamId as string | undefined);
        return JSON.stringify(projects);
      }

      case "get_linear_teams": {
        const teams = await getTeams();
        return JSON.stringify(teams);
      }

      case "create_linear_issue": {
        const result = await createIssue({
          teamId: input.teamId as string,
          title: input.title as string,
          description: input.description as string | undefined,
          priority: input.priority as number | undefined,
          labelIds: input.labelIds as string[] | undefined,
          assigneeId: input.assigneeId as string | undefined,
        });
        return JSON.stringify(result);
      }

      case "update_linear_issue": {
        const result = await updateIssue(input.issueId as string, {
          priority: input.priority as number | undefined,
          labelIds: input.labelIds as string[] | undefined,
          stateId: input.stateId as string | undefined,
          assigneeId: input.assigneeId as string | undefined,
        });
        return JSON.stringify(result);
      }

      case "add_linear_comment": {
        const result = await addComment(
          input.issueId as string,
          input.body as string
        );
        return JSON.stringify(result);
      }

      default:
        return JSON.stringify({ error: `Unknown Linear tool: ${name}` });
    }
  } catch (error) {
    captureError(error, { tags: { tool: name, source: "linear_mcp" } });
    return JSON.stringify({
      error: `Linear tool ${name} failed: ${
        error instanceof Error ? error.message : "unknown"
      }`,
    });
  }
}
