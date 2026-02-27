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
        name: "CampusGTM",
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
        status: "paused",
        healthScore: 65,
      },
      {
        name: "TBGC",
        slug: "tbgc",
        domain: null,
        vercelProjectId: "prj_GxMgXdOYErqgqg6Hsabk5oom5M94",
        githubRepo: "adamwolfe2/TBGC",
        status: "active",
        healthScore: 90,
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
        email: "adam@amcollectivecapital.com",
        role: "owner",
        title: "CEO / Founder",
        isActive: true,
      },
      {
        name: "Sarah Chen",
        email: "sarah@amcollectivecapital.com",
        role: "admin",
        title: "Head of Engineering",
        isActive: true,
      },
      {
        name: "Marcus Rivera",
        email: "marcus@amcollectivecapital.com",
        role: "member",
        title: "Full-Stack Developer",
        isActive: true,
      },
    ])
    .returning();
  console.log(`  ✓ ${members.length} team members created`);

  // ─── Team Assignments ───────────────────────────────────────────────
  console.log("Creating team assignments...");
  const adam = members[0];
  const sarah = members[1];
  const marcus = members[2];
  const taskspace = projects.find((p) => p.slug === "taskspace")!;
  const trackr = projects.find((p) => p.slug === "trackr")!;
  const wholesail = projects.find((p) => p.slug === "wholesail")!;

  await db.insert(schema.teamAssignments).values([
    { teamMemberId: adam.id, projectId: taskspace.id, role: "Lead", hoursPerWeek: "10" },
    { teamMemberId: adam.id, projectId: trackr.id, role: "Lead", hoursPerWeek: "8" },
    { teamMemberId: sarah.id, projectId: trackr.id, role: "Engineer", hoursPerWeek: "20" },
    { teamMemberId: sarah.id, projectId: wholesail.id, role: "Engineer", hoursPerWeek: "15" },
    { teamMemberId: marcus.id, projectId: taskspace.id, role: "Developer", hoursPerWeek: "25" },
    { teamMemberId: marcus.id, projectId: wholesail.id, role: "Developer", hoursPerWeek: "15" },
  ]);
  console.log("  ✓ 6 team assignments created");

  // ─── Clients ────────────────────────────────────────────────────────
  console.log("Creating clients...");
  const clientRows = await db
    .insert(schema.clients)
    .values([
      {
        name: "Jordan Matthews",
        companyName: "Apex Ventures",
        email: "jordan@apexventures.io",
        phone: "+1 (555) 234-5678",
        website: "https://apexventures.io",
        portalAccess: true,
        accessLevel: "admin",
        notes: "Series A startup. Primary contact for TaskSpace + Trackr engagements.",
      },
      {
        name: "Elena Rodriguez",
        companyName: "Brightpath Media",
        email: "elena@brightpath.co",
        phone: "+1 (555) 876-5432",
        website: "https://brightpath.co",
        portalAccess: true,
        accessLevel: "viewer",
        notes: "Content agency. Interested in Wholesail + Hook UGC for distribution.",
      },
    ])
    .returning();
  console.log(`  ✓ ${clientRows.length} clients created`);

  // ─── Client Projects ───────────────────────────────────────────────
  console.log("Linking clients to projects...");
  await db.insert(schema.clientProjects).values([
    { clientId: clientRows[0].id, projectId: taskspace.id, role: "Sponsor", status: "active" },
    { clientId: clientRows[0].id, projectId: trackr.id, role: "Beta User", status: "active" },
    { clientId: clientRows[1].id, projectId: wholesail.id, role: "Customer", status: "active" },
  ]);
  console.log("  ✓ 3 client-project links created");

  // ─── Engagements ───────────────────────────────────────────────────
  console.log("Creating engagements...");
  await db.insert(schema.engagements).values([
    {
      clientId: clientRows[0].id,
      projectId: taskspace.id,
      title: "TaskSpace Custom Implementation",
      description: "Full EOS platform customization and deployment for Apex Ventures team.",
      type: "build",
      status: "active",
      value: 1500000,
      valuePeriod: "one_time",
    },
    {
      clientId: clientRows[1].id,
      projectId: wholesail.id,
      title: "Wholesail Retainer",
      description: "Monthly retainer for distribution portal maintenance and feature development.",
      type: "retainer",
      status: "active",
      value: 500000,
      valuePeriod: "monthly",
    },
  ]);
  console.log("  ✓ 2 engagements created");

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
      status: "draft",
      amount: 500000,
      currency: "usd",
      dueDate: new Date("2026-03-15"),
      lineItems: [
        { description: "Wholesail Retainer — March 2026", quantity: 1, unitPrice: 500000 },
      ],
    },
  ]);
  console.log("  ✓ 2 invoices created");

  // ─── Services ──────────────────────────────────────────────────────
  console.log("Creating services...");
  await db.insert(schema.services).values([
    {
      name: "Platform Build",
      description: "Full custom platform development from discovery to deployment.",
      category: "Development",
      basePrice: 2500000,
      pricePeriod: "one-time",
      isActive: true,
      sortOrder: 1,
    },
    {
      name: "Monthly Retainer",
      description: "Ongoing development, maintenance, and feature additions.",
      category: "Retainer",
      basePrice: 500000,
      pricePeriod: "monthly",
      isActive: true,
      sortOrder: 2,
    },
    {
      name: "AI Integration",
      description: "Claude/GPT integration, RAG pipelines, AI agent development.",
      category: "AI",
      basePrice: 750000,
      pricePeriod: "one-time",
      isActive: true,
      sortOrder: 3,
    },
  ]);
  console.log("  ✓ 3 services created");

  // ─── Audit Logs ────────────────────────────────────────────────────
  console.log("Creating sample audit logs...");
  await db.insert(schema.auditLogs).values([
    { actorId: "system", actorType: "system", action: "seed", entityType: "database", entityId: "all", metadata: { version: "1.0" } },
    { actorId: adam.id, actorType: "user", action: "create", entityType: "client", entityId: clientRows[0].id, metadata: { name: "Jordan Matthews" } },
    { actorId: adam.id, actorType: "user", action: "create", entityType: "client", entityId: clientRows[1].id, metadata: { name: "Elena Rodriguez" } },
    { actorId: adam.id, actorType: "user", action: "create", entityType: "invoice", entityId: "seed-inv-1", metadata: { number: "INV-2026-001", amount: 750000 } },
    { actorId: sarah.id, actorType: "user", action: "mark_paid", entityType: "invoice", entityId: "seed-inv-1", metadata: { amount: 750000 } },
  ]);
  console.log("  ✓ 5 audit log entries created");

  console.log("\n✅ Seed complete!");
  process.exit(0);
}

seed().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
