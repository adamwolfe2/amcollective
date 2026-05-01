/**
 * Seed: AM Collective 40-Task Strategic Roadmap
 *
 * Pushes the full Top-10 + Waves 1-5 roadmap into the `tasks` table so /command
 * surfaces them in priority order. Idempotent — uses a stable label
 * ("roadmap:2026-q2") to avoid duplicate inserts on re-run.
 *
 * Run:  npx tsx --env-file=.env.local scripts/seed-strategic-roadmap.ts
 *
 * Filters: each task is tagged with structured labels:
 *   - rank:NN              (1-40, sortable)
 *   - wave:top10|1|2|3|4|5 (execution wave)
 *   - tier:1|2|3           (tier within Top 10)
 *   - tag:content|research|engineering
 *   - est:Nhr              (estimated hours)
 *   - venture:<slug>       (which venture this serves, if any)
 *   - client:<slug>        (which client this serves, if any)
 *   - depends:#NN          (blocking dependency, if any)
 *   - roadmap:2026-q2      (constant, used for idempotency)
 *
 * Re-running will skip rows whose title already exists with the roadmap label.
 */

import { config } from "dotenv";
config({ path: ".env.local" });

import { db } from "../lib/db";
import { tasks } from "../lib/db/schema/operations";
import { sql } from "drizzle-orm";

type Tier = 1 | 2 | 3 | null;
type Wave = "top10" | "1" | "2" | "3" | "4" | "5";
type Tag = "content" | "research" | "engineering";

interface TaskSeed {
  rank: number;
  wave: Wave;
  tier?: Tier;
  title: string;
  description: string;
  tag: Tag;
  estHours: number;
  /** Days from today the due date should be (null = no due date) */
  dueInDays: number | null;
  ventures?: string[];
  clients?: string[];
  dependsOn?: number[];
}

const ROADMAP_LABEL = "roadmap:2026-q2";

const ROADMAP: TaskSeed[] = [
  // ─── TIER 1 — Cash & Revenue Unlockers ─────────────────────────────────────
  {
    rank: 1,
    wave: "top10",
    tier: 1,
    title: "Randy's Tier 1 Hot Lead Email Sequence",
    description: `3-touch sequence for funded West Coast startups (60+ lead score). Subject lines, body copy, CTAs, send cadence for the $30K-$50K offer.

Why: Case study engine. First meetings booked = proof for GHL snapshot VSL. Unblocks the entire Cursive proof-of-concept angle.

Deliverable: 3 email drafts (initial + 2 follow-ups), per-touch CTA, A/B subject line variants, send cadence (Day 0/3/7).`,
    tag: "content",
    estHours: 2,
    dueInDays: 0,
    ventures: ["cursive"],
    clients: ["randy"],
  },
  {
    rank: 2,
    wave: "top10",
    tier: 1,
    title: "CampusGTM Email Sequences",
    description: `Cold outbound sequences for Anthropic, Perplexity, ElevenLabs, DevSwarm contacts. 85% ready per audit.

Why: $100K signed, $10-15K MRR potential. Highest-readiness venture.

Deliverable: 3-touch sequences for each named target, role-specific angles (Head of Developer Relations, Growth, Marketing).`,
    tag: "content",
    estHours: 2,
    dueInDays: 0,
    ventures: ["campusgtm"],
  },
  {
    rank: 3,
    wave: "top10",
    tier: 1,
    title: "Superpower Mentors VSL Script",
    description: `Draft VSL copy for Jake's approval. 17K leads loaded, milestone clock doesn't start until approved.

Why: Directly unblocks $0→$20K/mo performance deal. Jake is the bottleneck — give him something to approve.

Deliverable: Full VSL script (5-7 min), hook + problem + solution + proof + CTA. Plain text + production notes for VO.`,
    tag: "content",
    estHours: 2,
    dueInDays: 0,
    clients: ["superpower-mentors"],
  },

  // ─── TIER 2 — Infrastructure & Hiring ──────────────────────────────────────
  {
    rank: 4,
    wave: "top10",
    tier: 2,
    title: "Cold Email Operator Job Post — Go Live",
    description: `Format the JD for Beehiiv, Upwork, LinkedIn, X. Draft actual post copy per channel.

Why: 3 parallel outbound workstreams = can't solo this. Every day without posting = a week later to hire.

Deliverable: 4 channel-specific post drafts, posting schedule, screening rubric.`,
    tag: "content",
    estHours: 1.5,
    dueInDays: 1,
  },
  {
    rank: 5,
    wave: "top10",
    tier: 2,
    title: "Randy's Clay Table Blueprint",
    description: `Exact Clay table config: source columns, enrichment columns, AI prompts for trigger events, scoring formula, Crunchbase sync setup.

Why: Randy's ICP is solid as PDF but not buildable. Turn into step-by-step Clay instructions the new hire can execute Day 1.

Deliverable: Clay table spec doc (column-by-column), enrichment waterfall, scoring SQL.`,
    tag: "research",
    estHours: 2,
    dueInDays: 2,
    clients: ["randy"],
    ventures: ["cursive"],
  },
  {
    rank: 6,
    wave: "top10",
    tier: 2,
    title: "Domain Warmup Audit & Action Plan",
    description: `Audit current ScaledMail/Instantly domain health across all ventures. Which are warm? Which need to start NOW? Segment by engagement.

Why: Outbound audit flagged "START WARMUP NOW" for Cursive. Randy needs separate domains. Every day delayed = 14 more days to full warmup.

Deliverable: Domain inventory spreadsheet, health score per domain, 30-day warmup acquisition plan.`,
    tag: "research",
    estHours: 1.5,
    dueInDays: 1,
    ventures: ["cursive"],
  },

  // ─── TIER 3 — Strategic Leverage ───────────────────────────────────────────
  {
    rank: 7,
    wave: "top10",
    tier: 3,
    title: "Hook — Kill or Champion Decision Brief",
    description: `Research 3 potential champions/operators who could own Hook. Comp, equity split options, 30-day handoff plan. Deadline: May 30.

Why: Kill-or-delegate decision. 29 days left. Brief = decision in one meeting instead of agonizing.

Deliverable: 3 candidate profiles, comp structure options, handoff playbook, kill criteria.`,
    tag: "research",
    estHours: 2,
    dueInDays: 7,
    ventures: ["hook"],
  },
  {
    rank: 8,
    wave: "top10",
    tier: 3,
    title: "Collections Follow-Up Tracker",
    description: `Tracking sheet for $65.5K outstanding across 7 clients: who owes what, email sent date, follow-up date, status. Build cadence Day 3/7/14.

Why: Without tracking, follow-ups slip. 30 min of engineering saves hours of mental overhead.

Deliverable: Neon table + admin route showing aged receivables with action buttons (send nudge, mark paid, escalate).`,
    tag: "engineering",
    estHours: 1,
    dueInDays: 3,
  },
  {
    rank: 9,
    wave: "top10",
    tier: 3,
    title: "GHL Snapshot VSL Outline + Copy Framework",
    description: `Outline VSL structure, key proof points, draft first 60 seconds of copy. Leave case study section as placeholder for Randy's results.

Why: Gabriel needs product definition. VSL outline IS the product definition — forces articulating offer, proof, CTA.

Deliverable: Full VSL outline, hook script (60s), proof template ready for Randy data.`,
    tag: "content",
    estHours: 2,
    dueInDays: 7,
    ventures: ["cursive"],
    dependsOn: [1],
  },
  {
    rank: 10,
    wave: "top10",
    tier: 3,
    title: "Cursive Pricing Page & Positioning Copy",
    description: `Pricing page copy: 4 tiers ($199-custom), feature comparison, objection-handling copy. Use existing competitive intel.

Why: Without pricing page, every sales conversation requires custom quote. Standardizes the close.

Deliverable: Pricing page copy doc, feature comparison table, top 5 objections + responses.`,
    tag: "content",
    estHours: 2,
    dueInDays: 7,
    ventures: ["cursive"],
  },

  // ─── WAVE 1 — Revenue Acceleration ─────────────────────────────────────────
  {
    rank: 11,
    wave: "1",
    title: "LeaseStack: Convert 29 Intake Submissions",
    description: `29 real estate intake submissions sitting unconverted. Research each, score them, draft outreach copy to convert top 10 into paying portfolio companies.

Deliverable: Scored list of 29 submissions, top 10 prioritized, outreach copy per top 10. Due 5/8 per rocks.`,
    tag: "research",
    estHours: 2,
    dueInDays: 8,
    ventures: ["leasestack"],
  },
  {
    rank: 12,
    wave: "1",
    title: "Wholesail: PE + Wholesale Lead List Build",
    description: `Pull 200 PE firms + wholesale distributors via Clay. Score by revenue, geography, tech stack. White-label distribution play.

Deliverable: 200-row Clay table, scoring rubric, segmentation by ICP. Due 5/5 per rocks.`,
    tag: "research",
    estHours: 2,
    dueInDays: 5,
    ventures: ["wholesail"],
  },
  {
    rank: 13,
    wave: "1",
    title: "Wholesail Cold Email Sequence",
    description: `3-touch sequences for PE ops partners and wholesale distributors. Different angles: "replace your ordering portal in 48 hours" vs "white-label your distribution stack."

Deliverable: 2 distinct 3-touch sequences (6 emails total) for the two ICP segments.`,
    tag: "content",
    estHours: 2,
    dueInDays: 7,
    ventures: ["wholesail"],
    dependsOn: [12],
  },
  {
    rank: 14,
    wave: "1",
    title: "CampusGTM: Product Champion Recruitment Brief",
    description: `Pitch deck for Caleb (Kreo AI / potential CTO): equity/comp structure, 90-day roadmap, what "CTO of CampusGTM" means. Maggie needs this to close.

Deliverable: 8-slide deck + comp model + 90-day plan + decision deadline.`,
    tag: "content",
    estHours: 2,
    dueInDays: 10,
    ventures: ["campusgtm"],
  },
  {
    rank: 15,
    wave: "1",
    title: "Trig Investments → LeaseStack Retainer Proposal",
    description: `Convert Norman's weekly check-ins into recurring $2.8K+/mo retainer with LeaseStack POC baked in. Cleanest upsell.

Deliverable: Retainer proposal doc, scope tiers, monthly deliverables, conversion timeline.`,
    tag: "content",
    estHours: 1.5,
    dueInDays: 7,
    clients: ["trig"],
    ventures: ["leasestack"],
  },
  {
    rank: 16,
    wave: "1",
    title: "Collections Tracker + Follow-Up Automation",
    description: `Tracking system for $65.5K outstanding: who owes what, last email sent, next follow-up, status. Automated reminder cadence (Day 3/7/14).

Deliverable: Neon table + Inngest cron for nudges + /command widget for aged receivables.`,
    tag: "engineering",
    estHours: 2,
    dueInDays: 10,
    dependsOn: [8],
  },

  // ─── WAVE 2 — Outbound Infrastructure ──────────────────────────────────────
  {
    rank: 17,
    wave: "2",
    title: "ScaledMail Domain Inventory + Segmentation Plan",
    description: `Audit every domain across Olander (133 inboxes, 32 alias domains), Randy, Cursive outbound. Map to engagement, flag contamination risks, draft acquisition list for new workstreams.

Deliverable: Domain inventory CSV, contamination risk report, 90-day acquisition plan.`,
    tag: "research",
    estHours: 2,
    dueInDays: 14,
  },
  {
    rank: 18,
    wave: "2",
    title: "EmailBison → Cursive Feedback Loop: Build Spec",
    description: `Engineering spec for the loop architecture: API endpoints, webhook payloads, data models, Neon schema changes, 2-sprint implementation plan for the cold email hire.

Deliverable: Tech spec doc with sequence diagrams, schema migration, Inngest function stubs, KPIs.`,
    tag: "engineering",
    estHours: 3,
    dueInDays: 14,
    ventures: ["cursive"],
  },
  {
    rank: 19,
    wave: "2",
    title: "Instantly Workspace Segmentation",
    description: `Separate Instantly workspaces (or campaigns) per client engagement: Randy ≠ Olander ≠ Cursive ≠ Wholesail. Map sending limits, warmup schedules, reply routing.

Deliverable: Workspace map, daily send budget per workspace, reply routing rules.`,
    tag: "research",
    estHours: 1.5,
    dueInDays: 14,
  },
  {
    rank: 20,
    wave: "2",
    title: "AudienceLab Pixel Deployment Audit",
    description: `Audit which ventures have pixel installed, which don't. Draft deployment checklist for all 12 venture domains. Cross-portfolio intent data.

Deliverable: Pixel deployment status doc + step-by-step install playbook + monitoring dashboard plan.`,
    tag: "research",
    estHours: 1.5,
    dueInDays: 17,
  },
  {
    rank: 21,
    wave: "2",
    title: "Cold Email Operator Onboarding Playbook",
    description: `Day 1-14 onboarding doc: accounts to provision, tools to learn, first campaign (Randy Tier 1 as test), Week 1/2/4 KPIs, escalation paths, reporting templates.

Deliverable: Full onboarding doc + Day 1 checklist + Week 4 review template.`,
    tag: "content",
    estHours: 2,
    dueInDays: 14,
    dependsOn: [4],
  },
  {
    rank: 22,
    wave: "2",
    title: "Randy's Tier 2 (Series B/C) Email Sequence",
    description: `Tier 2 Big Fish sequence — longer cycle, $50K-$100K deal size, CMOs/VPs at Series B/C. Strategic tone, less urgency. Include "Seismic Shift" angle from ICP doc.

Deliverable: 4-touch sequence with 2 subject line variants per touch.`,
    tag: "content",
    estHours: 2,
    dueInDays: 14,
    clients: ["randy"],
    ventures: ["cursive"],
  },

  // ─── WAVE 3 — Product & Client Leverage ────────────────────────────────────
  {
    rank: 23,
    wave: "3",
    title: "GHL Snapshot Product Definition Doc",
    description: `What the snapshot includes, pricing tiers, ICP, fulfillment workflow, what Gabriel owns vs automated. Foundation for VSL (#9) and Gabriel's workstream.

Deliverable: Product spec doc + pricing model + fulfillment SOP.`,
    tag: "content",
    estHours: 2,
    dueInDays: 21,
  },
  {
    rank: 24,
    wave: "3",
    title: "Superpower Mentors: 17K Lead Segmentation",
    description: `Identify top 500 by title/company/intent signals. Create 3 audience segments for cold campaign that activates once Jake approves VSL.

Deliverable: Segmented Clay table + 3 audience definitions + send order.`,
    tag: "research",
    estHours: 2,
    dueInDays: 21,
    clients: ["superpower-mentors"],
    dependsOn: [3],
  },
  {
    rank: 25,
    wave: "3",
    title: "TaskSpace: 3-Demo Outreach Campaign",
    description: `Validate external demand. Identify 20 EOS-implementing companies, draft 2-touch cold email, build target list. 3 demos proves (or kills) demand. Due 5/10 per rocks.

Deliverable: 20-row target list + 2-touch sequence + demo-booking landing page.`,
    tag: "content",
    estHours: 2,
    dueInDays: 10,
    ventures: ["taskspace"],
  },
  {
    rank: 26,
    wave: "3",
    title: "Trackr: Thara Sales Activation Plan",
    description: `2-week sprint with specific targets (5 demos, 1 close), talk track, replacement sourcing plan if missed.

Deliverable: Performance plan doc + talk track + weekly check-in template + contingency hire spec.`,
    tag: "content",
    estHours: 1.5,
    dueInDays: 10,
    ventures: ["trackr"],
  },
  {
    rank: 27,
    wave: "3",
    title: "MyVSL Productization Spec",
    description: `Multi-tenant: onboarding flow, pricing page, template library, launch checklist. If Superpower Mentors VSL performs, this becomes a sellable product.

Deliverable: Engineering spec + onboarding flow diagram + pricing model + launch checklist.`,
    tag: "engineering",
    estHours: 3,
    dueInDays: 30,
    ventures: ["myvsl"],
    dependsOn: [3],
  },
  {
    rank: 28,
    wave: "3",
    title: "DevSwarm Engagement Close-Out Brief",
    description: `Close-out doc: deliverables completed, invoice summary, final payment schedule, clean handoff to Leo. Stop the bleed on this engagement.

Deliverable: Close-out doc + final invoice + Leo handoff checklist.`,
    tag: "content",
    estHours: 1.5,
    dueInDays: 7,
    clients: ["devswarm"],
  },

  // ─── WAVE 4 — Strategic Positioning ────────────────────────────────────────
  {
    rank: 29,
    wave: "4",
    title: "Cursive Case Study Template",
    description: `Build the template NOW so Randy results plug in immediately. Structure: challenge → approach → Clay triggers → results → CTA. Use for GHL VSL, Cursive sales page, outbound proof.

Deliverable: Case study template doc + design comps + populated example using fake data.`,
    tag: "content",
    estHours: 1.5,
    dueInDays: 30,
    ventures: ["cursive"],
  },
  {
    rank: 30,
    wave: "4",
    title: "AM Collective Capabilities Deck",
    description: `10-slide deck: portfolio overview, case studies (Olander infra, DevSwarm ambassador, Cursive lead marketplace), engagement models, pricing tiers. Unlocks Greg/Deloitte (40%) and full nurture pipeline.

Deliverable: 10-slide deck + 3 case studies + engagement tiers + pricing.`,
    tag: "content",
    estHours: 2,
    dueInDays: 30,
  },
  {
    rank: 31,
    wave: "4",
    title: "Nurture Pipeline Activation Sequences",
    description: `Personalized 2-touch re-engagement emails for each: Greg/Deloitte, DreamLeads, Viaflow, JustSearched, Kreo AI, Cannabis/Mason, UO Foundation, Soho House. Specific CTAs per contact.

Deliverable: 8 personalized 2-touch sequences = 16 emails total.`,
    tag: "content",
    estHours: 2,
    dueInDays: 35,
    dependsOn: [30],
  },
  {
    rank: 32,
    wave: "4",
    title: "Portfolio Revenue Dashboard Spec",
    description: `Dashboard pulling from Stripe + manual: MRR by venture, outstanding by client, pipeline by stage, 12-month forecast. AMCollectiveOS command center MVP done right.

Deliverable: Engineering spec + wireframes + Inngest sync plan + Drizzle schema delta.`,
    tag: "engineering",
    estHours: 3,
    dueInDays: 35,
  },
  {
    rank: 33,
    wave: "4",
    title: "TBGC DNS + Cannabis/Mason Unblock",
    description: `Research the DNS issue, document the fix, draft Mason onboarding sequence so the moment TBGC goes live, Cannabis/Mason starts (target 5/15).

Deliverable: DNS fix runbook + Mason onboarding email sequence + 5/15 launch plan.`,
    tag: "research",
    estHours: 1.5,
    dueInDays: 14,
    ventures: ["tbgc"],
    clients: ["mason"],
  },
  {
    rank: 34,
    wave: "4",
    title: "Consolidated Inbox Architecture",
    description: `Audit all email addresses across ventures, map routing rules, spec consolidated inbox using Gmail + filters or Missive/Front. Operator sanity infrastructure.

Deliverable: Address inventory + filter ruleset + tool decision (Gmail vs Missive vs Front) + migration plan.`,
    tag: "research",
    estHours: 2,
    dueInDays: 30,
  },

  // ─── WAVE 5 — Delegation & Scale ───────────────────────────────────────────
  {
    rank: 35,
    wave: "5",
    title: "Venture Champion Recruitment Playbook",
    description: `Role descriptions for 3 tiers (intern, champion, co-owner), comp/equity frameworks, weekly reporting templates, sourcing channels. One playbook, reusable across 13 ventures.

Deliverable: Recruitment playbook doc + 3 JD templates + comp model + sourcing channel list.`,
    tag: "content",
    estHours: 2,
    dueInDays: 45,
  },
  {
    rank: 36,
    wave: "5",
    title: "EOS Rocks + Scorecard System for AMCollectiveOS",
    description: `Spec digital implementation: rocks per venture, weekly scorecard inputs, L10 agenda generator, issue tracking. Validate if TaskSpace fits or build custom in admin portal.

Deliverable: Build-vs-buy decision doc + engineering spec for chosen path + migration plan from current manual EOS.`,
    tag: "engineering",
    estHours: 3,
    dueInDays: 45,
  },
  {
    rank: 37,
    wave: "5",
    title: "Maggie Delegation Expansion Plan",
    description: `Maggie owns CampusGTM + UO Foundation. Most proven delegate. Research 2-3 additional ventures she could absorb (MySLP? Wholesail? Hook champion?), draft scope expansion + comp adjustments + 30-day transition.

Deliverable: Expansion proposal + 30-day transition plan + new comp structure.`,
    tag: "content",
    estHours: 2,
    dueInDays: 45,
    dependsOn: [7],
  },
  {
    rank: 38,
    wave: "5",
    title: "JustSearched Inbox Infrastructure Quote",
    description: `Scoped proposal: ScaledMail setup, domain acquisition, warmup timeline, Instantly config, monthly mgmt fee. Cursive services upsell.

Deliverable: Proposal doc with itemized scope + monthly retainer + setup fee + timeline.`,
    tag: "content",
    estHours: 1.5,
    dueInDays: 21,
    ventures: ["cursive"],
  },
  {
    rank: 39,
    wave: "5",
    title: "DreamLeads LinkedIn Automation Test Plan",
    description: `Research best tools (Phantombuster, Dripify, Clay→LinkedIn). 2-week test plan with KPIs, propose pilot. New revenue channel for Cursive.

Deliverable: Tooling decision matrix + 2-week test plan + pilot proposal.`,
    tag: "research",
    estHours: 2,
    dueInDays: 30,
    ventures: ["cursive"],
  },
  {
    rank: 40,
    wave: "5",
    title: "AM Collective Hiring Pipeline: 3 Roles Spec",
    description: `After cold email hire, 3 more roles to break 58hr/wk: (1) CampusGTM product champion, (2) Trackr sales closer (Thara contingency), (3) ops mgr for client engagements. JDs + comp + sourcing.

Deliverable: 3 JDs + comp ranges + sourcing channels + priority ordering.`,
    tag: "content",
    estHours: 2,
    dueInDays: 60,
    dependsOn: [4, 26],
  },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

// Map first-listed venture → the SAFE production company_tag enum values.
// Some values (e.g. myvsl, campusgtm) may exist in schema but not yet in the
// production enum until a migration runs. Defaulting to "am_collective" is
// safe and lossless because the venture is also stored in the labels jsonb.
const VENTURE_TO_COMPANY_TAG: Record<string, string> = {
  cursive: "cursive",
  trackr: "trackr",
  wholesail: "wholesail",
  taskspace: "taskspace",
  hook: "hook",
  leasestack: "leasestack",
  tbgc: "tbgc",
  myvsl: "am_collective",     // not yet in prod enum — fall back
  campusgtm: "am_collective", // not in enum
  // any other venture → am_collective
};

function priorityForTask(t: TaskSeed): "urgent" | "high" | "medium" | "low" {
  if (t.tier === 1) return "urgent";
  if (t.tier === 2 || t.tier === 3) return "high";
  if (t.wave === "1") return "high";
  if (t.wave === "2" || t.wave === "3") return "medium";
  return "low";
}

function buildLabels(t: TaskSeed): string[] {
  const labels: string[] = [
    ROADMAP_LABEL,
    `rank:${String(t.rank).padStart(2, "0")}`,
    `wave:${t.wave}`,
    `tag:${t.tag}`,
    `est:${t.estHours}hr`,
  ];
  if (t.tier) labels.push(`tier:${t.tier}`);
  if (t.ventures) for (const v of t.ventures) labels.push(`venture:${v}`);
  if (t.clients) for (const c of t.clients) labels.push(`client:${c}`);
  if (t.dependsOn) for (const dep of t.dependsOn) labels.push(`depends:#${dep}`);
  return labels;
}

function dueDateFor(t: TaskSeed): Date | null {
  if (t.dueInDays === null) return null;
  const d = new Date();
  d.setDate(d.getDate() + t.dueInDays);
  d.setHours(23, 59, 59, 999);
  return d;
}

function companyTagFor(t: TaskSeed): "trackr" | "wholesail" | "taskspace" | "cursive" | "tbgc" | "hook" | "myvsl" | "leasestack" | "am_collective" | "personal" | "untagged" {
  if (!t.ventures || t.ventures.length === 0) return "am_collective";
  const first = t.ventures[0];
  const tag = VENTURE_TO_COMPANY_TAG[first];
  if (!tag) return "am_collective";
  return tag as never;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`[seed-roadmap] Seeding ${ROADMAP.length} strategic tasks...`);

  // Idempotency: delete any existing rows tagged with this roadmap before re-inserting.
  // This makes the script safe to run repeatedly when the roadmap evolves.
  const deleted = await db.execute(
    sql`DELETE FROM tasks WHERE labels::jsonb @> ${JSON.stringify([ROADMAP_LABEL])}::jsonb RETURNING id`
  );
  // @ts-expect-error neon driver returns { rows: ... }
  const deletedCount = deleted.rows?.length ?? deleted.length ?? 0;
  console.log(`[seed-roadmap] Removed ${deletedCount} existing roadmap rows.`);

  let inserted = 0;
  for (const t of ROADMAP) {
    await db.insert(tasks).values({
      title: `#${String(t.rank).padStart(2, "0")} · ${t.title}`,
      description: t.description,
      status: t.tier === 1 ? "todo" : "backlog",
      priority: priorityForTask(t),
      dueDate: dueDateFor(t),
      labels: buildLabels(t),
      companyTag: companyTagFor(t),
      source: "manual",
      position: t.rank,
      createdById: "seed-strategic-roadmap",
    });
    inserted++;
  }

  console.log(`[seed-roadmap] Inserted ${inserted} tasks.`);
  console.log(`[seed-roadmap] Done. /command will surface these in priority order.`);
  process.exit(0);
}

main().catch((err) => {
  console.error("[seed-roadmap] Failed:", err);
  process.exit(1);
});
