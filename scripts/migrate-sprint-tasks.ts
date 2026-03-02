/**
 * Sprint Task Backfill Script
 *
 * Migrates existing sprintTasks rows into canonical tasks + task_sprint_assignments.
 * Run AFTER deploying schema changes (run-sprint-migration.ts first).
 *
 * Usage:
 *   npx tsx scripts/migrate-sprint-tasks.ts           # live run
 *   npx tsx scripts/migrate-sprint-tasks.ts --dry-run  # preview only
 *
 * Guard: exits early if tasks with source='sprint' already exist (idempotent).
 */

import { config } from "dotenv";
config({ path: ".env.local" });

import { neon } from "@neondatabase/serverless";

const isDryRun = process.argv.includes("--dry-run");

async function main() {
  const sql = neon(process.env.DATABASE_URL!);

  console.log(`Sprint Task Backfill${isDryRun ? " (DRY RUN)" : ""}\n`);

  // ─── Guard: check if already run ─────────────────────────────────────────
  const [existing] = await sql`
    SELECT COUNT(*)::int AS count FROM tasks WHERE source = 'sprint'
  `;
  if (existing.count > 0) {
    console.log(`Guard: ${existing.count} tasks with source='sprint' already exist. Skipping.`);
    process.exit(0);
  }

  // ─── Load all sprint sections ─────────────────────────────────────────────
  const sections = await sql`
    SELECT
      ss.id,
      ss.sprint_id,
      ss.project_id,
      ss.assignee_id,
      ss.sort_order
    FROM sprint_sections ss
    ORDER BY ss.sprint_id, ss.sort_order
  `;

  console.log(`Found ${sections.length} sprint sections.`);

  let totalTasks = 0;
  let totalErrors = 0;

  if (isDryRun) {
    // Count tasks without doing inserts
    const [taskCount] = await sql`
      SELECT COUNT(*)::int AS count FROM sprint_tasks
    `;
    console.log(`\nDRY RUN: Would migrate ${taskCount.count} tasks across ${sections.length} sections.`);
    console.log("No changes made.");
    return;
  }

  // ─── Process each section ─────────────────────────────────────────────────
  for (const section of sections) {
    const sprintTasks = await sql`
      SELECT id, content, is_completed, sort_order, created_at, updated_at
      FROM sprint_tasks
      WHERE section_id = ${section.id}
      ORDER BY sort_order ASC
    `;

    for (const sprintTask of sprintTasks) {
      try {
        // Insert into tasks
        const [newTask] = await sql`
          INSERT INTO tasks (
            title, status, source,
            project_id, assignee_id,
            position, subtasks,
            completed_at, created_at, updated_at
          )
          VALUES (
            ${sprintTask.content},
            ${sprintTask.is_completed ? "done" : "todo"},
            'sprint',
            ${section.project_id ?? null},
            ${section.assignee_id ?? null},
            ${sprintTask.sort_order},
            '[]'::jsonb,
            ${sprintTask.is_completed ? (sprintTask.updated_at ?? new Date().toISOString()) : null},
            ${sprintTask.created_at},
            ${sprintTask.updated_at}
          )
          RETURNING id
        `;

        // Insert into task_sprint_assignments
        await sql`
          INSERT INTO task_sprint_assignments (
            task_id, sprint_id, section_id,
            added_at, sort_order
          )
          VALUES (
            ${newTask.id},
            ${section.sprint_id},
            ${section.id},
            ${sprintTask.created_at},
            ${sprintTask.sort_order}
          )
        `;

        totalTasks++;
      } catch (err) {
        console.error(`  Error migrating sprint_task ${sprintTask.id}:`, err);
        totalErrors++;
      }
    }
  }

  console.log(`\nMigration complete:`);
  console.log(`  Sections processed: ${sections.length}`);
  console.log(`  Tasks migrated:     ${totalTasks}`);
  console.log(`  Errors:             ${totalErrors}`);

  if (totalErrors > 0) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("Backfill failed:", err);
  process.exit(1);
});
