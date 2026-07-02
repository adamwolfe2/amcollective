/**
 * PRD Ingest — 2026-07-02 Littlebird operator handoff.
 *
 * Idempotent upsert of every in-scope portfolio entity into `leads` (the
 * single tracker grid). Spec: .claude/specs/2026-07-02-crm-refresh.md.
 *
 * Rules honored:
 * - All $ figures PROVISIONAL until confirmed against Mercury/signed docs.
 * - Contradictions preserved in notes as [CONFLICT]/[VERIFY], never flattened.
 * - Backlog rows data_confidence = stale.
 * - Excluded entities (Modern Amenities, AIMS, VendHub, VendScout, SteelTrap,
 *   + 7 explicitly-removed items) are NOT here and must never be added.
 *
 * Run: pnpm exec tsx scripts/seed-prd-2026-07-02.ts
 */

import { config } from "dotenv";
config({ path: ".env.local" });
config({ path: ".env" });

import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { and, eq, ilike } from "drizzle-orm";
import * as schema from "../lib/db/schema";
import type { CompanyTag } from "../lib/db/schema/costs";

const sql = neon(process.env.DATABASE_URL!);
const db = drizzle(sql, { schema });

type Stage =
  | "prospect"
  | "active"
  | "proposal"
  | "nurture"
  | "awareness"
  | "interest"
  | "consideration"
  | "intent";

type Row = {
  companyName: string;
  contactName: string;
  companyTag: CompanyTag;
  stage: Stage;
  priority: "P0" | "P1" | "P2";
  email?: string;
  correctEmail?: string;
  assignedTo?: string;
  ownerSecondary?: string;
  totalValue?: number; // cents
  mrr?: number; // cents
  collected?: number; // cents
  payStatus?: "on_track" | "pending" | "overdue" | "paid";
  nextStep: string;
  lastStepDate?: string; // yyyy-mm-dd
  notes: string;
  tags?: string[];
  ipOrLegalFlag?: boolean;
  dataConfidence?: "verified" | "provisional" | "stale";
};

const $ = (dollars: number) => Math.round(dollars * 100);
const PRD = "[PRD 2026-07-02]";

const ROWS: Row[] = [
  // ─── CURSIVE ───────────────────────────────────────────────────────────────
  {
    companyName: "Mentor126",
    contactName: "Ted Theocheung",
    companyTag: "cursive",
    stage: "proposal",
    priority: "P0",
    email: "ted@mentor126.ai",
    correctEmail: "ted@mentor126.ai",
    assignedTo: "Adam",
    totalValue: $(84000),
    mrr: $(14000),
    collected: 0,
    payStatus: "overdue",
    lastStepDate: "2026-06-23",
    nextStep:
      "Reconcile operative contract version; close CIIAA eSignature + SOW revision; keep campaign live while reducing scope-risk.",
    notes: `${PRD} [CONFLICT] Two real contract versions: $60K/16wk ($15K milestones) vs $84K/26wk/$14K-MRR expansion — expansion likely live, UNRECONCILED. ~$14K invoice overdue since ~May 25. [VERIFY] CRM had tedi@ — canonical is ted@mentor126.ai. 3-channel system live (paid ads/Adstra + cold email/Cursive + LinkedIn + UGC). Last step Jun 23 funnel sync; weekly Tue 10am. Highest-leverage AND highest-complexity account — both client record and top operational workstream.`,
    tags: ["collections", "conflict:contract-version"],
  },
  {
    companyName: "Olander",
    contactName: "David",
    companyTag: "cursive",
    stage: "active",
    priority: "P0",
    email: "david@olander.com",
    assignedTo: "Adam",
    totalValue: $(3500),
    mrr: $(1500),
    collected: $(3500),
    payStatus: "on_track",
    nextStep:
      "Verify Andrew handoff; connect 96 inboxes to EmailBison; relaunch with fastener-tailored copy; monitor performance.",
    notes: `${PRD} Robotics/manufacturing lead gen; execution partly handed to Andrew. BLOCKED: 96 inboxes need connecting to EmailBison — revenue-in-motion stalled purely on infrastructure.`,
    tags: ["blocked:infrastructure"],
  },
  {
    companyName: "Superpower Mentors",
    contactName: "Jake Sussman",
    companyTag: "cursive",
    stage: "active",
    priority: "P0",
    email: "jake@superpower.com",
    assignedTo: "Adam",
    payStatus: "on_track",
    nextStep:
      "Fix ScaledMail inbox cap; embed Jake's calendar link for direct booking; template replies; FOMO re-engage.",
    notes: `${PRD} Path to $20K/mo retainer at 100-lead milestone. Leverages Jake's Good Morning America appearance. BLOCKED: ScaledMail inbox cap stalling positive replies. [VERIFY] Naming: "Superpower" vs "Superhero" Mentors — screenshot says Superpower.`,
    tags: ["blocked:infrastructure", "verify:naming"],
  },
  {
    companyName: "JustSearched",
    contactName: "Jason Smith",
    companyTag: "cursive",
    stage: "active",
    priority: "P1",
    email: "jason@scail.llc",
    correctEmail: "jason@scail.llc",
    assignedTo: "Adam",
    totalValue: $(2746),
    mrr: $(208),
    collected: $(154),
    payStatus: "on_track",
    nextStep:
      "Confirm campaign launch; resolve 10.5% bounce rate; AudienceLab upsell; book monthly check-in Tuesday.",
    notes: `${PRD} Weekly Wed 1pm. ISSUE: 10.5% bounce rate.`,
  },
  {
    companyName: "Apropos",
    contactName: "Rob Sicat",
    companyTag: "cursive",
    stage: "active",
    priority: "P1",
    email: "rob@apropos.so",
    assignedTo: "Adam",
    totalValue: $(1663),
    collected: 0,
    payStatus: "overdue",
    nextStep:
      "Collect $1,663 invoice; resolve mentor objection; only then re-pitch launch.",
    notes: `${PRD} PAUSED on non-payment + mentor objection. Domains shared with Pitch&Co (7 domains / 21 mailboxes).`,
    tags: ["collections"],
  },
  {
    companyName: "Pitch&Co",
    contactName: "Pitch&Co (org)",
    companyTag: "cursive",
    stage: "active",
    priority: "P1",
    assignedTo: "Adam",
    payStatus: "pending",
    nextStep:
      "Audit reply/meeting performance; add no-risk offer before any $50K ask; iterate copy/list.",
    notes: `${PRD} Tied to Apropos domains (7 domains / 21 mailboxes). Campaign live.`,
  },
  {
    companyName: "Blackwood Firm",
    contactName: "Gabriel Fonseca",
    companyTag: "cursive",
    stage: "active",
    priority: "P1",
    email: "gabriel@blackwoodfirm.com",
    assignedTo: "Adam",
    payStatus: "pending",
    nextStep:
      "Diagnose LTO bottleneck (traffic/copy/pricing/offer); decide dedicated cold-email operator vs ACM intern; convert expansion into scoped commercial deal.",
    notes: `${PRD} 35% rev-share, no equity. Wholesale-distribution build scoped ~$50K / ~2mo. ISSUE: LTO not converting ("people aren't buying").`,
    tags: ["rev-share"],
  },
  {
    companyName: "Uncle Randy",
    contactName: "Randy",
    companyTag: "cursive",
    stage: "active",
    priority: "P2",
    assignedTo: "Adam",
    ownerSecondary: "Maggie",
    payStatus: "pending",
    nextStep:
      "Get Randy's one-pager; Maggie builds structured offer; decide paid vs informal.",
    notes: `${PRD} NIL/video; outbound live to build trust before charging. Also beta-testing Adam's app.`,
  },
  {
    companyName: "Cadel",
    contactName: "Cadel",
    companyTag: "cursive",
    stage: "prospect",
    priority: "P2",
    assignedTo: "Adam",
    totalValue: $(5000),
    mrr: $(2500),
    payStatus: "pending",
    nextStep: "Finalize outbound-infrastructure setup scope; advance proposal ($5K setup + $2.5K/mo).",
    notes: `${PRD} Cadel = "Keto AI" — DISTINCT entity, do not merge with removed Kreo/Caleb (two different things; only Cadel/Keto stays).`,
  },

  // ─── LEASESTACK ────────────────────────────────────────────────────────────
  {
    companyName: "SG Real Estate",
    contactName: "David Shamszad",
    companyTag: "leasestack",
    stage: "active",
    priority: "P1",
    email: "david@sgrealestate.com",
    correctEmail: "david@sgrealestate.com",
    assignedTo: "Adam",
    totalValue: $(12500),
    mrr: $(2499),
    collected: 0,
    payStatus: "pending",
    ipOrLegalFlag: true,
    nextStep:
      "Confirm deposit payment against Mercury; fix AppFolio guest_cards 404; onboard 6 redesigned sites; follow up Jessica re Telegraph Commons operator needs; formalize repeatable LeaseStack commercial offer.",
    notes: `${PRD} $12.5K impl + $2,499/mo Telegraph Commons pilot. [CONFLICT] Notes say SOW executed + kickoff deposit collected; tracker shows full $12.5K pending — VERIFY vs Mercury. ISSUE: AppFolio "guest_cards 404". Top LeaseStack revenue + productization account. LeaseStack IP blocker applies (see internal row).`,
    tags: ["collections", "conflict:payment"],
  },
  {
    companyName: "Trig Investments",
    contactName: "Norman Gensinger",
    companyTag: "leasestack",
    stage: "active",
    priority: "P1",
    email: "norman@triginvestments.com",
    assignedTo: "Adam",
    totalValue: $(4000),
    collected: $(4000),
    payStatus: "paid",
    ipOrLegalFlag: true,
    nextStep:
      "Confirm partnership-agreement signature status cleanly; coordinate LBA Realty rollout.",
    notes: `${PRD} $4K paid. 15% referral, $5K cap + free access. 25+ property family office; champion with admin access. [VERIFY] Norman signature status — linked to unresolved LeaseStack IP (see internal row).`,
  },
  {
    companyName: "LBA Realty",
    contactName: "LBA Realty (via Norman)",
    companyTag: "leasestack",
    stage: "active",
    priority: "P1",
    assignedTo: "Adam",
    payStatus: "pending",
    ipOrLegalFlag: true,
    nextStep:
      "Verify onboarding occurred; deploy chatbots + tracking pixels across co-working/logistics properties; preserve deployment context.",
    notes: `${PRD} Via Norman (Trig). [VERIFY] Track as standalone vs sub of Trig.`,
  },
  {
    companyName: "JLL",
    contactName: "Skye",
    companyTag: "leasestack",
    stage: "prospect",
    priority: "P0",
    assignedTo: "Adam",
    lastStepDate: "2026-05-27",
    payStatus: "pending",
    nextStep:
      "Verify if deck/walkthrough happened; determine live/paused/stale; if live keep Broker Tools partnership + incumbent-displacement angle.",
    notes: `${PRD} P0 upside. STALE — 33 days since May 27 live walkthrough pitch. Built from audit of their internal AI systems.`,
    tags: ["stale"],
  },
  {
    companyName: "ACM Northeastern",
    contactName: "Hannah Bang",
    companyTag: "leasestack",
    stage: "active",
    priority: "P1",
    assignedTo: "Adam",
    payStatus: "pending",
    nextStep: "Finalize project briefs for student teams; push intake (apps were to open Jun 1 — now ~28 days overdue).",
    notes: `${PRD} Student teams (3 devs + 3 designers). OVERDUE ~28 days on intake opening.`,
    tags: ["stale"],
  },
  {
    companyName: "Guardian Properties",
    contactName: "Guardian Properties (org)",
    companyTag: "leasestack",
    stage: "prospect",
    priority: "P2",
    assignedTo: "Maggie",
    payStatus: "pending",
    ipOrLegalFlag: true,
    nextStep: "Maggie sets up lunch/intro; attach named stakeholder when known.",
    notes: `${PRD} Very early.`,
  },
  {
    companyName: "LeaseStack IP (internal blocker)",
    contactName: "Internal — Adam + Maggie",
    companyTag: "leasestack",
    stage: "active",
    priority: "P0",
    assignedTo: "Adam",
    ownerSecondary: "Maggie",
    ipOrLegalFlag: true,
    nextStep:
      "Resolve LeaseStack IP: 50/50 with Maggie under AMC LLC; get clean confirmation of Norman signature status.",
    notes: `${PRD} TOP INTERNAL BLOCKER. LeaseStack IP/ownership UNRESOLVED — sits under Trig, SG Real Estate, LBA, Guardian. Traction exists DESPITE this. Do not omit from any briefing.`,
    tags: ["internal", "blocker"],
  },

  // ─── CAMPUSGTM ─────────────────────────────────────────────────────────────
  {
    companyName: "DevSwarm",
    contactName: "Mike Biglan",
    companyTag: "campusgtm",
    stage: "active",
    priority: "P0",
    email: "mike@twentyideas.com",
    correctEmail: "mike@twentyideas.com",
    assignedTo: "Adam",
    totalValue: $(50000),
    mrr: $(5500),
    collected: $(22000),
    payStatus: "overdue",
    nextStep:
      "Reconcile true outstanding; package proof of output; tie delivery evidence to payment conversation with Mike; sync campaign output to AM Collective dashboard.",
    notes: `${PRD} [CONFLICT] Outstanding: $28K (tracker) vs higher (prior notes) — RECONCILE. Emails: billing mike@twentyideas.com + accounting@twentyideas.com; cal mike@devswarm.io; we hold adam@devswarm.ai; CRM's mike@devswarm.com is WRONG. Campaigns live (Sunil + Kaushik); HiveShift showing 0 leads x2; off-track. Add co-founder Trevor as secondary contact. Highest cash-collection opportunity.`,
    tags: ["collections", "conflict:balance"],
  },
  {
    companyName: "New York General Intelligence",
    contactName: "New York General Intelligence (org)",
    companyTag: "campusgtm",
    stage: "prospect",
    priority: "P1",
    assignedTo: "Maggie",
    totalValue: $(100000),
    payStatus: "pending",
    nextStep:
      "Run test onboardings on rebuilt CampusGTM; backfill dummy workspaces; show summer email-list outcomes; confirm live buyer path. Demo-readiness is the gate.",
    notes: `${PRD} ~$100K National Founders Club plan. Meeting rescheduled to "next week" (Alex out — keep timing note).`,
  },
  {
    companyName: "David Tam",
    contactName: "David Tam",
    companyTag: "campusgtm",
    stage: "prospect",
    priority: "P0",
    assignedTo: "Maggie",
    payStatus: "pending",
    nextStep:
      "Clarify venture bucket; sign team contract to unlock project pipeline; scope first AI/on-prem job (Greg as potential fulfiller).",
    notes: `${PRD} [VERIFY] Venture fit unconfirmed — P0/verify. Owns GreySnow + a tribe network; wants "as much as possible ASAP."`,
    tags: ["verify:venture-fit"],
  },
  {
    companyName: "Portland Executive Program",
    contactName: "Willis",
    companyTag: "campusgtm",
    stage: "prospect",
    priority: "P1",
    assignedTo: "Adam",
    payStatus: "pending",
    nextStep: "Follow up with Willis; scope the exec-ed program.",
    notes: `${PRD} NET-NEW. Exec-ed program; ~10 paid students through the AI club.`,
  },
  {
    companyName: "AI Collective",
    contactName: "AI Collective (sponsor)",
    companyTag: "campusgtm",
    stage: "prospect",
    priority: "P2",
    assignedTo: "Maggie",
    payStatus: "pending",
    nextStep: "Confirm sponsorship terms.",
    notes: `${PRD} NET-NEW. Sponsor call held.`,
  },
  {
    companyName: "Gilbert",
    contactName: "Gilbert",
    companyTag: "campusgtm",
    stage: "nurture",
    priority: "P2",
    assignedTo: "Maggie",
    nextStep: "Maggie to recruit into capital-team network.",
    notes: `${PRD} NET-NEW. Phil Knight's grandson; CampusGTM capital-team network; low/relationship.`,
  },

  // ─── AM COLLECTIVE AGENCY ──────────────────────────────────────────────────
  {
    companyName: "Investment Portfolio",
    contactName: "Bill Parrish",
    companyTag: "am_collective",
    stage: "active",
    priority: "P1",
    email: "bill@parrish.com",
    assignedTo: "Adam",
    payStatus: "on_track",
    nextStep:
      "Follow up via Ryan to formally start the quarterly European stock research engagement ($2.5K/qtr); finish website rollout.",
    notes: `${PRD} Activation routes through Ryan. Bill slow, low commitment, high leverage — do NOT treat as hot close.`,
  },
  {
    companyName: "POD Project",
    contactName: "Brett Davis",
    companyTag: "am_collective",
    stage: "active",
    priority: "P0",
    email: "brett@pod.com",
    assignedTo: "Adam",
    totalValue: $(15000),
    mrr: $(3000),
    collected: $(3000),
    payStatus: "overdue",
    nextStep:
      "Maggie sends 60/40 Cursive/LeaseStack rev-share proposal; get product list, Square env vars, Ashore admin upgrade; decide revive vs collect vs pause.",
    notes: `${PRD} $12K OVERDUE (May invoice ~$3K unpaid; June invoice due Jun 24). Comms paused for Brett's ordering season (he's ahead of schedule). PPS print shop context: PrintSmith Vision, no API, VPN-gated.`,
    tags: ["collections"],
  },
  {
    companyName: "AI Advisors",
    contactName: "David Gwynn",
    companyTag: "am_collective",
    stage: "active",
    priority: "P1",
    email: "david@aiadvisors.com",
    correctEmail: "david@aiadvisors.com",
    assignedTo: "Adam",
    totalValue: $(1050),
    collected: $(850),
    payStatus: "pending",
    nextStep:
      "Collect $200 (invoice #93OTV0NV); get GTM-NK99T983 + GA4 G-TJ19MYHKSB editor access (add adamwolfe102@gmail.com); stand up weekly automated visitor→Google Sheet retainer hook; push toward recurring advisory.",
    notes: `${PRD} $850 paid / $200 open. Retainer-conversion opportunity (enriched B2B audience: midsize US financial/insurance/healthcare CRO/CFO/GC/boards implementing AI).`,
    tags: ["collections"],
  },
  {
    companyName: "City Scene",
    contactName: "Ed Media",
    companyTag: "am_collective",
    stage: "prospect",
    priority: "P1",
    assignedTo: "Adam",
    ownerSecondary: "Maggie",
    payStatus: "pending",
    nextStep:
      "Clarify real deal path vs exploratory; preserve equity/rev-share angle.",
    notes: `${PRD} Legal entity: Tidal Ad Media. "We build it for you" equity/rev-share hotel-TV app; leverage Ed's distribution (Valley River Inn +); existing poorly-coded app ready to redeploy. Flagship equity-partner template — nonstandard economics.`,
    tags: ["equity"],
  },
  {
    companyName: "Deloitte",
    contactName: "Greg",
    companyTag: "am_collective",
    stage: "nurture",
    priority: "P2",
    email: "greg@deloitte.com",
    assignedTo: "Adam",
    payStatus: "pending",
    nextStep:
      "Send ABCP concerns to Maggie before signing; email LeaseStack + Cursive specs to Hannah; direct outreach to Thompson River U; decide keep-active vs downgrade.",
    notes: `${PRD} Low-confidence. Pixel referral economics ($500 + $1,500/mo + 20% commission). Greg also positioned as freelance on-prem/AI fulfiller for David Tam.`,
  },
  {
    companyName: "Soho House",
    contactName: "Jericho",
    companyTag: "am_collective",
    stage: "nurture",
    priority: "P1",
    email: "jericho@sohohouse.com",
    assignedTo: "Adam",
    payStatus: "on_track",
    nextStep: "Follow up on mentee application; determine active vs archive.",
    notes: `${PRD} ~$25K partnership/access play. Stage ambiguous (Nurture/Active).`,
  },
  {
    companyName: "UO Foundation",
    contactName: "Paul Weinhold",
    companyTag: "am_collective",
    stage: "nurture",
    priority: "P2",
    assignedTo: "Maggie",
    totalValue: $(10000),
    payStatus: "pending",
    nextStep:
      "Await client approval for Maggie to lead the $10K AI-usage advisory (CFO Paul); Maggie schedules Phase 2 scoping call.",
    notes: `${PRD} Weighted ~$13K of $50K. STALE ~45 days.`,
    tags: ["stale"],
  },
  {
    companyName: "Portland Bottling",
    contactName: "Portland Bottling (org)",
    companyTag: "am_collective",
    stage: "prospect",
    priority: "P2",
    assignedTo: "Maggie",
    payStatus: "pending",
    nextStep: "Light nurture only; follow up before season.",
    notes: `${PRD} Met. Possible build later this summer — nothing concrete yet (agency build).`,
  },

  // ─── RESELLER / PARTNER (net-new bucket) ───────────────────────────────────
  {
    companyName: "Cursive Reseller (Josh)",
    contactName: "Josh",
    companyTag: "reseller",
    stage: "active",
    priority: "P0",
    assignedTo: "Adam",
    lastStepDate: "2026-07-01",
    payStatus: "pending",
    nextStep:
      "Send integration packet; run final real-traffic pixel test; define reseller economics. First paid pixel sale unlocks further inbox spend.",
    notes: `${PRD} NET-NEW — was invisible to CRM. White-label API live (leads.meetcursive.com/api/reseller/v1), built Jun 30–Jul 1; first reseller key minted; 25 real deliveries verified. Adam: "thousands of customers he'd cross-sell us into." Highest upside in portfolio.`,
    tags: ["reseller"],
  },

  // ─── VENTURE PLACEHOLDERS (working memory, flagged for scoping) ────────────
  {
    companyName: "Trackr (venture placeholder)",
    contactName: "Internal",
    companyTag: "trackr",
    stage: "nurture",
    priority: "P2",
    assignedTo: "Adam",
    nextStep: "Scope proper tracker rows for Trackr as a venture/product.",
    notes: `${PRD} Personal venture kept in working memory — no full tracker rows yet.`,
    tags: ["internal", "placeholder"],
  },
  {
    companyName: "Wholesail (venture placeholder)",
    contactName: "Internal",
    companyTag: "wholesail",
    stage: "nurture",
    priority: "P2",
    assignedTo: "Adam",
    nextStep: "Scope proper tracker rows for Wholesail as a venture/product.",
    notes: `${PRD} Personal venture kept in working memory — no full tracker rows yet.`,
    tags: ["internal", "placeholder"],
  },

  // ─── BACKLOG / VERIFY-OR-ARCHIVE (data_confidence = stale) ────────────────
  {
    companyName: "Coffee Wealth Management",
    contactName: "Rory",
    companyTag: "am_collective",
    stage: "nurture",
    priority: "P2",
    assignedTo: "Adam",
    dataConfidence: "stale",
    nextStep: "Verify-or-archive: financial-automation lunch thread.",
    notes: `${PRD} BACKLOG. Do not prioritize.`,
    tags: ["backlog"],
  },
  {
    companyName: "Timber Co (Harvard DSR board)",
    contactName: "Timber co. owner",
    companyTag: "am_collective",
    stage: "nurture",
    priority: "P2",
    assignedTo: "Adam",
    dataConfidence: "stale",
    nextStep: "Verify-or-archive.",
    notes: `${PRD} BACKLOG. On Harvard Data Science Review board — high network value.`,
    tags: ["backlog"],
  },
  {
    companyName: "TBGC Truffle Build (Rocky & Mason)",
    contactName: "Rocky & Mason",
    companyTag: "tbgc",
    stage: "nurture",
    priority: "P2",
    assignedTo: "Adam",
    dataConfidence: "stale",
    nextStep: "Verify-or-archive: ~$20-30K build, likely dormant.",
    notes: `${PRD} BACKLOG. Do not prioritize.`,
    tags: ["backlog"],
  },
  {
    companyName: "DreamLeads",
    contactName: "Brandon Collins",
    companyTag: "am_collective",
    stage: "nurture",
    priority: "P2",
    assignedTo: "Adam",
    dataConfidence: "stale",
    nextStep: "Verify-or-archive.",
    notes: `${PRD} BACKLOG. Do not prioritize.`,
    tags: ["backlog"],
  },
  {
    companyName: "Viaflow",
    contactName: "Kashyap",
    companyTag: "am_collective",
    stage: "nurture",
    priority: "P2",
    assignedTo: "Adam",
    dataConfidence: "stale",
    nextStep: "Verify-or-archive.",
    notes: `${PRD} BACKLOG. Do not prioritize.`,
    tags: ["backlog"],
  },
];

async function upsertRow(row: Row) {
  const existing = await db
    .select({ id: schema.leads.id, companyName: schema.leads.companyName })
    .from(schema.leads)
    .where(
      and(
        ilike(schema.leads.companyName, row.companyName),
        eq(schema.leads.isArchived, false)
      )
    )
    .limit(1);

  const values = {
    companyTag: row.companyTag,
    contactName: row.contactName,
    companyName: row.companyName,
    email: row.email ?? null,
    correctEmail: row.correctEmail ?? null,
    stage: row.stage,
    assignedTo: row.assignedTo ?? "Adam",
    ownerSecondary: row.ownerSecondary ?? null,
    priority: row.priority,
    nextStep: row.nextStep,
    lastStepDate: row.lastStepDate ?? null,
    payStatus: row.payStatus ?? null,
    totalValue: row.totalValue ?? null,
    mrr: row.mrr ?? null,
    collected: row.collected ?? null,
    ipOrLegalFlag: row.ipOrLegalFlag ?? false,
    dataConfidence: row.dataConfidence ?? ("provisional" as const),
    notes: row.notes,
    tags: row.tags ?? [],
  };

  if (existing.length > 0) {
    await db
      .update(schema.leads)
      .set(values)
      .where(eq(schema.leads.id, existing[0].id));
    return "updated" as const;
  }

  await db.insert(schema.leads).values(values);
  return "inserted" as const;
}

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error("[seed-prd] DATABASE_URL not set. Aborting.");
    process.exit(1);
  }

  console.log(`[seed-prd] Ingesting ${ROWS.length} PRD entities...`);
  let inserted = 0;
  let updated = 0;

  for (const row of ROWS) {
    try {
      const result = await upsertRow(row);
      if (result === "inserted") inserted += 1;
      else updated += 1;
      console.log(`[seed-prd] ${result}: ${row.companyName}`);
    } catch (err) {
      console.error(`[seed-prd] FAILED: ${row.companyName}`, err);
      throw err;
    }
  }

  console.log(
    `[seed-prd] Done. ${inserted} inserted, ${updated} updated, ${ROWS.length} total.`
  );
  console.log(
    "[seed-prd] All figures data_confidence=provisional until Mercury/signed-doc confirmation."
  );
}

main().catch((err) => {
  console.error("[seed-prd] Seed failed:", err);
  process.exit(1);
});
