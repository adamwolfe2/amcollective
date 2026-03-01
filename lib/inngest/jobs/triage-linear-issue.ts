/**
 * Inngest Job — AI Triage Linear Issue
 *
 * Triggered by inngest.send({ name: "linear/issue.triage" }).
 *
 * Uses Claude Haiku to classify new Linear issues by priority and labels,
 * then applies the triage back via Linear API and posts reasoning as a comment.
 */

import { inngest } from "@/lib/inngest/client";
import { captureError } from "@/lib/errors";
import {
  updateIssue,
  addComment,
  getLabels,
  isLinearConfigured,
} from "@/lib/connectors/linear";
import { createAuditLog } from "@/lib/db/repositories/audit";
import Anthropic from "@anthropic-ai/sdk";

interface TriageEventData {
  issueId: string;
  identifier: string | null;
  title: string;
  description: string;
  teamId: string | null;
  teamKey: string | null;
  stateType: string | null;
  url: string | null;
  labels: Array<{ id: string; name: string }>;
}

interface TriageResult {
  priority: number;
  labels: string[];
  reasoning: string;
}

export const triageLinearIssue = inngest.createFunction(
  {
    id: "triage-linear-issue",
    name: "AI Triage Linear Issue",
    retries: 2,
    concurrency: { limit: 5 },
    onFailure: async ({ error }) => {
      captureError(error, {
        tags: { source: "inngest", job: "triage-linear-issue" },
        level: "error",
      });
    },
  },
  { event: "linear/issue.triage" },
  async ({ event, step }) => {
    const data = event.data as TriageEventData;

    if (!isLinearConfigured()) {
      return { skipped: true, reason: "linear_not_configured" };
    }

    // Skip if issue already has labels (already triaged)
    if (data.labels && data.labels.length > 0) {
      return { skipped: true, reason: "already_has_labels" };
    }

    // Step 1: Fetch available labels for the team
    const availableLabels = await step.run("fetch-labels", async () => {
      return getLabels(data.teamId ?? undefined);
    });

    const labelNames = availableLabels.map((l) => l.name).join(", ");

    // Step 2: Classify with Claude Haiku
    const triage = await step.run("classify", async () => {
      const anthropic = new Anthropic();
      const response = await anthropic.messages.create({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 512,
        messages: [
          {
            role: "user",
            content: `You are an engineering manager triaging a new issue. Classify it.

Issue title: ${data.title}
Issue description: ${data.description || "(no description)"}
Team: ${data.teamKey ?? "unknown"}

Available labels: ${labelNames || "bug, feature, improvement, chore"}

Respond with ONLY valid JSON (no markdown, no code fences):
{
  "priority": <1-4 where 1=urgent 2=high 3=medium 4=low>,
  "labels": [<1-3 label names from the available labels that best fit>],
  "reasoning": "<1-2 sentence explanation>"
}`,
          },
        ],
      });

      const text =
        response.content[0].type === "text" ? response.content[0].text : "";

      try {
        return JSON.parse(text) as TriageResult;
      } catch {
        // Try to extract JSON from the response
        const match = text.match(/\{[\s\S]*\}/);
        if (match) {
          return JSON.parse(match[0]) as TriageResult;
        }
        throw new Error(`Failed to parse triage response: ${text.slice(0, 200)}`);
      }
    });

    // Step 3: Map label names to IDs
    const labelIds = await step.run("resolve-label-ids", async () => {
      const nameToId = new Map(
        availableLabels.map((l) => [l.name.toLowerCase(), l.id])
      );
      return triage.labels
        .map((name) => nameToId.get(name.toLowerCase()))
        .filter((id): id is string => !!id);
    });

    // Step 4: Apply triage to the issue via Linear API
    await step.run("apply-triage", async () => {
      const update: {
        priority?: number;
        labelIds?: string[];
      } = {};

      if (triage.priority >= 1 && triage.priority <= 4) {
        update.priority = triage.priority;
      }
      if (labelIds.length > 0) {
        update.labelIds = labelIds;
      }

      if (Object.keys(update).length > 0) {
        await updateIssue(data.issueId, update);
      }
    });

    // Step 5: Post reasoning as a comment
    await step.run("post-comment", async () => {
      const priorityLabels: Record<number, string> = {
        1: "Urgent",
        2: "High",
        3: "Medium",
        4: "Low",
      };
      const prioLabel = priorityLabels[triage.priority] ?? "None";
      const labelList =
        triage.labels.length > 0 ? triage.labels.join(", ") : "none";

      const body = [
        `**AI Triage** — Priority: ${prioLabel} | Labels: ${labelList}`,
        "",
        triage.reasoning,
      ].join("\n");

      await addComment(data.issueId, body);
    });

    // Step 6: Audit log
    await step.run("audit-log", async () => {
      await createAuditLog({
        actorId: "ai-triage",
        actorType: "agent",
        action: "linear.issue.triaged",
        entityType: "linear_issue",
        entityId: data.issueId,
        metadata: {
          identifier: data.identifier,
          title: data.title,
          priority: triage.priority,
          labels: triage.labels,
          reasoning: triage.reasoning,
        },
      });
    });

    return {
      issueId: data.issueId,
      identifier: data.identifier,
      priority: triage.priority,
      labels: triage.labels,
      reasoning: triage.reasoning,
    };
  }
);
