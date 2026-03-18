/**
 * Seed MyVSL as a portfolio project in AM Collective.
 * Run: npx tsx --env-file=.env.local scripts/seed-myvsl.ts
 */

import { config } from "dotenv";
config({ path: ".env.local" });

import { db } from "../lib/db";
import * as schema from "../lib/db/schema";
import { eq } from "drizzle-orm";

async function seedMyVSL() {
  console.log("Adding MyVSL to portfolio projects...\n");

  // Check if already exists
  const [existing] = await db
    .select({ id: schema.portfolioProjects.id })
    .from(schema.portfolioProjects)
    .where(eq(schema.portfolioProjects.slug, "myvsl"));

  if (existing) {
    console.log("  MyVSL already exists, updating metadata...");
    await db
      .update(schema.portfolioProjects)
      .set({
        name: "MyVSL",
        domain: "getmyvsl.com",
        vercelProjectId: "prj_uHKjoISx4HVxRdSSVQUwnxPAzopj",
        githubRepo: "adamwolfe2/flowline",
        status: "active",
        productStage: "launched",
        description:
          "No-code VSL funnel builder — AI-generated quiz-to-calendar booking funnels with advanced analytics and scoring",
        targetMarket:
          "Course creators, coaches, and digital marketers running VSL funnels",
        monthlyGoalCents: 500000, // $5k/mo goal
        launchDate: new Date("2026-02-01"),
      })
      .where(eq(schema.portfolioProjects.id, existing.id));
    console.log("  ✓ MyVSL updated");
  } else {
    console.log("  Creating MyVSL project...");
    const [project] = await db
      .insert(schema.portfolioProjects)
      .values({
        name: "MyVSL",
        slug: "myvsl",
        domain: "getmyvsl.com",
        vercelProjectId: "prj_uHKjoISx4HVxRdSSVQUwnxPAzopj",
        githubRepo: "adamwolfe2/flowline",
        status: "active",
        healthScore: 80,
        productStage: "launched",
        description:
          "No-code VSL funnel builder — AI-generated quiz-to-calendar booking funnels with advanced analytics and scoring",
        targetMarket:
          "Course creators, coaches, and digital marketers running VSL funnels",
        monthlyGoalCents: 500000, // $5k/mo goal
        launchDate: new Date("2026-02-01"),
      })
      .returning();
    console.log(`  ✓ MyVSL created (id: ${project.id})`);
  }

  console.log("\nMyVSL Stripe Products (created earlier):");
  console.log("  Pro Monthly:    price_1TCEW5ExwpuzI9OqGXFt6SXG  ($49/mo)");
  console.log("  Pro Annual:     price_1TCEW5ExwpuzI9Oq8ExgNysV  ($468/yr)");
  console.log("  Agency Monthly: price_1TCEW6ExwpuzI9OqpXE69qDr  ($149/mo)");
  console.log("  Agency Annual:  price_1TCEW7ExwpuzI9Oq95gUlGHy  ($1,428/yr)");

  console.log("\nDone.");
  process.exit(0);
}

seedMyVSL().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
