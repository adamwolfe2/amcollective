/**
 * Sprint Task Backfill — Force Run
 *
 * Same as migrate-sprint-tasks.ts but bypasses the "already run" guard.
 * Skips sprint_tasks that already have a matching task_sprint_assignment
 * (matched by content + section_id) to stay idempotent.
 *
 * Usage: npx tsx scripts/migrate-sprint-tasks-force.ts [--dry-run]
 */

import { config } from "dotenv";
config({ path: ".env.local" });

import { neon } from "@neondatabase/serverless";

const isDryRun = process.argv.includes("--dry-run");

async function main() {
  const sql = neon(process.env.DATABASE_URL!);

  console.log(`Sprint Task Force Backfill${isDryRun ? " (DRY RUN)" : ""}\n`);

  // Count already-migrated sprint_tasks (matched by content + section)
  const [alreadyMigrated] = await sql`
    SELECT COUNT(*)::int AS count
    FROM sprint_tasks st
    WHERE EXISTS (
      SELECT 1 FROM task_sprint_assignments tsa
      INNER JOIN tasks t ON tsa.task_id = t.id
      WHERE t.title = st.content AND tsa.section_id = st.section_id
    )
  `;

  // Count unmigrated
  const [toMigrate] = await sql`
    SELECT COUNT(*)::int AS count
    FROM sprint_tasks st
    WHERE NOT EXISTS (
      SELECT 1 FROM task_sprint_assignments tsa
      INNER JOIN tasks t ON tsa.task_id = t.id
      WHERE t.title = st.content AND tsa.section_id = st.section_id
    )
  `;

  console.log(`Already migrated:  ${alreadyMigrated.count}`);
  console.log(`To migrate:        ${toMigrate.count}\n`);

  if (toMigrate.count === 0) {
    console.log("Nothing to migrate. All sprint_tasks are already in the new system.");
    return;
  }

  // Load sections
  const sections = await sql`
    SELECT id, sprint_id, project_id, assignee_id, sort_order
    FROM sprint_sections
    ORDER BY sprint_id, sort_order
  `;

  if (isDryRun) {
    console.log(`DRY RUN: Would process ${sections.length} sections.`);
    console.log("No changes made.");
    return;
  }

  let totalTasks = 0;
  let skipped = 0;
  let totalErrors = 0;

  for (const section of sections) {
    const sprintTasks = await sql`
      SELECT id, content, is_completed, sort_order, created_at, updated_at
      FROM sprint_tasks
      WHERE section_id = ${section.id}
      ORDER BY sort_order ASC
    `;

    for (const st of sprintTasks) {
      // Skip if already migrated
      const [exists] = await sql`
        SELECT 1 FROM task_sprint_assignments tsa
        INNER JOIN tasks t ON tsa.task_id = t.id
        WHERE t.title = ${st.content} AND tsa.section_id = ${section.id}
        LIMIT 1
      `;
      if (exists) {
        skipped++;
        continue;
      }

      try {
        const [newTask] = await sql`
          INSERT INTO tasks (
            title, status, source,
            project_id, assignee_id,
            position, subtasks,
            completed_at, created_at, updated_at
          )
          VALUES (
            ${st.content},
            ${st.is_completed ? "done" : "todo"},
            'sprint',
            ${section.project_id ?? null},
            ${section.assignee_id ?? null},
            ${st.sort_order},
            '[]'::jsonb,
            ${st.is_completed ? (st.updated_at ?? new Date().toISOString()) : null},
            ${st.created_at},
            ${st.updated_at}
          )
          RETURNING id
        `;

        await sql`
          INSERT INTO task_sprint_assignments (
            task_id, sprint_id, section_id,
            added_at, sort_order
          )
          VALUES (
            ${newTask.id},
            ${section.sprint_id},
            ${section.id},
            ${st.created_at},
            ${st.sort_order}
          )
        `;

        totalTasks++;
      } catch (err) {
        console.error(`  Error migrating sprint_task ${st.id}:`, err);
        totalErrors++;
      }
    }
  }

  console.log(`\nMigration complete:`);
  console.log(`  Sections:      ${sections.length}`);
  console.log(`  Migrated:      ${totalTasks}`);
  console.log(`  Skipped:       ${skipped}`);
  console.log(`  Errors:        ${totalErrors}`);

  if (totalErrors > 0) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("Force backfill failed:", err);
  process.exit(1);
});
