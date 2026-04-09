import { config } from "dotenv";
config({ path: ".env.local" });
config();

import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import * as schema from "./schema";

const client = neon(process.env.DATABASE_URL!);
const db = drizzle({ client, schema });

async function seed() {
  console.log("Seeding AM Collective database...\n");

  // ─── Portfolio Projects ─────────────────────────────────────────────
  console.log("Creating portfolio projects...");
  const projects = await db
    .insert(schema.portfolioProjects)
    .values([
      {
        name: "CampusGTM / Cursive AI",
        slug: "campusgtm",
        domain: "campusgtm.com",
        vercelProjectId: "prj_gazgIB1ZxtryYeJzWIczS1plj949",
        githubRepo: "adamwolfe2/campus-gtm",
        status: "active",
        healthScore: 85,
      },
      {
        name: "TaskSpace",
        slug: "taskspace",
        domain: "trytaskspace.com",
        vercelProjectId: "prj_YiLrYZG8axICSIpa7pOILUC7obfG",
        githubRepo: "adamwolfe2/taskspace",
        status: "active",
        healthScore: 92,
      },
      {
        name: "Trackr",
        slug: "trackr",
        domain: "trytrackr.com",
        vercelProjectId: "prj_iKdtrJrRjsS6JVLEjDiLLedIGzep",
        githubRepo: "adamwolfe2/trackr",
        status: "active",
        healthScore: 78,
      },
      {
        name: "Wholesail",
        slug: "wholesail",
        domain: "wholesailhub.com",
        vercelProjectId: "prj_rOTfyyrnzCje8W2XyQAv3OgC2j19",
        githubRepo: "adamwolfe2/wholesail",
        status: "active",
        healthScore: 88,
      },
      {
        name: "Hook UGC",
        slug: "hook",
        domain: "hookugc.com",
        vercelProjectId: "prj_kSQ0hEjqGqDADD2Y8wjNVvWqwFCh",
        githubRepo: "adamwolfe2/gtmengine",
        status: "active",
        healthScore: 75,
      },
      {
        name: "TBGC",
        slug: "tbgc",
        domain: "tbgc.com",
        vercelProjectId: "prj_GxMgXdOYErqgqg6Hsabk5oom5M94",
        githubRepo: "adamwolfe2/TBGC",
        status: "active",
        healthScore: 90,
      },
      {
        name: "VendHub",
        slug: "vendhub",
        domain: "vendhub.com",
        vercelProjectId: null,
        githubRepo: null,
        status: "active",
        healthScore: 70,
      },
      {
        name: "Vendingpreneurs",
        slug: "vendingpreneurs",
        domain: "vendingpreneurs.com",
        vercelProjectId: null,
        githubRepo: null,
        status: "active",
        healthScore: 72,
      },
    ])
    .returning();
  console.log(`  ✓ ${projects.length} projects created`);

  // ─── Team Members ───────────────────────────────────────────────────
  console.log("Creating team members...");
  const members = await db
    .insert(schema.teamMembers)
    .values([
      {
        name: "Adam Wolfe",
        email: "adamwolfe102@gmail.com",
        role: "owner",
        title: "CEO / Founder",
        isActive: true,
      },
      {
        name: "Sabbir",
        email: "sabbir@amcollectivecapital.com",
        role: "member",
        title: "GHL Specialist",
        isActive: true,
      },
      {
        name: "Sheenam",
        email: "sheenam@amcollectivecapital.com",
        role: "member",
        title: "SEO",
        isActive: true,
      },
      {
        name: "Kumar",
        email: "kumar@amcollectivecapital.com",
        role: "member",
        title: "N8N Automation",
        isActive: true,
      },
      {
        name: "Maureen",
        email: "maureen@amcollectivecapital.com",
        role: "member",
        title: "RevOps",
        isActive: true,
      },
      {
        name: "Ailyn",
        email: "ailyn@amcollectivecapital.com",
        role: "member",
        title: "Newsletters",
        isActive: true,
      },
      {
        name: "Marco",
        email: "marco@amcollectivecapital.com",
        role: "member",
        title: "Lead Lists",
        isActive: true,
      },
      {
        name: "Ivan",
        email: "ivan@amcollectivecapital.com",
        role: "member",
        title: "Voice",
        isActive: true,
      },
      {
        name: "Saad",
        email: "saad@amcollectivecapital.com",
        role: "member",
        title: "Lead Gen",
        isActive: true,
      },
    ])
    .returning();
  console.log(`  ✓ ${members.length} team members created`);

  // ─── Team Assignments ───────────────────────────────────────────────
  console.log("Creating team assignments...");
  const adam = members[0];
  const sabbir = members[1];

  const taskspace = projects.find((p) => p.slug === "taskspace")!;
  const trackr = projects.find((p) => p.slug === "trackr")!;
  const campusgtm = projects.find((p) => p.slug === "campusgtm")!;
  const hook = projects.find((p) => p.slug === "hook")!;

  await db.insert(schema.teamAssignments).values([
    { teamMemberId: adam.id, projectId: taskspace.id, role: "Lead", hoursPerWeek: "10" },
    { teamMemberId: adam.id, projectId: trackr.id, role: "Lead", hoursPerWeek: "8" },
    { teamMemberId: sabbir.id, projectId: campusgtm.id, role: "GHL Build", hoursPerWeek: "20" },
    { teamMemberId: members[7].id, projectId: hook.id, role: "Voice AI", hoursPerWeek: "15" },
  ]);
  console.log("  ✓ 4 team assignments created");

  // ─── Clients (sample placeholders) ─────────────────────────────────
  console.log("Creating sample clients...");
  const clientRows = await db
    .insert(schema.clients)
    .values([
      {
        name: "Sample Client A",
        companyName: "Apex Ventures",
        email: "contact@apexventures.io",
        phone: "+1 (555) 234-5678",
        website: "https://apexventures.io",
        portalAccess: true,
        accessLevel: "admin",
        notes: "Demo client — replace with real client data when onboarding.",
      },
      {
        name: "Sample Client B",
        companyName: "Brightpath Media",
        email: "hello@brightpath.co",
        phone: "+1 (555) 876-5432",
        website: "https://brightpath.co",
        portalAccess: true,
        accessLevel: "viewer",
        notes: "Demo client — replace with real client data when onboarding.",
      },
      {
        name: "Sample Client C",
        companyName: "Meridian Group",
        email: "ops@meridiangroup.co",
        portalAccess: false,
        accessLevel: "viewer",
        notes: "Demo client — prospective, no portal access yet.",
      },
      {
        name: "Sample Client D",
        companyName: "Pinecrest Holdings",
        email: "admin@pinecrest.io",
        portalAccess: true,
        accessLevel: "collaborator",
        notes: "Demo client — active engagement, collaborator access.",
      },
    ])
    .returning();
  console.log(`  ✓ ${clientRows.length} clients created`);

  // ─── Client Projects ───────────────────────────────────────────────
  console.log("Linking clients to projects...");
  await db.insert(schema.clientProjects).values([
    { clientId: clientRows[0].id, projectId: taskspace.id, role: "Sponsor", status: "active" },
    { clientId: clientRows[0].id, projectId: trackr.id, role: "Beta User", status: "active" },
    { clientId: clientRows[1].id, projectId: campusgtm.id, role: "Customer", status: "active" },
    { clientId: clientRows[3].id, projectId: hook.id, role: "Customer", status: "active" },
  ]);
  console.log("  ✓ 4 client-project links created");

  // ─── Engagements ───────────────────────────────────────────────────
  console.log("Creating engagements...");
  await db.insert(schema.engagements).values([
    {
      clientId: clientRows[0].id,
      projectId: taskspace.id,
      title: "TaskSpace Custom Build",
      description: "EOS platform customization and deployment.",
      type: "build",
      status: "active",
      value: 1500000,
      valuePeriod: "one_time",
    },
    {
      clientId: clientRows[1].id,
      projectId: campusgtm.id,
      title: "CampusGTM Lead Gen Package",
      description: "Full lead generation infrastructure build.",
      type: "build",
      status: "active",
      value: 500000,
      valuePeriod: "monthly",
    },
    {
      clientId: clientRows[3].id,
      projectId: hook.id,
      title: "Hook UGC Campaign",
      description: "AI-powered UGC content generation campaign.",
      type: "retainer",
      status: "active",
      value: 300000,
      valuePeriod: "monthly",
    },
  ]);
  console.log("  ✓ 3 engagements created");

  // ─── Invoices ──────────────────────────────────────────────────────
  console.log("Creating invoices...");
  await db.insert(schema.invoices).values([
    {
      clientId: clientRows[0].id,
      number: "INV-2026-001",
      status: "paid",
      amount: 750000,
      currency: "usd",
      dueDate: new Date("2026-02-15"),
      paidAt: new Date("2026-02-12"),
      lineItems: [
        { description: "TaskSpace Phase 1 — Discovery + Architecture", quantity: 1, unitPrice: 500000 },
        { description: "Infrastructure Setup (Clerk, Neon, Vercel)", quantity: 1, unitPrice: 250000 },
      ],
    },
    {
      clientId: clientRows[1].id,
      number: "INV-2026-002",
      status: "sent",
      amount: 500000,
      currency: "usd",
      dueDate: new Date("2026-03-15"),
      lineItems: [
        { description: "CampusGTM Lead Gen — March 2026", quantity: 1, unitPrice: 500000 },
      ],
    },
    {
      clientId: clientRows[3].id,
      number: "INV-2026-003",
      status: "draft",
      amount: 300000,
      currency: "usd",
      dueDate: new Date("2026-03-01"),
      lineItems: [
        { description: "Hook UGC Campaign — March 2026", quantity: 1, unitPrice: 300000 },
      ],
    },
  ]);
  console.log("  ✓ 3 invoices created");

  // ─── Services (real catalog) ──────────────────────────────────────
  console.log("Creating services...");
  await db.insert(schema.services).values([
    {
      name: "AI Voice Dialer Setup",
      description: "Full AI voice dialer configuration with custom scripts and integrations.",
      category: "AI",
      basePrice: 250000,
      pricePeriod: "one-time",
      isActive: true,
      sortOrder: 1,
    },
    {
      name: "GHL Build & Configuration",
      description: "GoHighLevel CRM build with automations, pipelines, and integrations.",
      category: "CRM",
      basePrice: 500000,
      pricePeriod: "one-time",
      isActive: true,
      sortOrder: 2,
    },
    {
      name: "Email Infrastructure (50K Daily)",
      description: "Full email infrastructure for 50K daily sends — domains, warmup, deliverability.",
      category: "Email",
      basePrice: 300000,
      pricePeriod: "monthly",
      isActive: true,
      sortOrder: 3,
    },
    {
      name: "AI Dashboard Deployment",
      description: "Custom AI-powered dashboard build and deployment.",
      category: "AI",
      basePrice: 150000,
      pricePeriod: "one-time",
      isActive: true,
      sortOrder: 4,
    },
    {
      name: "SEO Audit & Strategy",
      description: "Comprehensive SEO audit with actionable strategy and keyword plan.",
      category: "SEO",
      basePrice: 200000,
      pricePeriod: "one-time",
      isActive: true,
      sortOrder: 5,
    },
    {
      name: "N8N Automation Build",
      description: "Custom n8n workflow automation — per workflow pricing.",
      category: "Automation",
      basePrice: 150000,
      pricePeriod: "one-time",
      isActive: true,
      sortOrder: 6,
    },
  ]);
  console.log("  ✓ 6 services created");

  // ─── Tool Accounts (for cost tracking) ───────────────────────────
  console.log("Creating tool accounts...");
  await db.insert(schema.toolAccounts).values([
    { name: "Vercel", monthlyBudget: 5000 },
    { name: "Neon", monthlyBudget: 2500 },
    { name: "Clerk", monthlyBudget: 5000 },
    { name: "Resend", monthlyBudget: 2000 },
    { name: "Anthropic (Claude)", monthlyBudget: 10000 },
    { name: "OpenAI", monthlyBudget: 5000 },
    { name: "Stripe", monthlyBudget: 0 },
    { name: "Tavily", monthlyBudget: 1000 },
    { name: "Firecrawl", monthlyBudget: 2000 },
    { name: "PostHog", monthlyBudget: 0 },
  ]);
  console.log("  ✓ 10 tool accounts created");

  // ─── Audit Logs ────────────────────────────────────────────────────
  console.log("Creating audit logs...");
  await db.insert(schema.auditLogs).values([
    { actorId: "system", actorType: "system", action: "seed", entityType: "database", entityId: "all", metadata: { version: "2.0" } },
    { actorId: adam.id, actorType: "user", action: "create", entityType: "client", entityId: clientRows[0].id, metadata: { name: "Sample Client A" } },
    { actorId: adam.id, actorType: "user", action: "create", entityType: "client", entityId: clientRows[1].id, metadata: { name: "Sample Client B" } },
    { actorId: adam.id, actorType: "user", action: "create", entityType: "invoice", entityId: "seed-inv-1", metadata: { number: "INV-2026-001", amount: 750000 } },
    { actorId: adam.id, actorType: "user", action: "mark_paid", entityType: "invoice", entityId: "seed-inv-1", metadata: { amount: 750000 } },
  ]);
  console.log("  ✓ 5 audit log entries created");

  console.log("\n✅ Seed complete!");
  process.exit(0);
}

seed().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
