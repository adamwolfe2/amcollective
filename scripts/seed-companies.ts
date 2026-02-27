/**
 * Seed companies table from companyTag enum values.
 *
 * Usage: npx tsx scripts/seed-companies.ts
 */

import { config } from "dotenv";
config({ path: ".env.local" });

import { db } from "../lib/db";
import * as schema from "../lib/db/schema";

const SEED_COMPANIES = [
  { slug: "am-collective", name: "AM Collective", companyTag: "am_collective" as const, domain: "amcollectivecapital.com" },
  { slug: "trackr", name: "Trackr", companyTag: "trackr" as const, domain: "trytrackr.com" },
  { slug: "wholesail", name: "Wholesail", companyTag: "wholesail" as const, domain: "wholesailhub.com" },
  { slug: "taskspace", name: "TaskSpace", companyTag: "taskspace" as const, domain: "trytaskspace.com" },
  { slug: "cursive", name: "Cursive", companyTag: "cursive" as const, domain: "meetcursive.com" },
  { slug: "tbgc", name: "TBGC", companyTag: "tbgc" as const, domain: null },
  { slug: "hook", name: "Hook", companyTag: "hook" as const, domain: "hookugc.com" },
  { slug: "personal", name: "Personal", companyTag: "personal" as const, domain: null },
  { slug: "untagged", name: "Untagged", companyTag: "untagged" as const, domain: null },
];

async function main() {
  console.log("Seeding companies table...\n");

  const results = await db
    .insert(schema.companies)
    .values(SEED_COMPANIES)
    .onConflictDoNothing({ target: schema.companies.companyTag })
    .returning();

  console.log(`Seeded ${results.length} new companies (${SEED_COMPANIES.length} total in enum).`);
  for (const c of results) {
    console.log(`  ${c.name} (${c.companyTag}) -- ${c.domain ?? "no domain"}`);
  }

  process.exit(0);
}

main().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
