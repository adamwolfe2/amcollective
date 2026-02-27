/**
 * Seed script for subscription_costs table.
 *
 * Run: npx tsx scripts/seed-costs.ts
 *
 * Seeds real AM Collective SaaS tool costs.
 */

import { config } from "dotenv";
config({ path: ".env.local" });

import { db } from "../lib/db";
import * as schema from "../lib/db/schema";

const COSTS = [
  // Infrastructure
  { name: "Vercel Pro", vendor: "Vercel", companyTag: "am_collective" as const, amount: 2000, billingCycle: "monthly", category: "infrastructure", nextRenewal: "2026-03-15" },
  { name: "Neon Pro", vendor: "Neon", companyTag: "am_collective" as const, amount: 1900, billingCycle: "monthly", category: "infrastructure", nextRenewal: "2026-03-01" },
  { name: "Upstash Redis", vendor: "Upstash", companyTag: "am_collective" as const, amount: 1000, billingCycle: "monthly", category: "infrastructure", nextRenewal: "2026-03-01" },
  { name: "Doppler Starter", vendor: "Doppler", companyTag: "am_collective" as const, amount: 0, billingCycle: "monthly", category: "infrastructure" },

  // AI
  { name: "Anthropic API", vendor: "Anthropic", companyTag: "am_collective" as const, amount: 5000, billingCycle: "monthly", category: "ai" },
  { name: "OpenAI API", vendor: "OpenAI", companyTag: "am_collective" as const, amount: 2000, billingCycle: "monthly", category: "ai" },

  // Auth & Email
  { name: "Clerk Pro", vendor: "Clerk", companyTag: "am_collective" as const, amount: 2500, billingCycle: "monthly", category: "auth", nextRenewal: "2026-03-01" },
  { name: "Resend Pro", vendor: "Resend", companyTag: "am_collective" as const, amount: 2000, billingCycle: "monthly", category: "email", nextRenewal: "2026-03-15" },

  // Monitoring
  { name: "Sentry Team", vendor: "Sentry", companyTag: "am_collective" as const, amount: 2600, billingCycle: "monthly", category: "monitoring", nextRenewal: "2026-03-01" },
  { name: "PostHog Cloud", vendor: "PostHog", companyTag: "am_collective" as const, amount: 0, billingCycle: "monthly", category: "monitoring" },

  // Security
  { name: "ArcJet Pro", vendor: "ArcJet", companyTag: "am_collective" as const, amount: 0, billingCycle: "monthly", category: "security" },

  // Payments
  { name: "Stripe (usage-based)", vendor: "Stripe", companyTag: "am_collective" as const, amount: 0, billingCycle: "monthly", category: "payments", notes: "2.9% + 30c per transaction" },

  // Background Jobs
  { name: "Inngest Pro", vendor: "Inngest", companyTag: "am_collective" as const, amount: 0, billingCycle: "monthly", category: "infrastructure" },

  // Per-project costs
  { name: "Firecrawl API", vendor: "Firecrawl", companyTag: "trackr" as const, amount: 1900, billingCycle: "monthly", category: "ai" },
  { name: "Tavily API", vendor: "Tavily", companyTag: "trackr" as const, amount: 0, billingCycle: "monthly", category: "ai", notes: "Free tier" },
  { name: "Bloo.io Messaging", vendor: "Bloo.io", companyTag: "tbgc" as const, amount: 4900, billingCycle: "monthly", category: "messaging", nextRenewal: "2026-03-01" },
  { name: "HeyGen API", vendor: "HeyGen", companyTag: "hook" as const, amount: 2900, billingCycle: "monthly", category: "ai", nextRenewal: "2026-03-15" },
];

async function seed() {
  console.log("Seeding subscription costs...");

  for (const cost of COSTS) {
    await db.insert(schema.subscriptionCosts).values({
      name: cost.name,
      vendor: cost.vendor,
      companyTag: cost.companyTag,
      amount: cost.amount,
      billingCycle: cost.billingCycle,
      nextRenewal: cost.nextRenewal ? new Date(cost.nextRenewal) : null,
      category: cost.category ?? null,
      notes: cost.notes ?? null,
    });
    console.log(`  ✓ ${cost.name} — $${(cost.amount / 100).toFixed(2)}/mo`);
  }

  console.log(`\nSeeded ${COSTS.length} subscription costs.`);
  process.exit(0);
}

seed().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
