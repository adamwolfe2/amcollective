/**
 * Inngest Job — Embedding Pipeline
 *
 * Nightly job that generates embeddings for new/updated documents.
 * Embeds client data, project info, rocks, and meeting notes into pgvector
 * for RAG retrieval by the AM Agent chatbot.
 */

import { inngest } from "../client";
import { captureError } from "@/lib/errors";
import { storeEmbedding } from "@/lib/ai/embeddings";
import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { gt } from "drizzle-orm";

export const embedDocuments = inngest.createFunction(
  {
    id: "embed-documents",
    name: "Embed Documents for RAG",
    retries: 1,
    onFailure: async ({ error }) => {
      captureError(error, {
        tags: { source: "inngest", job: "embed-documents" },
        level: "error",
      });
    },
  },
  { cron: "0 3 * * *" }, // 3 AM UTC nightly
  async ({ step }) => {
    if (!process.env.OPENAI_API_KEY) {
      return { success: false, message: "OPENAI_API_KEY not configured" };
    }

    // Use 2-hour lookback — embedding every document touched in 24h is wasteful
    // for slow-changing entities. Recent messages still use 24h lookback.
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

    // Step 1: Fetch all entities in one step (5 parallel DB queries)
    const { clients, projects, rocks, meetings, recentMessages } = await step.run(
      "fetch-all-entities",
      async () => {
        const [c, p, r, m, msg] = await Promise.all([
          db.select().from(schema.clients).where(gt(schema.clients.updatedAt, twoHoursAgo)),
          db.select().from(schema.portfolioProjects).where(gt(schema.portfolioProjects.updatedAt, twoHoursAgo)),
          db.select().from(schema.rocks).where(gt(schema.rocks.updatedAt, twoHoursAgo)),
          db.select().from(schema.meetings).where(gt(schema.meetings.updatedAt, twoHoursAgo)),
          db.select().from(schema.messages).where(gt(schema.messages.createdAt, oneDayAgo)).limit(50),
        ]);
        return { clients: c, projects: p, rocks: r, meetings: m, recentMessages: msg };
      }
    );

    // Step 2: Embed all entities in one step (sequential within, not N separate steps)
    const embedded = await step.run("embed-all-entities", async () => {
      let count = 0;

      for (const client of clients) {
        const text = [
          `Client: ${client.name}`,
          client.companyName ? `Company: ${client.companyName}` : "",
          client.email ? `Email: ${client.email}` : "",
          client.notes ? `Notes: ${client.notes}` : "",
        ].filter(Boolean).join("\n");
        await storeEmbedding(text, "client_note", client.id, { name: client.name, type: "client_profile" });
        count++;
      }

      for (const project of projects) {
        const text = [
          `Project: ${project.name}`,
          `Status: ${project.status}`,
          `Slug: ${project.slug}`,
          project.githubRepo ? `Repo: ${project.githubRepo}` : "",
        ].filter(Boolean).join("\n");
        await storeEmbedding(text, "project_doc", project.id, { name: project.name, type: "project_profile" });
        count++;
      }

      for (const rock of rocks) {
        const text = [
          `Rock (Quarterly Goal): ${rock.title}`,
          rock.description ? `Description: ${rock.description}` : "",
          `Status: ${rock.status}`,
          `Quarter: ${rock.quarter}`,
          `Due: ${rock.dueDate ? String(rock.dueDate) : "not set"}`,
        ].filter(Boolean).join("\n");
        await storeEmbedding(text, "project_doc", rock.id, { title: rock.title, type: "rock" });
        count++;
      }

      for (const meeting of meetings) {
        const notes = meeting.notes as string | null;
        if (!notes || notes.length < 20) continue;
        const text = [
          `Meeting: ${meeting.title}`,
          `Status: ${meeting.status}`,
          meeting.scheduledAt ? `Scheduled: ${String(meeting.scheduledAt)}` : "",
          `Notes: ${notes.slice(0, 2000)}`,
        ].filter(Boolean).join("\n");
        await storeEmbedding(text, "project_doc", meeting.id, { title: meeting.title, type: "meeting_notes" });
        count++;
      }

      for (const msg of recentMessages) {
        if (!msg.body || msg.body.length < 30) continue;
        const text = [
          `Message (${msg.direction}) via ${msg.channel}`,
          msg.subject ? `Subject: ${msg.subject}` : "",
          `From: ${msg.from} → To: ${msg.to}`,
          `Content: ${msg.body.slice(0, 1500)}`,
        ].filter(Boolean).join("\n");
        await storeEmbedding(text, "client_note", msg.id, { type: "message", channel: msg.channel });
        count++;
      }

      return count;
    });

    return {
      success: true,
      embedded,
      breakdown: {
        clients: clients.length,
        projects: projects.length,
        rocks: rocks.length,
        meetings: meetings.length,
        messages: recentMessages.length,
      },
    };
  }
);
