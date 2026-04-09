/**
 * One-off cleanup: Remove AIMS / Modern Amenities, Car Dealership Voice Agents,
 * and Ford Dealership Voice Agent Demo from the live database.
 *
 * Usage: npx tsx scripts/cleanup-aims-dealership.ts
 */
import { config } from "dotenv";
config({ path: ".env.local" });
config();

import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import * as schema from "../lib/db/schema";
import { eq, ilike, or } from "drizzle-orm";

const client = neon(process.env.DATABASE_URL!);
const db = drizzle({ client, schema });

async function cleanup() {
  console.log("Cleaning up AIMS / Dealership records from live DB...\n");

  // 1. Find matching leads
  const leads = await db
    .select({ id: schema.leads.id, companyName: schema.leads.companyName })
    .from(schema.leads)
    .where(
      or(
        ilike(schema.leads.companyName, "%AIMS%"),
        ilike(schema.leads.companyName, "%Modern Amenities%"),
        ilike(schema.leads.companyName, "%Car Dealership%"),
        ilike(schema.leads.companyName, "%Ford Dealership%"),
        ilike(schema.leads.companyName, "%Voice Agent%")
      )
    );

  console.log(`Found ${leads.length} leads to remove:`);
  for (const lead of leads) {
    console.log(`  - ${lead.companyName} (${lead.id})`);
  }

  // 2. Delete lead activities first (FK constraint)
  for (const lead of leads) {
    const deleted = await db
      .delete(schema.leadActivities)
      .where(eq(schema.leadActivities.leadId, lead.id))
      .returning();
    if (deleted.length > 0) {
      console.log(`  Deleted ${deleted.length} activities for ${lead.companyName}`);
    }
  }

  // 3. Delete the leads
  for (const lead of leads) {
    await db.delete(schema.leads).where(eq(schema.leads.id, lead.id));
    console.log(`  Deleted lead: ${lead.companyName}`);
  }

  // 4. Find and delete matching clients
  const clients = await db
    .select({ id: schema.clients.id, companyName: schema.clients.companyName })
    .from(schema.clients)
    .where(
      or(
        ilike(schema.clients.companyName, "%AIMS%"),
        ilike(schema.clients.companyName, "%Modern Amenities%")
      )
    );

  console.log(`\nFound ${clients.length} clients to remove:`);
  for (const c of clients) {
    console.log(`  - ${c.companyName} (${c.id})`);
  }

  // 5. Delete engagements for those clients
  for (const c of clients) {
    const deleted = await db
      .delete(schema.engagements)
      .where(eq(schema.engagements.clientId, c.id))
      .returning();
    if (deleted.length > 0) {
      console.log(`  Deleted ${deleted.length} engagements for ${c.companyName}`);
    }
  }

  // 6. Delete client-project links
  for (const c of clients) {
    const deleted = await db
      .delete(schema.clientProjects)
      .where(eq(schema.clientProjects.clientId, c.id))
      .returning();
    if (deleted.length > 0) {
      console.log(`  Deleted ${deleted.length} client-project links for ${c.companyName}`);
    }
  }

  // 7. Delete the clients
  for (const c of clients) {
    await db.delete(schema.clients).where(eq(schema.clients.id, c.id));
    console.log(`  Deleted client: ${c.companyName}`);
  }

  // 8. Delete "Full AIMS Package" service if it exists
  const services = await db
    .delete(schema.services)
    .where(ilike(schema.services.name, "%AIMS%"))
    .returning();
  if (services.length > 0) {
    console.log(`\nDeleted ${services.length} AIMS services`);
  }

  // 9. Delete AIMS portfolio project + team assignments
  const aimsProject = await db
    .select({ id: schema.portfolioProjects.id })
    .from(schema.portfolioProjects)
    .where(eq(schema.portfolioProjects.slug, "aims"));

  if (aimsProject.length > 0) {
    const projectId = aimsProject[0].id;
    const assignments = await db
      .delete(schema.teamAssignments)
      .where(eq(schema.teamAssignments.projectId, projectId))
      .returning();
    console.log(`\nDeleted ${assignments.length} AIMS team assignments`);

    await db
      .delete(schema.portfolioProjects)
      .where(eq(schema.portfolioProjects.id, projectId));
    console.log("Deleted AIMS portfolio project");
  }

  console.log("\nCleanup complete.");
  process.exit(0);
}

cleanup().catch((err) => {
  console.error("Cleanup failed:", err);
  process.exit(1);
});
