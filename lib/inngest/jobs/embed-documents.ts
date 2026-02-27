/**
 * Inngest Job — Embedding Pipeline
 *
 * Nightly job that generates embeddings for new/updated documents.
 * Embeds client data, project info, rocks, and meeting notes into pgvector
 * for RAG retrieval by the AM Agent chatbot.
 */

import { inngest } from "../client";
import { storeEmbedding } from "@/lib/ai/embeddings";
import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { sql, gt } from "drizzle-orm";

export const embedDocuments = inngest.createFunction(
  {
    id: "embed-documents",
    name: "Embed Documents for RAG",
    retries: 1,
  },
  { cron: "0 3 * * *" }, // 3 AM UTC nightly
  async ({ step }) => {
    if (!process.env.OPENAI_API_KEY) {
      return { success: false, message: "OPENAI_API_KEY not configured" };
    }

    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    let embedded = 0;

    // Step 1: Embed client profiles
    const clients = await step.run("fetch-clients", async () => {
      return db
        .select()
        .from(schema.clients)
        .where(gt(schema.clients.updatedAt, oneDayAgo));
    });

    for (const client of clients) {
      await step.run(`embed-client-${client.id}`, async () => {
        const text = [
          `Client: ${client.name}`,
          client.companyName ? `Company: ${client.companyName}` : "",
          client.email ? `Email: ${client.email}` : "",
          client.notes ? `Notes: ${client.notes}` : "",
        ]
          .filter(Boolean)
          .join("\n");

        await storeEmbedding(text, "client_note", client.id, {
          name: client.name,
          type: "client_profile",
        });
        embedded++;
      });
    }

    // Step 2: Embed project descriptions
    const projects = await step.run("fetch-projects", async () => {
      return db
        .select()
        .from(schema.portfolioProjects)
        .where(gt(schema.portfolioProjects.updatedAt, oneDayAgo));
    });

    for (const project of projects) {
      await step.run(`embed-project-${project.id}`, async () => {
        const text = [
          `Project: ${project.name}`,
          `Status: ${project.status}`,
          `Slug: ${project.slug}`,
          project.githubRepo ? `Repo: ${project.githubRepo}` : "",
        ]
          .filter(Boolean)
          .join("\n");

        await storeEmbedding(text, "project_doc", project.id, {
          name: project.name,
          type: "project_profile",
        });
        embedded++;
      });
    }

    // Step 3: Embed rocks (quarterly goals)
    const rocks = await step.run("fetch-rocks", async () => {
      return db
        .select()
        .from(schema.rocks)
        .where(gt(schema.rocks.updatedAt, oneDayAgo));
    });

    for (const rock of rocks) {
      await step.run(`embed-rock-${rock.id}`, async () => {
        const text = [
          `Rock (Quarterly Goal): ${rock.title}`,
          rock.description ? `Description: ${rock.description}` : "",
          `Status: ${rock.status}`,
          `Quarter: ${rock.quarter}`,
          `Due: ${rock.dueDate ? String(rock.dueDate) : "not set"}`,
        ]
          .filter(Boolean)
          .join("\n");

        await storeEmbedding(text, "project_doc", rock.id, {
          title: rock.title,
          type: "rock",
        });
        embedded++;
      });
    }

    // Step 4: Embed recent meeting notes
    const meetings = await step.run("fetch-meetings", async () => {
      return db
        .select()
        .from(schema.meetings)
        .where(gt(schema.meetings.updatedAt, oneDayAgo));
    });

    for (const meeting of meetings) {
      await step.run(`embed-meeting-${meeting.id}`, async () => {
        const notes = meeting.notes as string | null;
        if (!notes || notes.length < 20) return;

        const text = [
          `Meeting: ${meeting.title}`,
          `Status: ${meeting.status}`,
          meeting.scheduledAt ? `Scheduled: ${String(meeting.scheduledAt)}` : "",
          `Notes: ${notes.slice(0, 2000)}`,
        ].filter(Boolean).join("\n");

        await storeEmbedding(text, "project_doc", meeting.id, {
          title: meeting.title,
          type: "meeting_notes",
        });
        embedded++;
      });
    }

    // Step 5: Embed recent messages for context
    const recentMessages = await step.run("fetch-messages", async () => {
      return db
        .select()
        .from(schema.messages)
        .where(gt(schema.messages.createdAt, oneDayAgo))
        .limit(50);
    });

    for (const msg of recentMessages) {
      await step.run(`embed-msg-${msg.id}`, async () => {
        if (!msg.body || msg.body.length < 30) return;

        const text = [
          `Message (${msg.direction}) via ${msg.channel}`,
          msg.subject ? `Subject: ${msg.subject}` : "",
          `From: ${msg.from} → To: ${msg.to}`,
          `Content: ${msg.body.slice(0, 1500)}`,
        ]
          .filter(Boolean)
          .join("\n");

        await storeEmbedding(text, "client_note", msg.id, {
          type: "message",
          channel: msg.channel,
        });
        embedded++;
      });
    }

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
