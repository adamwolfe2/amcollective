/**
 * Linear Connector — Read-only wrapper around Linear GraphQL API.
 *
 * Provides team, issue, cycle, and project queries for ClaudeBot + dashboards.
 */

import { LinearClient } from "@linear/sdk";
import { captureError } from "@/lib/errors";

let _client: LinearClient | null = null;

function getClient(): LinearClient {
  if (!process.env.LINEAR_API_KEY) {
    throw new Error("LINEAR_API_KEY not configured");
  }
  if (!_client) {
    _client = new LinearClient({ apiKey: process.env.LINEAR_API_KEY });
  }
  return _client;
}

export function isLinearConfigured(): boolean {
  return Boolean(process.env.LINEAR_API_KEY);
}

export async function getTeams() {
  const client = getClient();
  const teams = await client.teams();
  return teams.nodes.map((t) => ({
    id: t.id,
    name: t.name,
    key: t.key,
  }));
}

export async function getIssues(options: {
  teamId?: string;
  assigneeId?: string;
  stateTypes?: string[];
  limit?: number;
}) {
  const client = getClient();

  const filter: Record<string, unknown> = {};
  if (options.teamId) filter.team = { id: { eq: options.teamId } };
  if (options.assigneeId) filter.assignee = { id: { eq: options.assigneeId } };
  if (options.stateTypes?.length) {
    filter.state = { type: { in: options.stateTypes } };
  }

  const issues = await client.issues({
    filter,
    first: options.limit ?? 25,
  } as Parameters<typeof client.issues>[0]);

  return Promise.all(
    issues.nodes.map(async (issue) => {
      const state = await issue.state;
      return {
        id: issue.id,
        identifier: issue.identifier,
        title: issue.title,
        priority: issue.priority,
        priorityLabel: issue.priorityLabel,
        stateType: state?.type ?? null,
        stateName: state?.name ?? null,
        url: issue.url,
        createdAt: issue.createdAt,
        updatedAt: issue.updatedAt,
        dueDate: issue.dueDate,
      };
    })
  );
}

export async function getActiveCycle(teamId: string) {
  const client = getClient();
  const team = await client.team(teamId);
  const activeCycle = await team.activeCycle;
  if (!activeCycle) return null;

  const issues = await activeCycle.issues();
  const completedStates = await Promise.all(
    issues.nodes.map(async (i) => {
      const state = await i.state;
      return state?.type === "completed";
    })
  );
  const completed = completedStates.filter(Boolean).length;

  return {
    id: activeCycle.id,
    name: activeCycle.name,
    number: activeCycle.number,
    startsAt: activeCycle.startsAt,
    endsAt: activeCycle.endsAt,
    progress: activeCycle.progress,
    completedIssues: completed,
    totalIssues: issues.nodes.length,
  };
}

export async function getProjects(teamId?: string) {
  const client = getClient();
  const filter = teamId
    ? { accessibleTeams: { some: { id: { eq: teamId } } } }
    : {};

  const projects = await client.projects({
    filter,
    first: 20,
  } as Parameters<typeof client.projects>[0]);

  return projects.nodes.map((p) => ({
    id: p.id,
    name: p.name,
    description: p.description,
    state: p.state,
    progress: p.progress,
    targetDate: p.targetDate,
    url: p.url,
  }));
}

export async function getMyIssues() {
  try {
    const client = getClient();
    const me = await client.viewer;
    return getIssues({
      assigneeId: me.id,
      stateTypes: ["unstarted", "started"],
      limit: 20,
    });
  } catch (err) {
    captureError(err, { tags: { connector: "linear", fn: "getMyIssues" } });
    return [];
  }
}

// ─── Write Methods ────────────────────────────────────────────────────────────

export async function updateIssue(
  issueId: string,
  input: {
    priority?: number;
    labelIds?: string[];
    stateId?: string;
    assigneeId?: string;
  }
) {
  const client = getClient();
  const result = await client.updateIssue(issueId, input);
  return { success: result.success };
}

export async function addComment(issueId: string, body: string) {
  const client = getClient();
  const result = await client.createComment({ issueId, body });
  const comment = await result.comment;
  return { success: result.success, commentId: comment?.id ?? null };
}

export async function createIssue(input: {
  teamId: string;
  title: string;
  description?: string;
  priority?: number;
  labelIds?: string[];
  assigneeId?: string;
  stateId?: string;
}) {
  const client = getClient();
  const result = await client.createIssue(input);
  const issue = await result.issue;
  return {
    success: result.success,
    issueId: issue?.id ?? null,
    identifier: issue?.identifier ?? null,
    url: issue?.url ?? null,
  };
}

export async function getLabels(teamId?: string) {
  const client = getClient();
  const labels = await client.issueLabels({
    filter: teamId ? { team: { id: { eq: teamId } } } : undefined,
    first: 100,
  } as Parameters<typeof client.issueLabels>[0]);
  return labels.nodes.map((l) => ({
    id: l.id,
    name: l.name,
    color: l.color,
  }));
}
