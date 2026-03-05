/**
 * Seed product lifecycle metadata for all 6 portfolio projects.
 * Run: npx tsx --env-file=.env.local scripts/seed-product-metadata.ts
 */

import { config } from "dotenv";
config({ path: ".env.local" });

import { db } from "../lib/db";
import * as schema from "../lib/db/schema";
import { eq } from "drizzle-orm";

const PRODUCT_METADATA: Array<{
  slug: string;
  launchDate: Date | null;
  productStage: string;
  description: string;
  targetMarket: string;
  monthlyGoalCents: number;
}> = [
  {
    slug: "trackr",
    launchDate: new Date("2025-10-01"),
    productStage: "launched",
    description: "AI tool intelligence layer — research, spend tracking, AI news digest, recommendations",
    targetMarket: "Marketing teams and AI-heavy companies",
    monthlyGoalCents: 500000, // $5k/mo goal
  },
  {
    slug: "taskspace",
    launchDate: new Date("2025-11-01"),
    productStage: "launched",
    description: "Internal team management and EOS accountability platform",
    targetMarket: "EOS-adopting companies and accountability-driven teams",
    monthlyGoalCents: 300000, // $3k/mo goal
  },
  {
    slug: "wholesail",
    launchDate: new Date("2025-12-01"),
    productStage: "launched",
    description: "White-label B2B distribution portal template and marketing intake site",
    targetMarket: "B2B distributors and wholesale operators",
    monthlyGoalCents: 800000, // $8k/mo goal
  },
  {
    slug: "cursive",
    launchDate: new Date("2025-10-01"),
    productStage: "launched",
    description: "Multi-tenant SaaS lead marketplace platform",
    targetMarket: "Lead generation agencies and performance marketers",
    monthlyGoalCents: 1000000, // $10k/mo goal
  },
  {
    slug: "tbgc",
    launchDate: null,
    productStage: "building",
    description: "Custom B2B wholesale ordering portal and client management system for luxury food distributors",
    targetMarket: "Luxury food distributors and premium wholesale operators",
    monthlyGoalCents: 200000, // $2k/mo goal post-launch
  },
  {
    slug: "hook",
    launchDate: new Date("2025-09-01"),
    productStage: "beta",
    description: "AI-powered viral content platform — content gen, UGC campaigns, competitor intel, hook library",
    targetMarket: "DTC brands and content marketing teams",
    monthlyGoalCents: 500000, // $5k/mo goal
  },
];

async function seedProductMetadata() {
  console.log("Seeding product metadata for 6 portfolio projects...");

  for (const meta of PRODUCT_METADATA) {
    const [project] = await db
      .select({ id: schema.portfolioProjects.id, name: schema.portfolioProjects.name })
      .from(schema.portfolioProjects)
      .where(eq(schema.portfolioProjects.slug, meta.slug));

    if (!project) {
      console.warn(`  [SKIP] No project found with slug: ${meta.slug}`);
      continue;
    }

    await db
      .update(schema.portfolioProjects)
      .set({
        launchDate: meta.launchDate,
        productStage: meta.productStage,
        description: meta.description,
        targetMarket: meta.targetMarket,
        monthlyGoalCents: meta.monthlyGoalCents,
      })
      .where(eq(schema.portfolioProjects.id, project.id));

    console.log(`  [OK] ${project.name} (${meta.slug}) → stage=${meta.productStage}, launched=${meta.launchDate?.toISOString().split("T")[0] ?? "not yet"}`);
  }

  console.log("\nDone seeding product metadata.");
  process.exit(0);
}

seedProductMetadata().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
