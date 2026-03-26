/**
 * Inngest Job — Send Client Status Reports
 *
 * Runs daily at 5 PM PT (midnight UTC). Generates status emails per client
 * using Claude Haiku to write natural language summaries.
 *
 * Adapted from Session 4 plan — uses existing clients/projects repos + Resend.
 */

import { inngest } from "../client";
import { captureError } from "@/lib/errors";
import Anthropic from "@anthropic-ai/sdk";
import { trackAIUsage } from "@/lib/ai/client";
import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { eq, inArray } from "drizzle-orm";
import { getClients } from "@/lib/db/repositories/clients";
import { sendClientStatusEmail } from "@/lib/email/client-status";
import { FROM_EMAIL } from "@/lib/email/shared";
import { createAuditLog } from "@/lib/db/repositories/audit";

function getAnthropicClient() {
  if (!process.env.ANTHROPIC_API_KEY) return null;
  return new Anthropic();
}

export const sendClientReports = inngest.createFunction(
  {
    id: "send-client-reports",
    name: "Send Client Status Reports",
    retries: 2,
    onFailure: async ({ error }) => {
      captureError(error, {
        tags: { source: "inngest", job: "send-client-reports" },
        level: "error",
      });
    },
  },
  { cron: "0 1 * * 1,3,5" }, // MWF at 1 AM UTC = 5 PM PT (saves ~60% AI + email costs)
  async ({ step }) => {
    // Step 1: Get all clients with email
    const clients = await step.run("fetch-clients", async () => {
      const allClients = await getClients({ limit: 100 });
      return allClients.filter((c) => c.email);
    });

    if (clients.length === 0) {
      return { success: true, message: "No clients to send reports to" };
    }

    // Step 2: Fetch all client project data in a single batched query
    const clientContexts = await step.run("fetch-all-project-data", async () => {
      const clientIds = clients.map((c) => c.id);

      const allClientProjects = await db
        .select({
          clientId: schema.clientProjects.clientId,
          project: schema.portfolioProjects,
        })
        .from(schema.clientProjects)
        .innerJoin(
          schema.portfolioProjects,
          eq(schema.clientProjects.projectId, schema.portfolioProjects.id)
        )
        .where(inArray(schema.clientProjects.clientId, clientIds));

      // Group by clientId in application code
      const projectsByClient = new Map<string, Array<{ name: string; status: string }>>();
      for (const row of allClientProjects) {
        const list = projectsByClient.get(row.clientId) ?? [];
        list.push({ name: row.project.name, status: row.project.status });
        projectsByClient.set(row.clientId, list);
      }

      return clients.map((client) => ({
        clientId: client.id,
        name: client.name,
        email: client.email,
        companyName: client.companyName,
        projects: projectsByClient.get(client.id) ?? [],
      }));
    });

    const eligibleClients = clientContexts.filter((c) => c.projects.length > 0);

    // Step 3: Single batched AI call for all email bodies
    const emailBodies = await step.run("generate-all-email-bodies", async () => {
      const anthropic = getAnthropicClient();
      if (!anthropic || eligibleClients.length === 0) return {} as Record<string, string>;

      const clientList = eligibleClients
        .map(
          (c) =>
            `CLIENT_ID:${c.clientId}\nName: ${c.name} (${c.companyName || "N/A"})\nProjects: ${c.projects.map((p) => `${p.name} (${p.status})`).join(", ")}`
        )
        .join("\n\n");

      const completion = await anthropic.messages.create({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 350 * eligibleClients.length,
        messages: [
          {
            role: "user",
            content: `Write a brief, professional HTML status email body for each client below. Return ONLY a JSON object mapping CLIENT_ID to HTML string.

Rules per email:
- 2-3 short paragraphs max, use <p> tags only
- Professional but warm tone, mention each project by name with a brief status note
- End with "Reach out if you have any questions."
- No greetings or signoffs (those are in the template)

Clients:
${clientList}

Return format: {"<CLIENT_ID>": "<html>", ...}`,
          },
        ],
      });

      trackAIUsage({ model: "claude-haiku-4-5-20251001", inputTokens: completion.usage.input_tokens, outputTokens: completion.usage.output_tokens, agent: "send-client-reports" });

      try {
        const text = completion.content[0].type === "text" ? completion.content[0].text : "{}";
        return JSON.parse(text) as Record<string, string>;
      } catch {
        return {} as Record<string, string>;
      }
    });

    // Step 4: Send all emails and record
    const results = await step.run("send-all-emails", async () => {
      const today = new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
      const sent: Array<{ clientId: string; sent: boolean; error?: string }> = [];

      for (const client of eligibleClients) {
        const bodyHtml = emailBodies[client.clientId];
        if (!bodyHtml) {
          sent.push({ clientId: client.clientId, sent: false, error: "No AI body generated" });
          continue;
        }

        await sendClientStatusEmail({
          to: client.email!,
          clientName: client.name,
          subject: `Project Status Update — ${today}`,
          bodyHtml,
        });

        await db.insert(schema.messages).values({
          direction: "outbound",
          channel: "email",
          from: FROM_EMAIL,
          to: client.email!,
          subject: `Project Status Update — ${today}`,
          body: bodyHtml,
          clientId: client.clientId,
          threadId: `status-report-${client.clientId}-${new Date().toISOString().split("T")[0]}`,
        });

        await createAuditLog({
          actorId: "system",
          actorType: "system",
          action: "send_message",
          entityType: "client_status_report",
          entityId: client.clientId,
          metadata: { clientName: client.name, projectCount: client.projects.length },
        });

        sent.push({ clientId: client.clientId, sent: true });
      }

      const skipped = clientContexts
        .filter((c) => c.projects.length === 0)
        .map((c) => ({ clientId: c.clientId, sent: false, error: "No projects" }));

      return [...sent, ...skipped];
    });

    return {
      success: true,
      sent: results.filter((r) => r.sent).length,
      skipped: results.filter((r) => !r.sent).length,
      results,
    };
  }
);
