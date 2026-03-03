/**
 * Inngest Job — One-Time Embedding Backfill
 *
 * Embeds ALL existing operational data into pgvector — no time filter.
 * Run once to bootstrap the knowledge base before Phase 2 RAG retrieval.
 *
 * Trigger manually: POST to Inngest with event "system/backfill-embeddings"
 * Self-guards: checks bot_memory for "backfill_complete" before running.
 * Set force=true in the event data to re-run regardless.
 *
 * Chunks operational data intelligently:
 *   - Tasks: grouped per portfolio project (one chunk per project)
 *   - Sprint sections: each section + its tasks as one chunk
 *   - ai_messages: individual conversation messages
 *   - Everything else: individual records
 */

import { inngest } from "../client";
import { captureError } from "@/lib/errors";
import { storeEmbedding } from "@/lib/ai/embeddings";
import { setMemory, getMemory } from "@/lib/db/repositories/bot-memory";
import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { eq, desc, isNotNull, inArray } from "drizzle-orm";

export const backfillEmbeddings = inngest.createFunction(
  {
    id: "backfill-embeddings",
    name: "Backfill Embeddings (One-Time)",
    retries: 1,
    onFailure: async ({ error }) => {
      captureError(error, {
        tags: { source: "inngest", job: "backfill-embeddings" },
        level: "error",
      });
    },
  },
  { event: "system/backfill-embeddings" },
  async ({ event, step }) => {
    if (!process.env.OPENAI_API_KEY) {
      return { success: false, message: "OPENAI_API_KEY not configured" };
    }

    // Guard: skip if already run (unless forced)
    const force = (event.data as Record<string, unknown>)?.force === true;
    const alreadyDone = await getMemory("backfill_complete");
    if (alreadyDone && !force) {
      return { success: false, message: "Backfill already completed. Pass force=true to re-run." };
    }

    // ── Step 1: Fetch everything ────────────────────────────────────────────
    const {
      clients, projects, rocks, meetings, messages,
      tasks, sprintSections, documents, aiMessages,
    } = await step.run("fetch-all", async () => {
      const [c, p, r, m, msg, t, ss, docs, ai] = await Promise.all([
        db.select().from(schema.clients),
        db.select().from(schema.portfolioProjects),
        db.select().from(schema.rocks),
        db.select().from(schema.meetings),
        db.select().from(schema.messages).limit(200),
        // Tasks with project info — limit to non-archived
        db
          .select({
            id: schema.tasks.id,
            title: schema.tasks.title,
            status: schema.tasks.status,
            projectId: schema.tasks.projectId,
            description: schema.tasks.description,
          })
          .from(schema.tasks)
          .where(eq(schema.tasks.isArchived, false))
          .orderBy(desc(schema.tasks.updatedAt))
          .limit(500),
        // Sprint sections with sprint title
        db
          .select({
            id: schema.sprintSections.id,
            projectName: schema.sprintSections.projectName,
            goal: schema.sprintSections.goal,
            sprintId: schema.sprintSections.sprintId,
            assigneeName: schema.sprintSections.assigneeName,
          })
          .from(schema.sprintSections),
        db.select().from(schema.documents).where(isNotNull(schema.documents.content)),
        db
          .select({
            id: schema.aiMessages.id,
            role: schema.aiMessages.role,
            content: schema.aiMessages.content,
            conversationId: schema.aiMessages.conversationId,
            createdAt: schema.aiMessages.createdAt,
          })
          .from(schema.aiMessages)
          .orderBy(desc(schema.aiMessages.createdAt))
          .limit(200),
      ]);
      return { clients: c, projects: p, rocks: r, meetings: m, messages: msg,
               tasks: t, sprintSections: ss, documents: docs, aiMessages: ai };
    });

    // ── Step 2: Embed clients, projects, rocks, meetings ────────────────────
    const count1 = await step.run("embed-core", async () => {
      let n = 0;
      for (const client of clients) {
        const text = [
          `Client: ${client.name}`,
          client.companyName ? `Company: ${client.companyName}` : "",
          client.email ? `Email: ${client.email}` : "",
          client.notes ? `Notes: ${client.notes}` : "",
        ].filter(Boolean).join("\n");
        await storeEmbedding(text, "client_note", client.id, { type: "client_profile", name: client.name });
        n++;
      }
      for (const project of projects) {
        const text = [
          `Portfolio Project: ${project.name}`,
          `Status: ${project.status}`,
          `Slug: ${project.slug}`,
          project.githubRepo ? `GitHub: ${project.githubRepo}` : "",
        ].filter(Boolean).join("\n");
        await storeEmbedding(text, "project_doc", project.id, { type: "project_profile", name: project.name });
        n++;
      }
      for (const rock of rocks) {
        const text = [
          `Quarterly Rock (Goal): ${rock.title}`,
          rock.description ? `Description: ${rock.description}` : "",
          `Status: ${rock.status}`,
          `Quarter: ${rock.quarter}`,
          `Due: ${rock.dueDate ? String(rock.dueDate) : "not set"}`,
        ].filter(Boolean).join("\n");
        await storeEmbedding(text, "project_doc", rock.id, { type: "rock", status: rock.status });
        n++;
      }
      for (const meeting of meetings) {
        const notes = meeting.notes as string | null;
        if (!notes || notes.length < 20) continue;
        const text = [
          `Meeting: ${meeting.title}`,
          `Status: ${meeting.status}`,
          meeting.scheduledAt ? `Date: ${String(meeting.scheduledAt)}` : "",
          `Notes: ${notes.slice(0, 2000)}`,
        ].filter(Boolean).join("\n");
        await storeEmbedding(text, "meeting", meeting.id, { type: "meeting_notes", title: meeting.title });
        n++;
      }
      return n;
    });

    // ── Step 3: Embed tasks grouped by project ──────────────────────────────
    const count2 = await step.run("embed-tasks", async () => {
      // Group tasks by projectId (null = unassigned)
      const byProject = new Map<string, typeof tasks>();
      for (const task of tasks) {
        const key = task.projectId ?? "unassigned";
        if (!byProject.has(key)) byProject.set(key, []);
        byProject.get(key)!.push(task);
      }

      // Build project name lookup
      const projectNameMap = new Map(projects.map((p) => [p.id, p.name]));

      let n = 0;
      for (const [projectId, projectTasks] of byProject.entries()) {
        const projectName = projectNameMap.get(projectId) ?? "Unassigned";
        const taskLines = projectTasks
          .slice(0, 50) // cap per group
          .map((t) => `  [${t.status}] ${t.title}${t.description ? ": " + t.description.slice(0, 100) : ""}`)
          .join("\n");
        const text = `Project: ${projectName}\nTasks (${projectTasks.length} total):\n${taskLines}`;
        await storeEmbedding(text, "project_doc", `tasks:${projectId}`, {
          type: "task_group",
          projectName,
          count: projectTasks.length,
        });
        n++;
      }
      return n;
    });

    // ── Step 4: Embed sprint sections ───────────────────────────────────────
    const count3 = await step.run("embed-sprints", async () => {
      if (sprintSections.length === 0) return 0;

      // Get sprint titles
      const sprintIds = [...new Set(sprintSections.map((s) => s.sprintId))];
      const sprints = await db
        .select({ id: schema.weeklySprints.id, title: schema.weeklySprints.title, weeklyFocus: schema.weeklySprints.weeklyFocus })
        .from(schema.weeklySprints)
        .where(inArray(schema.weeklySprints.id, sprintIds));
      const sprintMap = new Map(sprints.map((s) => [s.id, s]));

      // Get legacy sprint tasks grouped by section
      const allSprintTasks = await db
        .select({ sectionId: schema.sprintTasks.sectionId, content: schema.sprintTasks.content, isCompleted: schema.sprintTasks.isCompleted })
        .from(schema.sprintTasks);
      const tasksBySectionId = new Map<string, typeof allSprintTasks>();
      for (const t of allSprintTasks) {
        if (!tasksBySectionId.has(t.sectionId)) tasksBySectionId.set(t.sectionId, []);
        tasksBySectionId.get(t.sectionId)!.push(t);
      }

      let n = 0;
      for (const section of sprintSections) {
        const sprint = sprintMap.get(section.sprintId);
        const sectionTasks = tasksBySectionId.get(section.id) ?? [];
        const taskLines = sectionTasks
          .map((t) => `  [${t.isCompleted ? "done" : "open"}] ${t.content}`)
          .join("\n");
        const text = [
          `Sprint: ${sprint?.title ?? "Unknown Sprint"}${sprint?.weeklyFocus ? ` — focus: ${sprint.weeklyFocus}` : ""}`,
          `Section: @${section.projectName}${section.assigneeName ? ` (${section.assigneeName})` : ""}`,
          section.goal ? `Goal: ${section.goal}` : "",
          sectionTasks.length > 0 ? `Tasks:\n${taskLines}` : "No tasks yet",
        ].filter(Boolean).join("\n");
        await storeEmbedding(text, "project_doc", `sprint-section:${section.id}`, {
          type: "sprint_section",
          projectName: section.projectName,
          sprintTitle: sprint?.title,
        });
        n++;
      }
      return n;
    });

    // ── Step 5: Embed documents + messages ─────────────────────────────────
    const count4 = await step.run("embed-docs-messages", async () => {
      let n = 0;
      for (const doc of documents) {
        const content = doc.content as string | null;
        if (!content || content.length < 30) continue;
        const text = [
          `Document: ${doc.title}`,
          `Type: ${doc.docType}`,
          `Content: ${content.slice(0, 2000)}`,
        ].join("\n");
        await storeEmbedding(text, "sop", doc.id, { type: "document", docType: doc.docType, title: doc.title });
        n++;
      }
      for (const msg of messages) {
        if (!msg.body || msg.body.length < 30) continue;
        const text = [
          `Message (${msg.direction}) via ${msg.channel}`,
          msg.subject ? `Subject: ${msg.subject}` : "",
          `Content: ${msg.body.slice(0, 1500)}`,
        ].filter(Boolean).join("\n");
        await storeEmbedding(text, "client_note", msg.id, { type: "message", channel: msg.channel });
        n++;
      }
      return n;
    });

    // ── Step 6: Embed ai_messages (conversation history) ───────────────────
    const count5 = await step.run("embed-conversations", async () => {
      let n = 0;
      for (const msg of aiMessages) {
        if (!msg.content || msg.content.length < 10) continue;
        const dateStr = msg.createdAt ? new Date(msg.createdAt).toISOString().split("T")[0] : "unknown";
        const text = `[${msg.role}] ${dateStr}\n${msg.content.slice(0, 600)}`;
        await storeEmbedding(text, "conversation", `ai-msg:${msg.id}`, {
          type: "conversation",
          role: msg.role,
          conversationId: msg.conversationId,
          timestamp: msg.createdAt ? new Date(msg.createdAt).toISOString() : null,
        });
        n++;
      }
      return n;
    });

    // ── Step 7: Mark complete ───────────────────────────────────────────────
    const total = count1 + count2 + count3 + count4 + count5;
    await step.run("mark-complete", async () => {
      await setMemory(
        "backfill_complete",
        `Completed ${new Date().toISOString()} — ${total} embeddings stored`,
        "system",
        "system"
      );
    });

    return { success: true, total, breakdown: { core: count1, tasks: count2, sprints: count3, docs: count4, conversations: count5 } };
  }
);
