/**
 * Rebuild CRM pipeline from the April 2026 master list.
 *
 * Behavior:
 *   1. Archive every existing non-archived lead.
 *   2. Upsert each master-list entry: if a matching existing lead is found
 *      by a name/company heuristic, update it and un-archive. Otherwise
 *      insert a new lead.
 *   3. Non-Stripe client rows not on the master list are marked churned
 *      with a note. Stripe-linked stub clients are left alone.
 *
 * Usage: npx tsx --env-file=.env.local scripts/rebuild-crm-april-2026.ts
 */

import { db } from "../lib/db";
import { leads } from "../lib/db/schema/leads";
import { clients } from "../lib/db/schema/crm";
import { and, eq, isNull, not } from "drizzle-orm";
import type { CompanyTag } from "../lib/db/schema/costs";

type LeadStage =
  | "awareness"
  | "interest"
  | "consideration"
  | "intent"
  | "closed_won"
  | "closed_lost"
  | "nurture";

type LeadSource =
  | "referral"
  | "inbound"
  | "outbound"
  | "conference"
  | "social"
  | "university"
  | "other";

type MasterLead = {
  /** Regex patterns (case-insensitive) matched against contactName OR companyName to find an existing row. */
  matchPatterns: RegExp[];
  contactName: string;
  companyName: string;
  email?: string;
  website?: string;
  stage: LeadStage;
  source: LeadSource;
  assignedTo: string;
  companyTag: CompanyTag;
  industry?: string;
  estimatedValueCents: number | null;
  probability: number | null;
  nextFollowUpAt?: string;
  tags: string[];
  notes: string;
};

const MASTER: MasterLead[] = [
  // ── HOT ─────────────────────────────────────────────────────────────
  {
    matchPatterns: [/olander/i, /^david —/i],
    contactName: "David",
    companyName: "Olander",
    stage: "intent",
    source: "other",
    assignedTo: "Adam",
    companyTag: "cursive",
    industry: "Industrial / Fasteners",
    estimatedValueCents: 350_000,
    probability: 75,
    nextFollowUpAt: "2026-04-24",
    tags: ["hot", "p0", "cursive", "cold-email", "pending-close"],
    notes: `PRIORITY: P0 — pending close this week
DEAL: $3,500 setup + $1,500/mo (Cursive client)
PAID: No

SCOPE:
- Cold email copy
- Website + pixel install
- Cold email infrastructure at scale

BLOCKER: Concerned about cold email viability in the fasteners space — need to educate him on how the channel works for industrial B2B.`,
  },
  {
    matchPatterns: [/norman/i, /trig/i, /telegraph/i],
    contactName: "Norman",
    companyName: "Trig Investments (Telegraph Commons)",
    stage: "closed_won",
    source: "other",
    assignedTo: "Adam",
    companyTag: "cursive",
    industry: "Investments",
    estimatedValueCents: 400_000,
    probability: 100,
    nextFollowUpAt: "2026-04-21",
    tags: ["hot", "p1", "cursive", "closed-won", "scoping-retainer"],
    notes: `PRIORITY: P1 — reconnect Tuesday
DEAL: $4,000 paid, retainer TBD (Cursive client)
PAID: Yes

DELIVERED:
- Chatbot
- SEO / AEO

NEXT: Build list of retainer management items. Reconnect Tuesday to scope ongoing retainer.`,
  },
  {
    matchPatterns: [/devswarm/i, /^mike/i],
    contactName: "Mike",
    companyName: "DevSwarm",
    stage: "closed_won",
    source: "referral",
    assignedTo: "Adam",
    companyTag: "am_collective",
    industry: "Ambassador Programs / EdTech",
    estimatedValueCents: 5_000_000, // $50K total ($24K paid + $26K pending)
    probability: 100,
    nextFollowUpAt: "2026-04-20",
    tags: ["hot", "p0", "at-risk", "hiveshift", "ambassador"],
    notes: `PRIORITY: P0 — needs traction this weekend
DEAL: $24,000 paid + $26,000 pending (AM Collective client)
PAID: Partial
STAGE: Active, AT RISK

SCOPE:
- Ambassador program management (Leo fully takes over ops)
- HiveShift B2B campaign — needs qualified B2B opportunities
- Write a shorter/simpler cold email variant
- Enrich and re-upload HiveShift leads — needs traction ASAP`,
  },
  {
    matchPatterns: [/truffle/i, /rocky/i, /tbgc/i],
    contactName: "Rocky",
    companyName: "Truffle Boys Distribution",
    website: "https://trufflebyosdistribution.com",
    stage: "intent",
    source: "referral",
    assignedTo: "Adam",
    companyTag: "tbgc",
    industry: "Luxury Food Distribution",
    estimatedValueCents: 3_000_000, // $30K setup
    probability: 90,
    nextFollowUpAt: "2026-04-20",
    tags: ["hot", "p0", "invoiced", "pending-payment", "coachella"],
    notes: `PRIORITY: P0 — ongoing, invoiced, awaiting payment
DEAL: $30,000 + $10,000/mo (AM Collective client)
PAID: No — invoice pending

SCOPE:
- Keep site live
- Build Coachella relations
- Build restaurant lead list for him to hit via email
- Bring him business through the site: signups + notifications`,
  },
  {
    matchPatterns: [/brett/i, /print/i, /pod/i],
    contactName: "Brett Davis",
    companyName: "Brett Davis POD",
    stage: "intent",
    source: "referral",
    assignedTo: "Adam",
    companyTag: "am_collective",
    industry: "E-commerce / Print-on-Demand",
    estimatedValueCents: 1_500_000, // $15K
    probability: 75,
    nextFollowUpAt: "2026-04-13",
    tags: ["hot", "p1", "proposal", "printify", "uo-ai-club"],
    notes: `PRIORITY: P1 — April 13 personal follow-up
DEAL: $15,000 (AM Collective)
PAID: No — proposal, not invoiced

SCOPE:
- Printify POD integration
- UO AI Club team ready with POD scoping
- AI Club to proactively build business plan before April 13
- Personal follow-up April 13`,
  },
  {
    matchPatterns: [/david gwynn/i, /ai advisors/i],
    contactName: "David Gwynn",
    companyName: "AI Advisors LLC",
    stage: "closed_won",
    source: "inbound",
    assignedTo: "Adam",
    companyTag: "am_collective",
    industry: "AI Consulting",
    estimatedValueCents: 85_000, // $650 + $200 = $850
    probability: 100,
    nextFollowUpAt: "2026-04-24",
    tags: ["hot", "p2", "partial-payment", "balance-due", "site-transfer"],
    notes: `PRIORITY: P2 — follow-up this week for balance + transfer
DEAL: $650 paid + $200 pending (AM Collective)
PAID: Partial — needs $200 balance + website transfer

SCOPE:
- Finish site
- Add pixel
- Send weekly visitor leads
- Send teaser for leads in his vertical of interest

NEXT: Follow up for final $200 and full site transfer.`,
  },
  {
    matchPatterns: [/superpower/i, /superheromentor/i, /\bshm\b/i, /^jake/i],
    contactName: "Jake",
    companyName: "Superpower Mentors (SHM)",
    website: "https://superheromentor.com",
    stage: "closed_won",
    source: "referral",
    assignedTo: "Adam",
    companyTag: "am_collective",
    industry: "Education / Neurodiverse Kids Mentoring",
    estimatedValueCents: 2_000_000, // $20K/mo target
    probability: 100,
    nextFollowUpAt: "2026-04-24",
    tags: ["hot", "p0", "behind", "vsl", "lead-gen", "campaigns"],
    notes: `PRIORITY: P0 — copy approval + launch this week
DEAL: $0 current, $20,000+/mo target (AM Collective)
PAID: No (trigger on delivery)
STAGE: Active, BEHIND

SCOPE:
- Get campaigns + VSL approved
- Launch, over-deliver, low-maintenance execution
- 17K leads loaded

GOAL: Deliver good leads and turn on the floodgates.`,
  },

  // ── NURTURE ────────────────────────────────────────────────────────
  {
    matchPatterns: [/jericho/i, /soho/i],
    contactName: "Jericho",
    companyName: "Soho House (mentorship program)",
    stage: "nurture",
    source: "referral",
    assignedTo: "Adam",
    companyTag: "am_collective",
    industry: "Membership / Deal Flow",
    estimatedValueCents: 0,
    probability: null,
    nextFollowUpAt: "2026-04-24",
    tags: ["nurture", "p1", "mentorship", "deal-flow", "6-week-program"],
    notes: `PRIORITY: P1 — 6-week program window
TYPE: Personal strategic / deal flow
DEAL: $0 direct

SCOPE:
- Follow up to become mentee, work remote from house 3x/week
- Maximize 6-week program
- Build Rolodex
- Send free AI resources to members`,
  },
  {
    matchPatterns: [/brandon collins/i, /dreamleads/i],
    contactName: "Brandon Collins",
    companyName: "DreamLeads",
    stage: "interest",
    source: "other",
    assignedTo: "Adam",
    companyTag: "am_collective",
    industry: "Outbound / LinkedIn Software",
    estimatedValueCents: null,
    probability: 25,
    nextFollowUpAt: "2026-04-27",
    tags: ["nurture", "p2", "early", "linkedin", "potential-mutual"],
    notes: `PRIORITY: P2 — follow up next week
DEAL: TBD
PAID: No

SCOPE: Wants to test his outbound LinkedIn software. Potential mutual engagement.`,
  },
  {
    matchPatterns: [/kashyap/i, /viaflow/i],
    contactName: "Kashyap",
    companyName: "Viaflow",
    stage: "nurture",
    source: "other",
    assignedTo: "Adam",
    companyTag: "cursive",
    industry: "SaaS",
    estimatedValueCents: 500_000, // $5K mid of $1-5K range
    probability: 20,
    tags: ["nurture", "p3", "cursive-lto", "pixel-outbound"],
    notes: `PRIORITY: P3 — no date set
DEAL: $1,000 – $5,000 (low-ticket)
PAID: No
STAGE: Interested, low engagement

SCOPE: Wants outbound with pixel. Had leads generated previously, low engagement since. Likely fits Cursive LTO offer.`,
  },
  {
    matchPatterns: [/jason smith/i, /audience lab/i],
    contactName: "Jason Smith",
    companyName: "Audience Labs",
    stage: "consideration",
    source: "other",
    assignedTo: "Adam",
    companyTag: "am_collective",
    industry: "Data / Email Infrastructure",
    estimatedValueCents: 100_000, // $1K/mo
    probability: 35,
    nextFollowUpAt: "2026-04-24",
    tags: ["nurture", "p2", "quote-pending", "inbox-infra"],
    notes: `PRIORITY: P2 — send quote this week
DEAL: ~$1,000/mo (inboxes quote)
PAID: No

SCOPE:
- Quote him on inbox infrastructure (~$1K/mo)
- Ask how he's been using Audience Labs

NOTE: Not a partnership — straight client engagement.`,
  },
  {
    matchPatterns: [/caleb/i, /kreg/i],
    contactName: "Caleb",
    companyName: "Kreg AI",
    stage: "interest",
    source: "referral",
    assignedTo: "Adam",
    companyTag: "am_collective",
    industry: "AI / CampusGTM",
    estimatedValueCents: null,
    probability: null,
    tags: ["nurture", "p2", "campusgtm", "acquisition-play", "cto"],
    notes: `PRIORITY: P2 — book meeting
TYPE: CampusGTM venture play
DEAL: TBD

SCOPE:
- Evaluate his product for absorption into CampusGTM
- Use our distribution
- Position Caleb as CTO to make the product work`,
  },
  {
    matchPatterns: [/mason.*cannabis/i, /cannabis.*wholesale/i],
    contactName: "Mason",
    companyName: "Cannabis Wholesale (TBD name)",
    stage: "awareness",
    source: "other",
    assignedTo: "Adam",
    companyTag: "am_collective",
    industry: "Cannabis / Wholesale Distribution",
    estimatedValueCents: null,
    probability: null,
    nextFollowUpAt: "2026-04-25",
    tags: ["nurture", "p2", "future", "cannabis"],
    notes: `PRIORITY: P2 — reach out in ~1 week
DEAL: TBD
STAGE: Future prospect

SCOPE: Site + CRM + dashboard for cannabis wholesale distribution.

NOTE: Mason's dispensary distribution venture — SEPARATE from Truffle Boys.`,
  },
  {
    matchPatterns: [/paul weinhold/i, /uo foundation/i],
    contactName: "Paul Weinhold",
    companyName: "UO Foundation",
    stage: "nurture",
    source: "university",
    assignedTo: "Maggie",
    companyTag: "am_collective",
    industry: "Higher Education / Foundation",
    estimatedValueCents: 5_000_000, // $50K Phase 2
    probability: 25,
    tags: ["nurture", "p2", "phase-2-potential", "phase-1-delivered"],
    notes: `PRIORITY: P2 — no date set
OWNER: Maggie
DEAL: $50,000 Phase 2 potential (AM Collective)
PAID: Phase 1 delivered
STAGE: Nurture

SCOPE:
- Ping Paul to gauge Phase 2 interest or small project work
- Women's Leadership Board meeting upcoming`,
  },
];

function matchExisting<T extends { contactName: string; companyName: string | null }>(
  master: MasterLead,
  existing: T[]
): T | undefined {
  return existing.find((e) => {
    const haystack = `${e.contactName} ${e.companyName ?? ""}`;
    return master.matchPatterns.some((p) => p.test(haystack));
  });
}

async function main() {
  console.log("Loading existing leads...");
  const existingLeads = await db.select().from(leads);
  console.log(`  ${existingLeads.length} existing leads`);

  console.log("Archiving all non-archived existing leads...");
  const archiveResult = await db
    .update(leads)
    .set({ isArchived: true, updatedAt: new Date() })
    .where(eq(leads.isArchived, false))
    .returning({ id: leads.id });
  console.log(`  archived ${archiveResult.length} leads`);

  const usedIds = new Set<string>();

  for (const m of MASTER) {
    const match = matchExisting(m, existingLeads);
    const now = new Date();

    if (match && !usedIds.has(match.id)) {
      usedIds.add(match.id);
      await db
        .update(leads)
        .set({
          contactName: m.contactName,
          companyName: m.companyName,
          email: m.email ?? null,
          website: m.website ?? null,
          stage: m.stage,
          source: m.source,
          assignedTo: m.assignedTo,
          companyTag: m.companyTag,
          industry: m.industry ?? null,
          estimatedValue: m.estimatedValueCents,
          probability: m.probability,
          nextFollowUpAt: m.nextFollowUpAt ? new Date(m.nextFollowUpAt) : null,
          tags: m.tags,
          notes: m.notes,
          isArchived: false,
          updatedAt: now,
        })
        .where(eq(leads.id, match.id));
      console.log(`  UPDATED  ${m.contactName} — ${m.companyName}  (${match.id})`);
    } else {
      const inserted = await db
        .insert(leads)
        .values({
          contactName: m.contactName,
          companyName: m.companyName,
          email: m.email ?? null,
          website: m.website ?? null,
          stage: m.stage,
          source: m.source,
          assignedTo: m.assignedTo,
          companyTag: m.companyTag,
          industry: m.industry ?? null,
          estimatedValue: m.estimatedValueCents,
          probability: m.probability,
          nextFollowUpAt: m.nextFollowUpAt ? new Date(m.nextFollowUpAt) : null,
          tags: m.tags,
          notes: m.notes,
          isArchived: false,
        })
        .returning({ id: leads.id });
      console.log(`  INSERTED ${m.contactName} — ${m.companyName}  (${inserted[0]?.id})`);
    }
  }

  // Handle clients not on the master list.
  console.log("\nSweeping non-listed clients...");
  const existingClients = await db.select().from(clients);
  const keepClientPatterns = MASTER.flatMap((m) => m.matchPatterns);

  for (const c of existingClients) {
    const onList = keepClientPatterns.some((p) =>
      p.test(`${c.name} ${c.companyName ?? ""}`)
    );
    if (onList) {
      console.log(`  KEEP   client ${c.name} (${c.id})`);
      continue;
    }
    // Skip Stripe-imported stubs that have a customer ID but no real engagement data.
    if (c.stripeCustomerId && !c.notes) {
      console.log(`  SKIP   stripe-stub ${c.email ?? c.name} (${c.id})`);
      continue;
    }
    const stampedNote = `[ARCHIVED 2026-04-18] Not on April 2026 master list.\n\n${c.notes ?? ""}`.trim();
    await db
      .update(clients)
      .set({
        paymentStatus: "churned",
        notes: stampedNote,
        updatedAt: new Date(),
      })
      .where(eq(clients.id, c.id));
    console.log(`  CHURN  client ${c.name} (${c.id})`);
  }

  // Summary
  const [finalActive, finalArchived, totalLeadCount] = await Promise.all([
    db.select({ id: leads.id }).from(leads).where(eq(leads.isArchived, false)),
    db.select({ id: leads.id }).from(leads).where(eq(leads.isArchived, true)),
    db.select({ id: leads.id }).from(leads),
  ]);

  console.log("\n─── SUMMARY ───");
  console.log(`Active leads:   ${finalActive.length}`);
  console.log(`Archived leads: ${finalArchived.length}`);
  console.log(`Total leads:    ${totalLeadCount.length}`);
  console.log(`Master list:    ${MASTER.length}`);

  // Silence unused import warning
  void and;
  void isNull;
  void not;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
