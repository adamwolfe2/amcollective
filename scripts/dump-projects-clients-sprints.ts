/**
 * One-off dump: list projects, clients, recent sprints for action-item routing.
 * Run: pnpm exec tsx --env-file=.env.local scripts/dump-projects-clients-sprints.ts
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import { db } from "../lib/db";
import { portfolioProjects } from "../lib/db/schema/projects";
import { clients } from "../lib/db/schema/crm";
import { weeklySprints, sprintSections } from "../lib/db/schema/sprints";
import { desc, eq } from "drizzle-orm";

async function main() {
  const projs = await db
    .select({
      id: portfolioProjects.id,
      name: portfolioProjects.name,
      slug: portfolioProjects.slug,
    })
    .from(portfolioProjects);
  const cls = await db.select({ id: clients.id, name: clients.name }).from(clients);
  const sprints = await db
    .select({
      id: weeklySprints.id,
      weekOf: weeklySprints.weekOf,
      title: weeklySprints.title,
      closedAt: weeklySprints.closedAt,
    })
    .from(weeklySprints)
    .orderBy(desc(weeklySprints.weekOf))
    .limit(5);

  console.log(`PROJECTS (${projs.length}):`);
  for (const p of projs) console.log(`  - ${p.name} | slug=${p.slug} | ${p.id}`);

  console.log(`\nCLIENTS (${cls.length}):`);
  for (const c of cls) console.log(`  - ${c.name} | ${c.id}`);

  console.log(`\nRECENT SPRINTS:`);
  for (const s of sprints) {
    console.log(`  - week_of=${s.weekOf} | "${s.title}" | ${s.closedAt ? "CLOSED" : "OPEN"} | ${s.id}`);
    const sections = await db
      .select({ id: sprintSections.id, projectName: sprintSections.projectName })
      .from(sprintSections)
      .where(eq(sprintSections.sprintId, s.id));
    for (const sec of sections) console.log(`      § ${sec.projectName} | ${sec.id}`);
  }

  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
