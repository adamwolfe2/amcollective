/**
 * Linear Connector — Read-only wrapper around Linear GraphQL API.
 *
 * Provides team, issue, cycle, and project queries for ClaudeBot + dashboards.
 *
 * Graceful degradation: every read returns a sensible empty value if
 * LINEAR_API_KEY is unset (instead of throwing). Write methods still throw
 * because they should never silently no-op.
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

/** Generic safe-read wrapper: if Linear is unconfigured OR the call throws,
 *  return the provided fallback and capture error. Used for read-only
 *  surfaces where a Linear outage shouldn't 500 the whole route. */
async function safeRead<T>(fn: string, op: () => Promise<T>, fallback: T): Promise<T> {
  if (!isLinearConfigured()) return fallback;
  try {
    return await op();
  } catch (err) {
    captureError(err, { tags: { connector: "linear", fn } });
    return fallback;
  }
}

export async function getTeams() {
  return safeRead(
    "getTeams",
    async () => {
      const client = getClient();
      const teams = await client.teams();
      return teams.nodes.map((t) => ({
        id: t.id,
        name: t.name,
        key: t.key,
      }));
    },
    [] as Array<{ id: string; name: string; key: string }>
  );
}

export async function getIssues(options: {
  teamId?: string;
  assigneeId?: string;
  stateTypes?: string[];
  limit?: number;
}) {
  return safeRead(
    "getIssues",
    async () => {
      const client = getClient();

      const filter: Record<string, unknown> = {};
      if (options.teamId) filter.team = { id: { eq: options.teamId } };
      if (options.assigneeId)
        filter.assignee = { id: { eq: options.assigneeId } };
      if (options.stateTypes?.length) {
        filter.state = { type: { in: options.stateTypes } };
      }

      const issues = await client.issues({
        filter,
        first: options.limit ?? 25,
      } as Parameters<typeof client.issues>[0]);

      // N+1 fix: state is a lazy field — Promise.all fans them out in parallel
      // rather than sequential awaits. With limit=25, this is one round-trip
      // for the issues + 25 parallel state fetches instead of 25 serial.
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
    },
    [] as Array<{
      id: string;
      identifier: string;
      title: string;
      priority: number;
      priorityLabel: string;
      stateType: string | null;
      stateName: string | null;
      url: string;
      createdAt: Date;
      updatedAt: Date;
      dueDate: string | null;
    }>
  );
}

export async function getActiveCycle(teamId: string) {
  return safeRead(
    "getActiveCycle",
    async () => {
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
    },
    null as null | {
      id: string;
      name: string;
      number: number;
      startsAt: Date;
      endsAt: Date;
      progress: number;
      completedIssues: number;
      totalIssues: number;
    }
  );
}

export async function getProjects(teamId?: string) {
  return safeRead(
    "getProjects",
    async () => {
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
    },
    [] as Array<{
      id: string;
      name: string;
      description: string;
      state: string;
      progress: number;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      targetDate: any;
      url: string;
    }>
  );
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
  return safeRead(
    "getLabels",
    async () => {
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
    },
    [] as Array<{ id: string; name: string; color: string }>
  );
}
