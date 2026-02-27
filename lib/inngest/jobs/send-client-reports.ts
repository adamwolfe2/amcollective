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
import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { getClients } from "@/lib/db/repositories/clients";
import { sendClientStatusEmail } from "@/lib/email/client-status";
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
  { cron: "0 1 * * *" }, // 1 AM UTC = 5 PM PT
  async ({ step }) => {
    // Step 1: Get all clients with email
    const clients = await step.run("fetch-clients", async () => {
      const allClients = await getClients({ limit: 100 });
      return allClients.filter((c) => c.email);
    });

    if (clients.length === 0) {
      return { success: true, message: "No clients to send reports to" };
    }

    // Step 2: For each client, gather project data
    const results: Array<{ clientId: string; sent: boolean; error?: string }> =
      [];

    for (const client of clients) {
      const result = await step.run(
        `send-report-${client.id}`,
        async () => {
          // Get client's projects
          const clientProjects = await db
            .select({
              project: schema.portfolioProjects,
            })
            .from(schema.clientProjects)
            .innerJoin(
              schema.portfolioProjects,
              eq(schema.clientProjects.projectId, schema.portfolioProjects.id)
            )
            .where(eq(schema.clientProjects.clientId, client.id));

          if (clientProjects.length === 0) {
            return { clientId: client.id, sent: false, error: "No projects" };
          }

          // Build project context for Claude
          const projectSummaries = clientProjects.map((cp) => ({
            name: cp.project.name,
            status: cp.project.status,
          }));

          // Generate email with Claude Haiku
          const anthropic = getAnthropicClient();
          if (!anthropic) {
            return {
              clientId: client.id,
              sent: false,
              error: "Anthropic not configured",
            };
          }

          const completion = await anthropic.messages.create({
            model: "claude-haiku-4-5-20251001",
            max_tokens: 500,
            messages: [
              {
                role: "user",
                content: `Write a brief, professional HTML status email body for a client named ${client.name} (company: ${client.companyName || "N/A"}).

Their projects:
${JSON.stringify(projectSummaries, null, 2)}

Rules:
- 2-3 short paragraphs max
- Use <p> tags only (no headings, no lists)
- Professional but warm tone
- Mention each project by name with a brief status note
- End with "Reach out if you have any questions."
- Do NOT include greetings or signoffs (those are in the email template)
- Output ONLY the HTML, no markdown`,
              },
            ],
          });

          const bodyHtml =
            completion.content[0].type === "text"
              ? completion.content[0].text
              : "";

          // Send the email
          const today = new Date().toLocaleDateString("en-US", {
            month: "long",
            day: "numeric",
            year: "numeric",
          });

          await sendClientStatusEmail({
            to: client.email!,
            clientName: client.name,
            subject: `Project Status Update — ${today}`,
            bodyHtml,
          });

          // Record in messages table
          await db.insert(schema.messages).values({
            direction: "outbound",
            channel: "email",
            from: "team@amcollectivecapital.com",
            to: client.email!,
            subject: `Project Status Update — ${today}`,
            body: bodyHtml,
            clientId: client.id,
            threadId: `status-report-${client.id}-${new Date().toISOString().split("T")[0]}`,
          });

          await createAuditLog({
            actorId: "system",
            actorType: "system",
            action: "send_message",
            entityType: "client_status_report",
            entityId: client.id,
            metadata: {
              clientName: client.name,
              projectCount: clientProjects.length,
            },
          });

          return { clientId: client.id, sent: true };
        }
      );

      results.push(result);
    }

    return {
      success: true,
      sent: results.filter((r) => r.sent).length,
      skipped: results.filter((r) => !r.sent).length,
      results,
    };
  }
);
