/**
 * AM Collective CRM Master Seed — March 17, 2026
 *
 * Seeds leads, clients, engagements, and lead activities with all known
 * deals, contacts, and pipeline data.
 *
 * Run: npx tsx scripts/seed-crm.ts
 */

import { config } from "dotenv";
config({ path: ".env.local" });
config();

import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { eq, and, ilike, or } from "drizzle-orm";
import * as schema from "../lib/db/schema";

const client = neon(process.env.DATABASE_URL!);
const db = drizzle({ client, schema });

// ─── Helpers ────────────────────────────────────────────────────────────────

async function upsertLead(data: {
  contactName: string;
  companyName?: string;
  email?: string;
  phone?: string;
  website?: string;
  linkedinUrl?: string;
  stage: "awareness" | "interest" | "consideration" | "intent" | "closed_won" | "closed_lost" | "nurture";
  source?: "referral" | "inbound" | "outbound" | "conference" | "social" | "university" | "other";
  assignedTo?: string;
  estimatedValue?: number; // cents
  probability?: number;
  expectedCloseDate?: string;
  industry?: string;
  companySize?: string;
  notes: string;
  tags?: string[];
  companyTag?: "am_collective" | "trackr" | "wholesail" | "taskspace" | "cursive" | "tbgc" | "hook" | "personal" | "untagged";
  nextFollowUpAt?: string;
  lastContactedAt?: string;
}) {
  // Check for existing lead by companyName (primary) or contactName (fallback)
  const conditions = [];
  if (data.companyName) {
    conditions.push(ilike(schema.leads.companyName, data.companyName));
  }
  conditions.push(ilike(schema.leads.contactName, data.contactName));

  const existing = data.companyName
    ? await db
        .select()
        .from(schema.leads)
        .where(
          and(
            ilike(schema.leads.companyName, data.companyName),
            eq(schema.leads.isArchived, false)
          )
        )
        .limit(1)
    : await db
        .select()
        .from(schema.leads)
        .where(
          and(
            ilike(schema.leads.contactName, data.contactName),
            eq(schema.leads.isArchived, false)
          )
        )
        .limit(1);

  if (existing.length > 0) {
    // Update existing lead
    const [updated] = await db
      .update(schema.leads)
      .set({
        contactName: data.contactName,
        companyName: data.companyName ?? existing[0].companyName,
        email: data.email ?? existing[0].email,
        phone: data.phone ?? existing[0].phone,
        website: data.website ?? existing[0].website,
        linkedinUrl: data.linkedinUrl ?? existing[0].linkedinUrl,
        stage: data.stage,
        source: data.source ?? existing[0].source,
        assignedTo: data.assignedTo ?? existing[0].assignedTo,
        estimatedValue: data.estimatedValue ?? existing[0].estimatedValue,
        probability: data.probability ?? existing[0].probability,
        industry: data.industry ?? existing[0].industry,
        companySize: data.companySize ?? existing[0].companySize,
        notes: data.notes,
        tags: data.tags ?? existing[0].tags,
        companyTag: data.companyTag ?? existing[0].companyTag,
        nextFollowUpAt: data.nextFollowUpAt ? new Date(data.nextFollowUpAt) : existing[0].nextFollowUpAt,
        lastContactedAt: data.lastContactedAt ? new Date(data.lastContactedAt) : existing[0].lastContactedAt,
      })
      .where(eq(schema.leads.id, existing[0].id))
      .returning();
    console.log(`  ↻ Updated: ${data.companyName ?? data.contactName} (${data.stage})`);
    return updated;
  }

  // Create new lead
  const [created] = await db
    .insert(schema.leads)
    .values({
      contactName: data.contactName,
      companyName: data.companyName,
      email: data.email,
      phone: data.phone,
      website: data.website,
      linkedinUrl: data.linkedinUrl,
      stage: data.stage,
      source: data.source,
      assignedTo: data.assignedTo,
      estimatedValue: data.estimatedValue,
      probability: data.probability,
      expectedCloseDate: data.expectedCloseDate,
      industry: data.industry,
      companySize: data.companySize,
      notes: data.notes,
      tags: data.tags,
      companyTag: data.companyTag ?? "am_collective",
      nextFollowUpAt: data.nextFollowUpAt ? new Date(data.nextFollowUpAt) : undefined,
      lastContactedAt: data.lastContactedAt ? new Date(data.lastContactedAt) : undefined,
    })
    .returning();

  // Create initial activity
  await db.insert(schema.leadActivities).values({
    leadId: created.id,
    type: "note",
    content: "Lead created via CRM master seed — March 17, 2026",
    createdById: "system",
  });

  console.log(`  + Created: ${data.companyName ?? data.contactName} (${data.stage})`);
  return created;
}

async function addActivity(leadId: string, type: string, content: string) {
  await db.insert(schema.leadActivities).values({
    leadId,
    type,
    content,
    createdById: "system",
  });
}

async function upsertClient(data: {
  name: string;
  companyName?: string;
  email?: string;
  phone?: string;
  website?: string;
  notes?: string;
  currentMrr?: number;
}) {
  const existing = data.companyName
    ? await db
        .select()
        .from(schema.clients)
        .where(ilike(schema.clients.companyName, data.companyName))
        .limit(1)
    : await db
        .select()
        .from(schema.clients)
        .where(ilike(schema.clients.name, data.name))
        .limit(1);

  if (existing.length > 0) {
    const [updated] = await db
      .update(schema.clients)
      .set({
        name: data.name,
        companyName: data.companyName ?? existing[0].companyName,
        email: data.email ?? existing[0].email,
        phone: data.phone ?? existing[0].phone,
        website: data.website ?? existing[0].website,
        notes: data.notes ?? existing[0].notes,
        currentMrr: data.currentMrr ?? existing[0].currentMrr,
      })
      .where(eq(schema.clients.id, existing[0].id))
      .returning();
    console.log(`  ↻ Updated client: ${data.companyName ?? data.name}`);
    return updated;
  }

  const [created] = await db
    .insert(schema.clients)
    .values({
      name: data.name,
      companyName: data.companyName,
      email: data.email,
      phone: data.phone,
      website: data.website,
      notes: data.notes,
      currentMrr: data.currentMrr ?? 0,
    })
    .returning();
  console.log(`  + Created client: ${data.companyName ?? data.name}`);
  return created;
}

// ─── Cleanup: Archive internal team members that shouldn't be leads ─────────

async function archiveInternalTeam() {
  console.log("\n🧹 Archiving internal team members from pipeline...");
  const internalNames = ["Leo", "Thara", "Darren", "Denis"];
  const internalCompanies = ["Student Developers - DevSwarm"];

  for (const name of internalNames) {
    const matches = await db
      .select()
      .from(schema.leads)
      .where(
        and(
          ilike(schema.leads.contactName, `%${name}%`),
          eq(schema.leads.isArchived, false)
        )
      );
    for (const lead of matches) {
      await db
        .update(schema.leads)
        .set({ isArchived: true })
        .where(eq(schema.leads.id, lead.id));
      console.log(`  ✕ Archived: ${lead.contactName} (internal team, not a lead)`);
    }
  }

  for (const company of internalCompanies) {
    const matches = await db
      .select()
      .from(schema.leads)
      .where(
        and(
          ilike(schema.leads.companyName, `%${company}%`),
          eq(schema.leads.isArchived, false)
        )
      );
    for (const lead of matches) {
      await db
        .update(schema.leads)
        .set({ isArchived: true })
        .where(eq(schema.leads.id, lead.id));
      console.log(`  ✕ Archived: ${lead.companyName} (internal team, not a lead)`);
    }
  }

  // Consolidate duplicate PE Partners entries
  const pePartners = await db
    .select()
    .from(schema.leads)
    .where(
      and(
        or(
          ilike(schema.leads.companyName, "%PE Partner%"),
          ilike(schema.leads.companyName, "%Wholesale%PE%")
        ),
        eq(schema.leads.isArchived, false)
      )
    );
  if (pePartners.length > 1) {
    // Keep the first, archive the rest
    for (let i = 1; i < pePartners.length; i++) {
      await db
        .update(schema.leads)
        .set({ isArchived: true })
        .where(eq(schema.leads.id, pePartners[i].id));
      console.log(`  ✕ Archived duplicate: ${pePartners[i].companyName}`);
    }
  }
}

// ─── Main Seed ──────────────────────────────────────────────────────────────

async function seedCRM() {
  console.log("═══════════════════════════════════════════════════════════");
  console.log("  AM Collective CRM Master Seed — March 17, 2026");
  console.log("═══════════════════════════════════════════════════════════\n");

  // Step 0: Cleanup
  await archiveInternalTeam();

  // ═══════════════════════════════════════════════════════════════════════
  // WON / ACTIVE ENGAGEMENTS
  // ═══════════════════════════════════════════════════════════════════════
  console.log("\n━━━ WON / ACTIVE ENGAGEMENTS ━━━");

  // --- DevSwarm ---
  const devswarm = await upsertLead({
    contactName: "Mike (Founder)",
    companyName: "DevSwarm",
    stage: "closed_won",
    source: "referral",
    assignedTo: "Adam",
    estimatedValue: 500000, // $5K/month
    probability: 100,
    industry: "Ambassador Programs / EdTech",
    tags: ["campus-gtm", "ambassador", "b2b-pivot", "active-engagement"],
    lastContactedAt: "2026-03-17",
    nextFollowUpAt: "2026-03-18",
    notes: `CONTACTS:
- Mike (Founder/Client) — paying client, needs recurring Stripe invoice
- Trevor (Co-founder) — aligned on "quality over quantity" pivot
- Karthik (High School PM / Intern) — interning for DevSwarm ($120/week), wants to intern for CampusGTM unpaid for 3 months. Fixed broken webinar link. Very promising.
- Arianne (Program Manager)
- Arya (Content)
- Denis (Maggie's EA — has EmailBison access, manages inbox monitoring)
- Leo (Handoff Partner — internal, prepping for full campaign handoff: Instantly setup, lead sourcing, copy library, response SOP)

DEAL CONTEXT:
- Active ambassador program pivoting from "quantity" to "quality" (high-tier focus)
- Shutting down Instantly outbound volume play
- B2B angle discussed at $10-20K/month target pricing ("HiveShift" offer)
- 18% reply rate on cold campaigns vs 2-3% industry standard
- Calendar/Partiful links were broken ("could not find requested event") — why only 5 people showed at webinar
- Moving office hours from Zoom to Discord
- Reddit reputation issue: "internship scam" post ranking #1, need SEO counter-offensive with fresh Vibe Coding content
- Only 15% of ambassadors (3/20) submitted EOD reports — moving to "2 strikes and you're out"
- Leo and Aryan squared away on fulfillment

NEXT ACTIONS:
- Send Mike's recurring invoice and confirm Stripe payment method
- Get contact list from Maggie (Seattle / Mike's contacts)
- Form management pod (Adam, Leo, Karthik, Arianne) for quarter-based cohort management
- Launch B2B outreach after Mike reviews messaging copy
- Post Karthik's Vibe Coding content on Reddit to bury negative thread
- Fix Discord transition for office hours`,
  });
  await addActivity(devswarm.id, "note", "Pivoting from quantity to quality ambassador model. B2B angle at $10-20K/mo target. 18% reply rate on cold campaigns. Reddit reputation issue needs SEO counter-offensive.");

  // --- DevSwarm Client Record ---
  const devswarmClient = await upsertClient({
    name: "Mike",
    companyName: "DevSwarm",
    notes: "Active ambassador program client. Recurring invoice needs Stripe setup. B2B pivot in progress.",
    currentMrr: 500000,
  });

  // --- Superpower Mentors / SHM ---
  const shm = await upsertLead({
    contactName: "Jake (Client)",
    companyName: "Superpower Mentors / SHM",
    stage: "closed_won",
    source: "referral",
    assignedTo: "Adam",
    estimatedValue: 150000, // $1,500/mo
    probability: 100,
    industry: "Education / Neurodiverse Kids Mentoring",
    tags: ["vsl", "lead-gen", "audience-labs", "active-engagement"],
    lastContactedAt: "2026-03-17",
    nextFollowUpAt: "2026-03-18",
    notes: `CONTACTS:
- Jake (Client) — $1,500/month, targets affluent moms w/ neurodiverse kids, 100% college retention rate, claims 20x ROAS from $5K spend to $100K revenue
- Max Sussman (Jake's Business Partner) — called wanting a contract, not a separate buyer. Jake was raving about Adam.

DEAL CONTEXT:
- VSL v1 live at superheromentor.com/apply
- Setting up A/B testing funnels, tracking user drop-off
- Intent signals set up: scraped and enriched 18K+ verified affluent mothers (married w/ kids), updates WEEKLY
- Email infrastructure prepped: first batch of verified leads uploaded
- Sending capacity ~300/day, can scale once positive responses come in
- Can sync hash codes of leads to FB ad account for UID2 retargeting
- 70% of the way to full launch
- 17,000+ leads loaded and ready
- Historical economics: ~$9K LTV, 20x ROAS

FINANCIAL BLOCKER: Audience Lab payment $1,986 due March 24 (50/50 split with Jake)

NEXT ACTIONS:
- Create and send email campaign copy drafts to Jake for approval
- Trigger 300/day warmup once copy approved
- Send final draft of copy tomorrow to keep momentum rolling`,
  });
  await addActivity(shm.id, "note", "17K+ leads loaded. VSL live. 70% to full launch. $1,986 Audience Lab payment due March 24.");

  const shmClient = await upsertClient({
    name: "Jake",
    companyName: "Superpower Mentors / SHM",
    website: "https://superheromentor.com",
    notes: "$1,500/mo engagement. VSL live. 17K leads loaded. Campaign launch imminent.",
    currentMrr: 150000,
  });

  // --- VendHub / Vend Marketing ---
  const vendhub = await upsertLead({
    contactName: "Connor (VendHub Lead)",
    companyName: "VendHub / Vend Marketing / Venn Marketing",
    stage: "closed_won",
    source: "referral",
    assignedTo: "Adam",
    estimatedValue: 1500000, // projected $15K/mo potential
    probability: 90,
    industry: "Vending / Distribution / MarTech",
    tags: ["ghl", "stripe-connect", "msa-hub", "active-engagement", "high-revenue"],
    lastContactedAt: "2026-03-17",
    nextFollowUpAt: "2026-03-19",
    notes: `CONTACTS:
- Connor (VendHub lead, has exclusive access to some legacy accounts)
- Anthony
- Mike (Modern Amenities)

DEAL CONTEXT:
- Building entire GHL snapshot, Vend Marketing integration, MSA hub, and contract generator
- Multiple revenue paths: Vend Marketing / snapshot CRM, Venn Hire at $500/hire, Luxury $20K package replacing platinum
- Stripe Connect take rate on equipment checkout, projected $150K/month potential at 1.5% fee
- MSA hub / lead distribution / renewals tied to member monetization
- Major active engagement — HUGE revenue line previously missing from pipeline

NEXT ACTIONS:
- Resolve access limitations on legacy Supabase/Upstash accounts (Connor has exclusive access)
- Set up AIMS tech stack independently (Resend, Supabase, Upstash, Vercel)`,
  });
  await addActivity(vendhub.id, "note", "GHL snapshot + Vend Marketing integration + MSA hub + contract generator. Stripe Connect 1.5% take rate projected $150K/mo.");

  const vendhubClient = await upsertClient({
    name: "Connor",
    companyName: "VendHub / Vend Marketing",
    notes: "GHL snapshot, MSA hub, contract generator build. Stripe Connect projected $150K/mo at 1.5%.",
    currentMrr: 1500000,
  });

  // --- AIMS / Modern Amenities ---
  const aims = await upsertLead({
    contactName: "AIMS Team",
    companyName: "AIMS / Modern Amenities",
    stage: "closed_won",
    source: "inbound",
    assignedTo: "Adam",
    estimatedValue: 1000000, // $10K/mo retainer target
    probability: 100,
    industry: "AI Services / SEO / Automation",
    tags: ["retainer", "seo", "voice", "n8n", "active-engagement"],
    lastContactedAt: "2026-03-17",
    notes: `CONTACTS:
- Cody/Kody (SEO fulfillment)
- Sheenam (SEO — went unresponsive since November)
- Ahmad (n8n + Keeper access)
- Christelle (n8n + Keeper access)
- Ivan (Voice specialist, webinar text blasts)
- Alysia (Webinar coordination)
- Joe, Matt (BTC project — user creation for BreakThrough Closing)

DEAL CONTEXT:
- Multiple SEO/AEO clients including MedPro (A2P registration blocker)
- Transitioning from hands-on to consultant role
- Set up shared Claude Max org for AIMS team
- Resolved SMS verification blockers using Textverified
- Created Asana tasks for Internal AI Tool Requests: Lead Gen Google Maps Interactive Map Tool, Calculator Chatbot Javascript Modal, Mockup AI Tool
- DNS record configurations (SPF/DMARC) for reliable email/SMS delivery
- Building AIMS EOD Dashboard and automated EOS page in Asana
- Adam targeting $120K+ as Head of AI & Innovation

NEXT ACTIONS:
- Set up Resend, Supabase, Upstash, Vercel accounts with separate AIMS billing
- Review SEO reporting with Sheenam and Kody for "near me" keyword organic gains
- Build out AIMS EOD Dashboard`,
  });
  await addActivity(aims.id, "note", "Retainer engagement. Head of AI & Innovation role targeting $120K+. Multiple SEO/voice/automation workstreams.");

  const aimsClient = await upsertClient({
    name: "AIMS Team",
    companyName: "AIMS / Modern Amenities",
    notes: "Ongoing retainer. SEO, voice, n8n automation, AI tools. Adam = Head of AI & Innovation ($120K+ target).",
    currentMrr: 1000000,
  });

  // --- Trackr (Internal Product — Won/Active) ---
  const trackrLead = await upsertLead({
    contactName: "David (Chief of Staff)",
    companyName: "Trackr",
    stage: "closed_won",
    source: "inbound",
    assignedTo: "Adam",
    probability: 100,
    industry: "AI Intelligence / Enterprise SaaS",
    companyTag: "trackr",
    tags: ["internal-product", "enterprise-saas", "gtm-active"],
    lastContactedAt: "2026-03-17",
    nextFollowUpAt: "2026-03-21",
    notes: `CONTACTS:
- David (Chief of Staff) — submitting Trackr audit and sharing with his team
- Thara (Sales Rep — INTERNAL TEAM, fully onboarded with admin access, GTM playbook, sending accounts)

DEAL CONTEXT:
- Enterprise AI audit / scorecard / recommendations product
- Student ambassador + enterprise sales distribution model
- Thara fully set up with entire Trackr account, admin access, and GTM playbook
- Friday test call scheduled to verify her execution
- Clerk transfer pending (follow up if no response by noon, escalate)
- Domain warming in progress — no cold sends until Day 7+ minimum
- Holding $15M ARR CEO contact list — only release AFTER Thara successfully onboards us + 3 other companies

NEXT ACTIONS:
- Friday test call with Thara
- Confirm Clerk transfer
- Recruit 2-3 AI-native student reps via CampusGTM (AI clubs, referral code, rev share)
- Confirm outbound running daily (Instantly campaigns live, no quarantines)`,
  });

  // --- Car Dealership Voice Agents ---
  const carDealership = await upsertLead({
    contactName: "Aaron & Mark",
    companyName: "Car Dealership Voice Agents",
    stage: "closed_won",
    source: "referral",
    assignedTo: "Adam",
    estimatedValue: 500000, // estimated $5K/mo
    probability: 85,
    industry: "Automotive / Voice AI",
    tags: ["voice-agent", "automotive", "active-engagement", "repeatable-playbook"],
    lastContactedAt: "2026-03-17",
    nextFollowUpAt: "2026-03-19",
    notes: `CONTACTS:
- Aaron
- Mark

DEAL CONTEXT:
- Already using Shift Digital for inbound, want Adam's outbound system
- X-Time integration needed
- Active technical discussion, ready to start with recall lists this week
- Built functional voice agent with inventory integration
- Demo exceeded expectations despite last-minute prep (Ford dealership)
- Could become repeatable SMB productized service

NEXT ACTIONS:
- Start with recall lists this week
- Complete X-Time integration
- Document as repeatable playbook for other dealerships`,
  });
  await addActivity(carDealership.id, "note", "Voice agent with inventory integration built. Demo exceeded expectations. Starting with recall lists this week.");

  // ═══════════════════════════════════════════════════════════════════════
  // INTENT
  // ═══════════════════════════════════════════════════════════════════════
  console.log("\n━━━ INTENT ━━━");

  // --- Brett Davis ---
  const brett = await upsertLead({
    contactName: "Brett Davis",
    companyName: "Brett Davis — Print-on-Demand",
    stage: "intent",
    source: "referral",
    assignedTo: "Adam",
    estimatedValue: 1500000, // $15K total ($5K to AM Collective)
    probability: 75,
    expectedCloseDate: "2026-03-20",
    industry: "E-commerce / Print-on-Demand",
    tags: ["printify", "dropshipping", "ai-club", "university"],
    lastContactedAt: "2026-03-17",
    nextFollowUpAt: "2026-03-17",
    notes: `CONTACTS:
- Brett Davis (Client) — 27-year veteran in print-on-demand, looking to automate dropshipping. Leaving for Moab for spring break, wants to pay before he leaves. Said he'll review tonight.
- Alex Reagan (Assessment lead)

DEAL CONTEXT:
- $15K total project ($10K to AI Club, $5K to AM Collective)
- Printify API integration
- June completion target
- Offered to oversee dev while Brett is on vacation so he comes back to product halfway done
- Payment flows through Adam, distributed to UO team
- Brett asked "Who do I pay? You or U of O?" — Adam said easier through him, can distribute to UO

NEXT ACTIONS:
- Follow up tonight — he said he'd review
- Get payment before he leaves for break
- Alex Reagan doing assessment
- Assign AI Club member or confirm internal team execution with deadline`,
  });
  await addActivity(brett.id, "note", "$15K deal. Printify API integration. Payment pending — Brett leaving for Moab, needs to pay before spring break.");

  // --- TBGC ---
  const tbgc = await upsertLead({
    contactName: "Rocky & Mason",
    companyName: "TBGC / Truffle Boys & Girls Club",
    stage: "intent",
    source: "referral",
    assignedTo: "Adam",
    estimatedValue: 2000000, // estimated $20K for full CRM build
    probability: 50,
    industry: "Luxury Food Distribution",
    companyTag: "tbgc",
    tags: ["crm-build", "100-page-website", "invoice-unpaid", "blocker"],
    lastContactedAt: "2026-03-10",
    nextFollowUpAt: "2026-03-20",
    notes: `CONTACTS:
- Rocky (Client) — need Stripe account from him, went silent after delivery
- Mason (Client) — need domain from him ASAP

DEAL CONTEXT:
- 99% complete custom CRM with 100-page website
- Thousands of restaurant leads ready
- Team went completely silent after massive delivery
- Invoice NOT paid
- DO NOT proceed on any build or launch work until payment clears

NEXT ACTIONS:
- Get domain from Mason ASAP (text or call today)
- Get Stripe account from Rocky (nothing launches without payment infra)
- Text Mason Thursday — light check-in, don't over-ping
- Create quick SOPs for platform usage with AI
- ZERO work until invoice is paid`,
  });
  await addActivity(tbgc.id, "note", "99% complete CRM + 100-page website delivered. Team went silent. Invoice UNPAID. Zero work until payment clears.");

  // --- Brightpath Media (needs qualification) ---
  const brightpath = await upsertLead({
    contactName: "Elena Rodriguez",
    companyName: "Brightpath Media",
    stage: "intent",
    source: "other",
    assignedTo: "Adam",
    probability: 20,
    tags: ["needs-qualification", "dead-weight-risk"],
    nextFollowUpAt: "2026-03-21",
    notes: `NEEDS QUALIFICATION — zero context from any doc or conversation.
Currently in Intent column but no deal details, no engagement scope, no revenue estimate.
MUST qualify or remove — dead weight until we know what the deal is.

NEXT ACTIONS:
- Adam or Maggie to qualify this week: what's the engagement, what's the revenue, who owns it?`,
  });
  await addActivity(brightpath.id, "note", "NEEDS QUALIFICATION — zero context. Must qualify or remove this week.");

  // --- Apex Ventures (needs qualification) ---
  const apex = await upsertLead({
    contactName: "Jordan Matthews",
    companyName: "Apex Ventures",
    stage: "intent",
    source: "other",
    assignedTo: "Adam",
    probability: 20,
    tags: ["needs-qualification", "dead-weight-risk"],
    nextFollowUpAt: "2026-03-21",
    notes: `NEEDS QUALIFICATION — zero context from any doc or conversation.
Currently in Intent column but no deal details, no engagement scope, no revenue estimate.
MUST qualify or remove — dead weight until we know what the deal is.

NEXT ACTIONS:
- Adam or Maggie to qualify this week.`,
  });
  await addActivity(apex.id, "note", "NEEDS QUALIFICATION — zero context. Must qualify or remove this week.");

  // ═══════════════════════════════════════════════════════════════════════
  // CONSIDERATION
  // ═══════════════════════════════════════════════════════════════════════
  console.log("\n━━━ CONSIDERATION ━━━");

  // --- Creo AI ---
  const creo = await upsertLead({
    contactName: "North (Founder)",
    companyName: "Creo AI",
    stage: "consideration",
    source: "referral",
    assignedTo: "Adam",
    estimatedValue: 1000000, // potential significant CampusGTM deal
    probability: 40,
    industry: "AI / Ambassador Programs",
    tags: ["campus-gtm", "ambassador", "$15m-raised"],
    nextFollowUpAt: "2026-03-19",
    notes: `CONTACTS:
- North (Founder — waiting on intro from Karthik)

DEAL CONTEXT:
- Company raised $15M
- Just started testing ambassador programs but can only seem to get ambassadors in Africa
- Huge potential CampusGTM deal — "would be super easy"
- They pay Karthik $120/week for 7-10 hours, all ambassadors must engage with company posts
- This is Adam's benchmark for DevSwarm paid transition model
- Karthik is the connection here

NEXT ACTIONS:
- Get intro to North from Karthik
- Pitch CampusGTM US student ambassador program
- Use their model (mandatory social engagement, announcement channels, bots) as template for DevSwarm improvement`,
  });
  await addActivity(creo.id, "note", "Raised $15M. Testing ambassador programs, only getting Africa. Huge CampusGTM opportunity. Karthik connection.");

  // --- Wholesail / WholeSailHub ---
  const wholesail = await upsertLead({
    contactName: "PE Partner Targets",
    companyName: "Wholesail / WholeSailHub",
    stage: "consideration",
    source: "outbound",
    assignedTo: "Adam",
    estimatedValue: 3000000, // $30K down per deal
    probability: 35,
    industry: "Distribution / PE-backed Companies",
    companyTag: "wholesail",
    tags: ["pe-targets", "high-ticket", "$30k-down", "first-client-delivered"],
    nextFollowUpAt: "2026-03-21",
    notes: `CONTACTS:
- PE partner targets (to be identified via Apollo/Clay)
- Darren (Cursive Pipeline / prospecting — INTERNAL, not a lead)

DEAL CONTEXT:
- Positioned as the most acquisition-ready company
- First client economics: $30K down + $10K/month retainer (also described as $50-100K packages)
- Portals / CRM / ordering systems for distributors
- Targeting PE-backed distribution companies (10-100 employees, took PE money in last 3 years)
- Need to identify 10 PE targets
- First client delivered — use as proof point: "We just modernized a company like yours in 6 weeks"
- Website audit needed (pricing clarity, UX flow, order portal)
- Need 1 test client: weak website or no order portal, nail fulfillment end-to-end

NEXT ACTIONS:
- Identify 10 PE-backed distribution companies (Apollo/Clay: 10-100 employees, PE money last 3 years)
- Build outreach copy: lead with $30K + $10K retainer proof point
- Launch outreach from AM Collective email or LinkedIn
- Define template offer: CRM setup, order portal, marketing site, data migration, timeline, price
- Find 1 test client, nail fulfillment end-to-end
- Start filling Darren's calendar — 3 booked discovery calls per week`,
  });
  await addActivity(wholesail.id, "note", "Highest ticket: $30K down + $10K/mo retainer. Need 10 PE targets via Apollo/Clay. First client delivered as proof point.");

  // --- Soho House / BofA Partnership ---
  const soho = await upsertLead({
    contactName: "Jericho (Soho House)",
    companyName: "Soho House / Bank of America Partnership",
    stage: "consideration",
    source: "referral",
    assignedTo: "Adam",
    probability: 30,
    industry: "Enterprise Partnerships / Financial Services",
    tags: ["soho-house", "bofa", "40u40", "kpmg", "perkins-coie", "partnership"],
    lastContactedAt: "2026-03-17",
    nextFollowUpAt: "2026-03-18",
    notes: `CONTACTS:
- Jericho (Soho House connection — reached out Monday about meeting, he saw the message)
- Jason (SHM intro confirmed, Jake meeting coordinated)
- Maggie's BofA / KPMG / Perkins Coie 40u40 group contacts

DEAL CONTEXT:
- Maggie coming up Wednesday, wants to meet Jericho at the house around noon
- BofA told Maggie they want to get involved with Soho House — if they're in, whole 40u40 group (KPMG, Perkins Coie, BofA, other tech companies) wants in
- Need Jericho's real estate friend for website and marketing
- Potential to recruit top-tier ambassadors at Soho House
- Portland seller outreach — hold until paid, map it don't build it
- Need to find sorority contact points at UO, UP, OSU (Maggie has someone)

NEXT ACTIONS:
- Follow up with Jericho tomorrow morning to confirm Wednesday or reschedule to Thursday
- Build Figma mind map for scale plan (model like SHM: lead channels, sorority pipeline, marketing funnel, partner structure, revenue model)
- Identify first 3 target sororities for pilot outreach`,
  });
  await addActivity(soho.id, "note", "Maggie meeting Wednesday at Soho House. BofA wants in → entire 40u40 group follows. Q3 timeline for BofA connection.");

  // --- Ford Dealership Demo ---
  const fordDemo = await upsertLead({
    contactName: "Ford Dealership Contact",
    companyName: "Ford Dealership Voice Agent Demo",
    stage: "consideration",
    source: "referral",
    assignedTo: "Adam",
    estimatedValue: 500000,
    probability: 40,
    industry: "Automotive / Voice AI",
    tags: ["voice-agent", "automotive", "demo-completed"],
    lastContactedAt: "2026-03-14",
    nextFollowUpAt: "2026-03-20",
    notes: `DEAL CONTEXT:
- Built functional voice agent with inventory integration
- Demo exceeded expectations despite last-minute prep
- Could expand into broader automotive vertical with Car Dealership work (Aaron/Mark)

NEXT ACTIONS:
- Follow up on demo results
- Package with Car Dealership Voice Agents (Aaron/Mark) as a vertical play`,
  });

  // --- Accelerator / NIL Platform ---
  const accelerator = await upsertLead({
    contactName: "James's Client",
    companyName: "Accelerator / NIL Platform",
    stage: "consideration",
    source: "referral",
    assignedTo: "James",
    estimatedValue: 200000, // $2K quoted (should be $4-5K)
    probability: 30,
    industry: "Sports / NIL",
    tags: ["outreach-tracker", "low-priority"],
    notes: `DEAL CONTEXT:
- Building outreach tracker dashboard
- Client penny-pinching at $2K ask vs typical $4-5K for comparable tools
- Low priority but real paid build potential

NEXT ACTIONS:
- James to close or walk away — don't negotiate below $2K`,
  });

  // --- Print Order Project (Maggie's) ---
  const printOrder = await upsertLead({
    contactName: "Print Order Client",
    companyName: "Print Order Project (Maggie)",
    stage: "consideration",
    source: "referral",
    assignedTo: "Maggie",
    estimatedValue: 500000, // $5K already paid
    probability: 50,
    industry: "Print / Manufacturing",
    tags: ["$5k-received", "needs-decision"],
    nextFollowUpAt: "2026-03-19",
    notes: `DEAL CONTEXT:
- Client already paid $5K
- Need to give him a concrete yes/no and timeline
- Maggie's team either picks it up or kill it
- Decision: start with WholeSailHub setup or custom build?
- If WholeSailHub template covers 80% of the need, start there

NEXT ACTIONS:
- Sync with Maggie — can her team execute and deliver? Decide in meeting.
- If alive: assign owner + hard deadline
- If dead: refund or renegotiate scope now
- Respond to client — he paid $5K, give him something concrete`,
  });
  await addActivity(printOrder.id, "note", "$5K already received. Need yes/no decision from Maggie. If alive: assign owner + deadline. If dead: refund.");

  // ═══════════════════════════════════════════════════════════════════════
  // INTEREST
  // ═══════════════════════════════════════════════════════════════════════
  console.log("\n━━━ INTEREST ━━━");

  // --- Handshake / OpenAI Campus Initiative ---
  const handshake = await upsertLead({
    contactName: "Handshake / OpenAI Contact",
    companyName: "Handshake / OpenAI Campus Initiative",
    stage: "interest",
    source: "referral",
    assignedTo: "Maggie",
    industry: "AI / EdTech / Enterprise",
    tags: ["campus-gtm", "openai", "massive-potential"],
    nextFollowUpAt: "2026-03-18",
    notes: `CONTACTS:
- Unknown (Handshake person running part of OpenAI's campus initiative)

DEAL CONTEXT:
- Maggie has a meeting tomorrow (March 18) with this person
- Could be massive for CampusGTM
- No further details yet

NEXT ACTIONS:
- Maggie takes the meeting and reports back
- Adam preps CampusGTM pitch deck / demo for follow-up if meeting goes well`,
  });

  // --- JP Morgan Startup Team ---
  const jpmorgan = await upsertLead({
    contactName: "JPM Startup Team",
    companyName: "JP Morgan Startup Team",
    stage: "interest",
    source: "referral",
    assignedTo: "Maggie",
    industry: "Financial Services / Banking",
    tags: ["sponsorship", "enterprise", "quackhacks"],
    nextFollowUpAt: "2026-03-20",
    notes: `DEAL CONTEXT:
- Maggie pitched the full portfolio and showed everything
- Following up — need to give her 3 specific asks before follow-up goes cold

NEXT ACTIONS:
- Give Maggie 3 concrete asks: QuackHacks sponsorship amount, AM Collective intro target, Unpak feedback format
- Follow up with Maggie on JPM response — what did they say? Any warm intro made?`,
  });

  // --- Recruit Pulse ---
  const recruitPulse = await upsertLead({
    contactName: "UO Defensive Coordinator",
    companyName: "Recruit Pulse",
    stage: "interest",
    source: "university",
    assignedTo: "Maggie",
    industry: "Sports / Recruiting Tech",
    tags: ["campus-gtm", "uo-connection", "n8n"],
    nextFollowUpAt: "2026-03-21",
    notes: `CONTACTS:
- UO Defensive Coordinator / Recruit Pulse founder

DEAL CONTEXT:
- Maggie intro'd, initial meeting done
- Need full brief from Maggie on what they need built
- Potential tech build + CampusGTM outbound combo (ambassador + coach acquisition via N8N)
- Assess if student devs can take this on vs existing workload

NEXT ACTIONS:
- Get full brief from Maggie
- Assess tech team fit — can student devs handle?
- Map Cursive/CampusGTM outbound angle`,
  });

  // --- Kansas Roofing Company ---
  const kansasRoofing = await upsertLead({
    contactName: "Kansas Roofing Contact",
    companyName: "Kansas Roofing Company",
    stage: "interest",
    source: "outbound",
    assignedTo: "Adam",
    estimatedValue: 2000000, // big budget client
    probability: 15,
    industry: "Roofing / Home Services",
    tags: ["$40k-mo-budget", "needs-qualification"],
    nextFollowUpAt: "2026-03-21",
    notes: `DEAL CONTEXT:
- $40K/month marketing spend
- No further context beyond this data point
- Needs outreach and qualification

NEXT ACTIONS:
- Qualify: who's the contact, what do they need, how did we hear about them?
- Reach out and book discovery call`,
  });

  // --- Two CampusGTM Buyers (Maggie's) ---
  const campusBuyers = await upsertLead({
    contactName: "Two Potential CampusGTM Buyers",
    companyName: "CampusGTM Buyer Leads (via Maggie)",
    stage: "interest",
    source: "referral",
    assignedTo: "Maggie",
    industry: "Enterprise / Campus GTM",
    tags: ["campus-gtm", "maggie-intro"],
    nextFollowUpAt: "2026-03-21",
    notes: `DEAL CONTEXT:
- Two unnamed individuals Maggie mentioned ("I have two guys interested in calling, could be campus GTM buyers")
- Maggie needs to send Friday schedule so they can get on Adam's calendar

NEXT ACTIONS:
- Get Maggie's Friday schedule
- Book calls with both`,
  });

  // --- Red Bull Partnership ---
  const redbull = await upsertLead({
    contactName: "Director of Field Marketing",
    companyName: "Red Bull Partnership",
    stage: "interest",
    source: "referral",
    assignedTo: "Adam",
    industry: "CPG / Beverage / Brand Partnerships",
    tags: ["portal-demo", "edi-integration", "brand-partnership"],
    nextFollowUpAt: "2026-03-24",
    notes: `CONTACTS:
- Director of Field Marketing (contact established)
- Ball Corporation connection available

DEAL CONTEXT:
- Portal demo needed for proposal
- EDI integration pending
- High-profile brand partnership opportunity

NEXT ACTIONS:
- Schedule portal demo
- Prep EDI integration discussion
- Leverage Ball Corporation connection`,
  });

  // --- Audience Labs Partnership ---
  const audienceLabs = await upsertLead({
    contactName: "Roheed (Intro) / Audience Labs Contact",
    companyName: "Audience Labs Partnership",
    stage: "interest",
    source: "referral",
    assignedTo: "Adam",
    industry: "Data / Email Infrastructure / Identity Resolution",
    tags: ["pixel", "identity-resolution", "enrichment", "20m-emails-mo", "white-label"],
    nextFollowUpAt: "2026-03-21",
    notes: `CONTACTS:
- Roheed (intro connection)
- Audience Labs contact (20M emails/month capacity)

DEAL CONTEXT:
- 20M emails/month capacity contact
- Potential infrastructure upgrade from current EmailBison
- Pixel + identity resolution + enrichment + outbound workflows
- Pricing: 25 cents per match + $1,000/month reactivation fee, threshold billing/rebilling
- White-label and agency resale potential
- Connected through Roheed introduction

NEXT ACTIONS:
- Get fully up to speed on platform (pixel install, visitor ID, enrichment, lead list delivery)
- Build 1-page SOP for fulfillment
- Address $1,986 payment due March 24`,
  });

  // --- Real Estate CRM + Intent Lists ---
  const realEstate = await upsertLead({
    contactName: "Jericho's Real Estate Friend / Lujan",
    companyName: "Real Estate CRM + Intent Lists",
    stage: "interest",
    source: "referral",
    assignedTo: "Adam",
    industry: "Real Estate / PropTech",
    tags: ["crm", "intent-lists", "geography-targeting", "recurring-subscription"],
    nextFollowUpAt: "2026-03-24",
    notes: `CONTACTS:
- Jericho's real estate friend (via Soho House connection)
- Lujan (real estate team member)

DEAL CONTEXT:
- Custom CRM packages
- Weekly intent-list subscriptions
- Geography-based targeting
- Still early but explicitly framed as a business line

NEXT ACTIONS:
- Get connected to Jericho's real estate friend for website and marketing
- Define product offering: CRM + weekly intent lists`,
  });

  // ═══════════════════════════════════════════════════════════════════════
  // NURTURE
  // ═══════════════════════════════════════════════════════════════════════
  console.log("\n━━━ NURTURE ━━━");

  // --- UO Foundation ---
  const uoFoundation = await upsertLead({
    contactName: "Paul Weinhold (CEO)",
    companyName: "UO Foundation",
    stage: "nurture",
    source: "university",
    assignedTo: "Adam",
    estimatedValue: 5000000, // Phase 2 potential
    probability: 25,
    industry: "Higher Education / Foundation",
    tags: ["phase-1-complete", "$50k-delivered", "phase-2-potential", "womens-board"],
    lastContactedAt: "2026-02-01",
    nextFollowUpAt: "2026-03-19",
    notes: `CONTACTS:
- Paul Weinhold (CEO — Phase 1 $50K audit delivered)
- Yuval

DEAL CONTEXT:
- Phase 1 ($50K audit) delivered successfully
- Phase 2 signal unknown — need to ask Maggie if it's time to re-engage
- UO Women's Leadership Board meeting coming up (equivalent of 40 Under 40 for most philanthropic/successful women of Oregon)
- Adam founded AISA (250+ members) and QuackHacks (150+ participants) at UO — strong institutional relationship

NEXT ACTIONS:
- Ask Maggie tomorrow if it's time to email Paul
- If green light: email Paul Wednesday referencing Phase 1, ask about Phase 2, keep it short
- Attend UO Women's Leadership Board meeting with cards, know your ask, find 2 follow-up targets
- Identify 3 warm intros from UO network (Paul, board attendees, AISA alumni)`,
  });
  await addActivity(uoFoundation.id, "note", "Phase 1 ($50K audit) delivered. Phase 2 signal check needed. Women's Leadership Board meeting upcoming.");

  // ═══════════════════════════════════════════════════════════════════════
  // STRATEGIC PARTNERS
  // ═══════════════════════════════════════════════════════════════════════
  console.log("\n━━━ STRATEGIC PARTNERS ━━━");

  // --- Gabriel (Manufacturing/Wholesale Consultant) ---
  const gabriel = await upsertLead({
    contactName: "Gabriel",
    companyName: "Gabriel — Manufacturing/Wholesale Consultant",
    stage: "nurture", // No "strategic_partner" enum — use nurture + tag
    source: "referral",
    assignedTo: "Adam",
    industry: "Manufacturing / Wholesale Consulting",
    tags: ["strategic-partner", "referral-channel", "wholesail-funnel", "not-a-client"],
    notes: `TYPE: Strategic Partner — NOT a traditional lead/client

DEAL CONTEXT:
- About to buy a factory for $500K
- Pays 2 college kids $3K/mo to cold call 200 people daily
- Gets ~10 interested, closes 3/week at $3-5K per 10-day consulting audit (pays someone else to run the audit)
- Perfect referral to Wholesail distribution portal clients
- His daily call tracking / kanban need maps directly to AM Collective dashboard

NEXT ACTIONS:
- Explore plug-and-play lead gen for Gabriel using AM Collective dashboard
- Position as referral partner for Wholesail`,
  });
  await addActivity(gabriel.id, "note", "Strategic partner, not client. $500K factory purchase. Perfect Wholesail referral channel. Cold call kanban maps to our dashboard.");

  // ═══════════════════════════════════════════════════════════════════════
  // UPDATE EXISTING CLIENTS + ENGAGEMENTS
  // ═══════════════════════════════════════════════════════════════════════
  console.log("\n━━━ UPDATING CLIENTS & ENGAGEMENTS ━━━");

  // Create engagements for Won/Active deals
  const allClients = await db.select().from(schema.clients);

  // DevSwarm engagement
  if (devswarmClient) {
    const existingEng = await db
      .select()
      .from(schema.engagements)
      .where(eq(schema.engagements.clientId, devswarmClient.id))
      .limit(1);
    if (existingEng.length === 0) {
      await db.insert(schema.engagements).values({
        clientId: devswarmClient.id,
        title: "DevSwarm Ambassador Program Management",
        description: "Active ambassador program management. Pivoting to quality-focused model with B2B angle at $10-20K/mo. Campaign handoff to Leo in progress.",
        type: "retainer",
        status: "active",
        startDate: new Date("2026-01-15"),
        value: 500000,
        valuePeriod: "monthly",
      });
      console.log("  + Engagement: DevSwarm Ambassador Program");
    }
  }

  // SHM engagement
  if (shmClient) {
    const existingEng = await db
      .select()
      .from(schema.engagements)
      .where(eq(schema.engagements.clientId, shmClient.id))
      .limit(1);
    if (existingEng.length === 0) {
      await db.insert(schema.engagements).values({
        clientId: shmClient.id,
        title: "SHM VSL + Lead Gen Campaign",
        description: "VSL live at superheromentor.com/apply. 17K+ leads loaded. A/B testing funnels. 300/day email warmup pending copy approval. Historical: $9K LTV, 20x ROAS.",
        type: "build",
        status: "active",
        startDate: new Date("2026-02-01"),
        value: 150000,
        valuePeriod: "monthly",
      });
      console.log("  + Engagement: SHM VSL + Lead Gen Campaign");
    }
  }

  // VendHub engagement
  if (vendhubClient) {
    const existingEng = await db
      .select()
      .from(schema.engagements)
      .where(eq(schema.engagements.clientId, vendhubClient.id))
      .limit(1);
    if (existingEng.length === 0) {
      await db.insert(schema.engagements).values({
        clientId: vendhubClient.id,
        title: "VendHub GHL + Stripe Connect Platform Build",
        description: "GHL snapshot, Vend Marketing integration, MSA hub, contract generator. Stripe Connect take rate at 1.5%, projected $150K/mo. Multiple revenue paths: CRM, Venn Hire ($500/hire), Luxury $20K package.",
        type: "build",
        status: "active",
        startDate: new Date("2026-02-15"),
        value: 1500000,
        valuePeriod: "monthly",
      });
      console.log("  + Engagement: VendHub GHL + Stripe Connect Platform");
    }
  }

  // AIMS engagement
  if (aimsClient) {
    const existingEng = await db
      .select()
      .from(schema.engagements)
      .where(eq(schema.engagements.clientId, aimsClient.id))
      .limit(1);
    if (existingEng.length === 0) {
      await db.insert(schema.engagements).values({
        clientId: aimsClient.id,
        title: "AIMS Head of AI & Innovation Retainer",
        description: "Ongoing retainer — SEO/AEO clients, voice agents, n8n automation, AI tools, EOD dashboard. Targeting $120K+ annually. Multiple workstreams: MedPro SEO, BTC user creation, Asana EOS integration.",
        type: "retainer",
        status: "active",
        startDate: new Date("2025-09-01"),
        value: 1000000,
        valuePeriod: "monthly",
      });
      console.log("  + Engagement: AIMS Head of AI & Innovation Retainer");
    }
  }

  // ═══════════════════════════════════════════════════════════════════════
  // SUMMARY
  // ═══════════════════════════════════════════════════════════════════════

  const leadCount = await db
    .select()
    .from(schema.leads)
    .where(eq(schema.leads.isArchived, false));

  const clientCount = await db.select().from(schema.clients);
  const engagementCount = await db.select().from(schema.engagements);

  console.log("\n═══════════════════════════════════════════════════════════");
  console.log("  CRM SEED COMPLETE");
  console.log("═══════════════════════════════════════════════════════════");
  console.log(`  Active Leads:    ${leadCount.length}`);
  console.log(`  Clients:         ${clientCount.length}`);
  console.log(`  Engagements:     ${engagementCount.length}`);
  console.log("═══════════════════════════════════════════════════════════\n");

  process.exit(0);
}

seedCRM().catch((err) => {
  console.error("CRM seed failed:", err);
  process.exit(1);
});
