/**
 * Seed this week's action items into the open weekly sprint.
 *
 * Targets sprint b1563a20-e9f9-4478-8adc-0bdfd56bff32 ("3/30 Week Sprint").
 * Creates one section per venture/client, inserts tasks into the canonical
 * `tasks` table, and links them via `task_sprint_assignments`.
 *
 * Idempotent: skips tasks whose title is already present on the sprint.
 *
 * Run: pnpm exec tsx --env-file=.env.local scripts/seed-week-action-items.ts
 */

import { config } from "dotenv";
config({ path: ".env.local" });

import { db } from "../lib/db";
import * as schema from "../lib/db/schema";
import { and, eq, inArray } from "drizzle-orm";

const SPRINT_ID = "b1563a20-e9f9-4478-8adc-0bdfd56bff32";

// Project + client IDs from /scripts/dump-projects-clients-sprints.ts
const PROJECTS = {
  cursive: "a04a0260-d864-4d20-947c-ca9201aba4eb",
  myvsl: "0070a72f-9b10-4e8e-979b-1034a02ea719",
  leasestack: "286c14fd-fcca-43bb-b243-ff951d14ea0e",
  trackr: "3137f658-19ea-48fb-8da9-c89522c203eb",
  taskspace: "2f6f7811-8368-4b53-9d15-7b75a68456b2",
  wholesail: "55171bb1-ded3-418a-972d-8c26936a0fe7",
  tbgc: "cb2e3ffa-3aad-4d03-96d3-1c5e2e0dc1ca",
  hook: "b9855075-a9b2-4309-a8e3-2565d4295d8b",
  campusgtm: "dfcc7cd3-fe5e-496b-9e9d-9e191cd69c22",
} as const;

const CLIENTS = {
  justsearched: "f8cd528a-0c66-4e71-b944-effea2f19cdb",
  apropo: "5b77a7c5-123e-487c-96eb-2c032720d082",
  pitchandco: "baaecb12-b358-4f85-8e80-625c14b7d0bb",
  telegraph: "b6e8b5d6-f6e6-46c9-803f-411ec4ff466d",
  amcollective: "e5ff83c9-4cc0-4682-850f-da43100fccff",
  connor: "f39ed61f-0dc4-44fe-a8c6-149bd8ee1b56",
} as const;

interface ActionItem {
  title: string;
  /** "hot" → urgent, "medium" → medium. */
  priority: "urgent" | "high" | "medium";
  sectionName: string;
  projectId?: string;
  clientId?: string;
  companyTag?: typeof schema.companyTagEnum.enumValues[number];
  /** Pre-marked as done (e.g. items already shipped). */
  done?: boolean;
}

const ACTION_ITEMS: ActionItem[] = [
  // ─── HOT (urgent) ─────────────────────────────────────────────────────────
  {
    title: "Get LeaseStack contracts accepted by Norman",
    priority: "urgent",
    sectionName: "LeaseStack",
    projectId: PROJECTS.leasestack,
    companyTag: "leasestack",
  },
  {
    title:
      "Fully launch David Olander campaigns with the copy & offers from email + launch website visitor campaign",
    priority: "urgent",
    sectionName: "Client Outbound — David Olander",
    companyTag: "am_collective",
  },
  {
    title: "Mentor126 roadmap setup",
    priority: "urgent",
    sectionName: "Client Builds — Mentor126 & Astra",
    companyTag: "am_collective",
  },
  {
    title: "Astra onboarding session",
    priority: "urgent",
    sectionName: "Client Builds — Mentor126 & Astra",
    companyTag: "am_collective",
  },
  {
    title:
      "Meet with Bill Parish & Oliver for final website revisions — try to collect small payment + kick off research project",
    priority: "urgent",
    sectionName: "Client Builds — Bill Parish",
    companyTag: "am_collective",
  },
  {
    title: "Vend Scout v1 — full launch",
    priority: "urgent",
    sectionName: "Vend Scout",
    companyTag: "am_collective",
  },
  {
    title: "Vend Scout — Connor QA audit complete + all bugs fixed",
    priority: "urgent",
    sectionName: "Vend Scout",
    clientId: CLIENTS.connor,
    companyTag: "am_collective",
  },
  {
    title:
      "Vend Scout — demo video walkthrough for v1 (chop into snippets and upload)",
    priority: "urgent",
    sectionName: "Vend Scout",
    companyTag: "am_collective",
  },
  {
    title: "JustSearched — check in & respond on live campaigns",
    priority: "urgent",
    sectionName: "Client Campaigns — JustSearched",
    clientId: CLIENTS.justsearched,
    companyTag: "am_collective",
  },
  {
    title: "Apropo — launch campaign",
    priority: "urgent",
    sectionName: "Client Campaigns — Apropo",
    clientId: CLIENTS.apropo,
    companyTag: "am_collective",
  },
  {
    title: "Super Power Mentors (SPM) — respond to all open replies",
    priority: "urgent",
    sectionName: "Client Campaigns — SPM",
    projectId: PROJECTS.myvsl,
    companyTag: "myvsl",
  },
  {
    title: "Cursive — respond to all open campaign replies",
    priority: "urgent",
    sectionName: "Cursive",
    projectId: PROJECTS.cursive,
    companyTag: "cursive",
  },
  {
    title: "Prep all materials for Brett (lawyer) conversation",
    priority: "urgent",
    sectionName: "AM Collective — Legal/Ops",
    clientId: CLIENTS.amcollective,
    companyTag: "am_collective",
  },

  // ─── MEDIUM ───────────────────────────────────────────────────────────────
  {
    title: "Cursive — rewrite outbound copy",
    priority: "medium",
    sectionName: "Cursive",
    projectId: PROJECTS.cursive,
    companyTag: "cursive",
  },
  {
    title: "JustSearched — prep for Tuesday meeting",
    priority: "medium",
    sectionName: "Client Campaigns — JustSearched",
    clientId: CLIENTS.justsearched,
    companyTag: "am_collective",
  },
  {
    title:
      "Check in with Jericho about Soho House application — Maggie coming up Tuesday (otherwise Ritz)",
    priority: "medium",
    sectionName: "AM Collective — Legal/Ops",
    companyTag: "personal",
  },
  {
    title:
      "Get ALL incoming subscriptions & expenses on a calendar view to see month over month",
    priority: "medium",
    sectionName: "AM Collective — Finance Visibility",
    clientId: CLIENTS.amcollective,
    companyTag: "am_collective",
    done: true, // shipped — /finance/calendar
  },
  {
    title: "Check in with SG if not heard from by Wednesday",
    priority: "medium",
    sectionName: "AM Collective — Sales / Outreach",
    companyTag: "am_collective",
  },
  {
    title: "Fill out ACM form for ideal candidate",
    priority: "medium",
    sectionName: "AM Collective — Legal/Ops",
    companyTag: "am_collective",
  },
  {
    title: "Reach out to Mark about dental voice agents (new vertical opportunity)",
    priority: "medium",
    sectionName: "AM Collective — Sales / Outreach",
    companyTag: "am_collective",
  },
  {
    title:
      "Re-engage Contact Out with AudienceLab CTO's POC demo",
    priority: "medium",
    sectionName: "AM Collective — Sales / Outreach",
    companyTag: "am_collective",
  },
];

async function main() {
  console.log(`[seed-actions] Targeting sprint ${SPRINT_ID}`);

  // Verify sprint exists
  const [sprint] = await db
    .select({ id: schema.weeklySprints.id, title: schema.weeklySprints.title, closedAt: schema.weeklySprints.closedAt })
    .from(schema.weeklySprints)
    .where(eq(schema.weeklySprints.id, SPRINT_ID))
    .limit(1);

  if (!sprint) {
    console.error("[seed-actions] Sprint not found.");
    process.exit(1);
  }
  if (sprint.closedAt) {
    console.error("[seed-actions] Sprint is closed — refusing to write.");
    process.exit(1);
  }
  console.log(`[seed-actions] Sprint: "${sprint.title}"`);

  // ── Build section index ─────────────────────────────────────────────────
  const uniqueSections = Array.from(
    new Set(ACTION_ITEMS.map((i) => i.sectionName))
  );

  // Fetch existing sections on this sprint
  const existingSections = await db
    .select({
      id: schema.sprintSections.id,
      projectName: schema.sprintSections.projectName,
    })
    .from(schema.sprintSections)
    .where(eq(schema.sprintSections.sprintId, SPRINT_ID));

  const sectionMap = new Map<string, string>();
  for (const s of existingSections) sectionMap.set(s.projectName, s.id);

  let sortOrder = existingSections.length * 10;
  for (const sectionName of uniqueSections) {
    if (sectionMap.has(sectionName)) {
      console.log(`[seed-actions] § exists — ${sectionName}`);
      continue;
    }
    const itemWithProject = ACTION_ITEMS.find(
      (i) => i.sectionName === sectionName && i.projectId
    );
    const [created] = await db
      .insert(schema.sprintSections)
      .values({
        sprintId: SPRINT_ID,
        projectId: itemWithProject?.projectId ?? null,
        projectName: sectionName,
        sortOrder,
      })
      .returning({ id: schema.sprintSections.id });
    sectionMap.set(sectionName, created.id);
    sortOrder += 10;
    console.log(`[seed-actions] § created — ${sectionName}`);
  }

  // ── Fetch existing task titles already on this sprint (idempotency) ─────
  const existingAssignments = await db
    .select({
      taskId: schema.taskSprintAssignments.taskId,
    })
    .from(schema.taskSprintAssignments)
    .where(eq(schema.taskSprintAssignments.sprintId, SPRINT_ID));

  const existingTaskIds = existingAssignments.map((a) => a.taskId);
  let existingTitles = new Set<string>();
  if (existingTaskIds.length > 0) {
    const existingTasks = await db
      .select({ title: schema.tasks.title })
      .from(schema.tasks)
      .where(inArray(schema.tasks.id, existingTaskIds));
    existingTitles = new Set(existingTasks.map((t) => t.title));
  }

  // ── Insert tasks ────────────────────────────────────────────────────────
  let inserted = 0;
  let skipped = 0;
  let tsoSortOrder = 0;
  for (const item of ACTION_ITEMS) {
    if (existingTitles.has(item.title)) {
      console.log(`[seed-actions]   skip (exists): ${item.title}`);
      skipped++;
      continue;
    }
    const sectionId = sectionMap.get(item.sectionName);
    if (!sectionId) {
      console.warn(`[seed-actions] ! no section for ${item.title}`);
      continue;
    }

    const [task] = await db
      .insert(schema.tasks)
      .values({
        title: item.title,
        status: item.done ? "done" : "todo",
        priority: item.priority,
        projectId: item.projectId ?? null,
        clientId: item.clientId ?? null,
        companyTag: item.companyTag ?? "am_collective",
        source: "manual",
        createdById: "system:seed-week-action-items",
        completedAt: item.done ? new Date() : null,
      })
      .returning({ id: schema.tasks.id });

    await db.insert(schema.taskSprintAssignments).values({
      taskId: task.id,
      sprintId: SPRINT_ID,
      sectionId,
      sortOrder: tsoSortOrder,
    });

    tsoSortOrder += 10;
    inserted++;
    console.log(
      `[seed-actions]   + [${item.priority}${item.done ? ", DONE" : ""}] ${item.title}`
    );
  }

  console.log(
    `\n[seed-actions] Done. Inserted=${inserted}, Skipped=${skipped}, Sections=${uniqueSections.length}.`
  );
  process.exit(0);
}

main().catch((err) => {
  console.error("[seed-actions] Failed:", err);
  process.exit(1);
});
