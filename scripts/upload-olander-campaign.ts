/**
 * Upload Olander cold email campaign to EmailBison
 *
 * Usage:
 *   OLANDER_EMAILBISON_KEY="N|xxx" npx tsx scripts/upload-olander-campaign.ts
 *
 * Strategy:
 *   ONE campaign, 4 sequence steps, 3 variants each (2 on the breakup).
 *   Industry-aware via lead custom fields:
 *     - industry          (e.g. "aerospace", "medical", "electronics", "manufacturing")
 *     - cert_standard     (e.g. "AS9100D", "ISO 13485", "ISO 9001:2015")
 *     - cert_focus        (e.g. "Heli-Coil and threaded inserts", "blind rivets")
 *     - job_title         (optional, falls back to "your team")
 *     - department        (optional, falls back to "supply chain")
 *
 *   Tokens use EmailBison's `{token|fallback}` syntax — fallback fires when
 *   the lead doesn't have that custom field set. Sender is David Byrne, CEO.
 *
 * After upload, manually in EmailBison UI:
 *   1. Attach David Byrne's warmed sender inbox(es)
 *   2. Upload leads CSV (columns: email, first_name, company_name, job_title,
 *      department, industry, cert_standard, cert_focus)
 *   3. Set sending schedule (recommend 8am-5pm Pacific, M-Th)
 *   4. Review + launch
 */

export {}; // make this a module so its top-level decls don't collide with other scripts

const BASE_URL = "https://send.meetcursive.com";
const API_KEY = process.env.OLANDER_EMAILBISON_KEY ?? process.env.EMAILBISON_KEY;

if (!API_KEY) {
  console.error("Missing OLANDER_EMAILBISON_KEY env var");
  console.error("Get it from EmailBison → Settings → API for the Olander workspace");
  process.exit(1);
}

async function api<T>(method: string, path: string, body?: Record<string, unknown>): Promise<T> {
  const res = await fetch(`${BASE_URL}/api${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${API_KEY}`,
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`EmailBison ${method} ${path} -> ${res.status}: ${text}`);
  }
  return res.json() as Promise<T>;
}

// ─── EMAIL 1 — INITIAL OUTREACH (Day 0) ──────────────────────────────────────

const E1_A_SUBJECT = "{who handles fasteners at {company_name}|right contact at {company_name}}?";
const E1_A_BODY = `Hi {FIRST_NAME|there},

Quick one — is {job_title|your team} still the right place at {company_name|your company} for {cert_focus|Heli-Coil, threaded inserts, and specialty fasteners}? Don't want to land in the wrong inbox.

I'm David Byrne, CEO of Olander. Sunnyvale, {cert_standard|AS9100D + ISO 9001:2015} certified, 60+ years in fasteners. Reason I'm reaching out: we just helped a {industry|manufacturing} shop cut their fastener expedite fees ~40% with a kitted VMI program.

If you're the right person, I'll send a complete {cert_standard|AS9100D} sample certification package for Heli-Coil — useful even if we never work together.

If not, point me to the right name on your team and the finder's fee is yours: free Sample Box + $25 credit toward their first order.

— David Byrne
CEO, Olander
60+ years · Sunnyvale, CA`;

const E1_B_SUBJECT = "{{company_name} + Heli-Coil|{company_name} fastener sourcing}";
const E1_B_BODY = `Hi {FIRST_NAME|there},

David Byrne here — I run Olander out of Sunnyvale.

Before I send anything: are you the one owning {cert_focus|fastener sourcing} at {company_name|your company}, or is that {department|supply chain}? Want to make sure I'm in the right inbox.

We're the largest stocking Heli-Coil distributor in North America and {cert_standard|AS9100D} certified. A {industry|peer} shop we work with just cut their fastener expedite fees ~40% by switching to our kitted VMI setup.

If you're the right person, I'll send a real Heli-Coil certification package so you can compare it to what you're getting today. 30 seconds to look at, no call needed.

If you're not, just point me the right way — finder's fee on us (free Sample Box + $25 credit).

— David
CEO, Olander`;

const E1_C_SUBJECT = "{right person for fasteners at {company_name}|still the right contact, {FIRST_NAME}}?";
const E1_C_BODY = `Hi {FIRST_NAME|there},

Are you still the right person at {company_name|your company} for Heli-Coil, threaded inserts, and specialty fasteners — or has that moved to someone else on your {department|supply chain} side?

I'm David, CEO of Olander. Sunnyvale-based, {cert_standard|AS9100D + ISO 9001:2015} certified, 60+ years in. Asking because we just trimmed a {industry|peer} shop's fastener expedites ~40% with a kitted VMI program, and I'd rather start at the right desk.

A name and email is all I need. If you reply, I'll send a Heli-Coil sample cert pack as a thank you — useful reference even if you're locked in elsewhere.

— David Byrne, Olander

PS: Point me to the right person and they get a free Sample Box + $25 credit — finder's fee, on us.`;

// ─── EMAIL 2 — VALUE DROP (Day 3) ────────────────────────────────────────────

const E2_A_SUBJECT = "the 5 docs every {cert_standard|AS9100} auditor asks for";
const E2_A_BODY = `{FIRST_NAME|Hey},

Following up — wanted to drop something useful either way.

When {industry|an} auditor walks through your {cert_focus|fastener} program, they're typically looking for 5 documents per part:

1. Material grade cert (full chemistry)
2. Plating spec with measurements
3. Lab testing results (tensile / yield)
4. Dimensional inspection report
5. Heat treatment certification

Most general distributors can produce 1–2. We ship all 5 with every order — no chasing, no follow-up calls to your supplier.

If you want the actual sample package (real Heli-Coil cert bundle, PDF), reply "send it" and I'll have it in your inbox today.

— David
CEO, Olander | {cert_standard|AS9100D · ISO 9001:2015}`;

const E2_B_SUBJECT = "how a {industry|peer} shop cut fastener expedites 40%";
const E2_B_BODY = `{FIRST_NAME|Hey},

Quick follow-up with something concrete.

The {industry|aerospace} shop I mentioned was running into what most of our customers hit — Heli-Coil stockouts triggering expedite fees and line-down hours.

What changed: we built them a kitted VMI program. We hold the stock, their floor pulls what they need, monthly billing. 40% drop in expedite fees in Q1. Their {job_title|buyer} got their nights back.

Happy to put together a quick "what would VMI look like at {company_name|your shop}" — usage profile, suggested kits, estimated savings. No charge, takes me about 20 minutes.

Reply "VMI" and I'll get started.

— David, Olander`;

const E2_C_SUBJECT = "why {industry|shops} stop second-sourcing fasteners";
const E2_C_BODY = `{FIRST_NAME|Hey},

One more before I close the loop —

Most {industry|aerospace and medical} shops we talk to are running 3–5 fastener suppliers to cover gaps. The math rarely works: PO admin overhead, mixed documentation, inconsistent traceability, audit pain.

Teams that consolidate to us aren't doing it to save money. They're doing it because every part comes with the same {cert_standard|AS9100D} paperwork, same format, same turnaround. Audits get boring, which is the point.

Want to see what that looks like in practice? I'll ship you a Heli-Coil sample box + $25 credit so you can test on a real order. Zero strings.

— David Byrne, Olander`;

// ─── EMAIL 3 — DIRECT OFFER (Day 8) ──────────────────────────────────────────

const E3_A_SUBJECT = "free Heli-Coil sample box?";
const E3_A_BODY = `{FIRST_NAME|Hey},

Last value drop —

Want me to ship you a free Heli-Coil sample box? Includes:

→ A range of standard inserts you probably use weekly
→ A free thread checker (the one our techs use daily)
→ $25 credit toward your first order
→ Complete {cert_standard|AS9100D} doc packet so you can stress-test our paperwork

No call, no commitment. If it sits on your desk for a month and you never order, that's fine — the thread checker is yours either way.

Reply with your shipping address and I'll get it out this week.

— David, Olander`;

const E3_B_SUBJECT = "60-second quote on your top 5 SKUs?";
const E3_B_BODY = `{FIRST_NAME|Hey},

If you've got 60 seconds and want a benchmark on what you're paying — send me your top 5 {cert_focus|fastener} SKUs (or a recent PO) and I'll run a head-to-head:

→ Stock availability
→ Lead time
→ Cert package included
→ Net pricing

You get a sanity check on your current supplier. I get to show you what a {cert_standard|certified} fastener distributor looks like. If we're not competitive, you've lost 60 seconds. If we are, you've got an easy second-source.

Reply with the SKUs (or attach a PO) and I'll have it back in 24 hours.

— David Byrne, Olander`;

const E3_C_SUBJECT = "{cert_standard|AS9100D} walk-through — 15 min?";
const E3_C_BODY = `{FIRST_NAME|Hey},

If you'd rather skip the back-and-forth: 15-minute video call where I walk you through our {cert_standard|AS9100D + ISO 9001:2015} setup — receiving, inspection, traceability, doc package generation, the whole flow.

Worst case: you see how a {cert_focus|certified fastener} distributor actually operates and use it as a reference point for your current supplier.

Best case: you've got a backup plan the next time your primary stocks out at the wrong moment.

Reply with a couple times that work and I'll send a Cal link.

— David, Olander`;

// ─── EMAIL 4 — BREAKUP (Day 13) ──────────────────────────────────────────────

const E4_A_SUBJECT = "closing the loop";
const E4_A_BODY = `{FIRST_NAME|Hey},

Last note from me — don't want to keep clogging your inbox.

If {cert_focus|Heli-Coil, threaded inserts, or specialty fasteners} sourcing ever moves up your list, my line's open. The free sample box offer doesn't expire either — just reply "send it" whenever.

If you want me to point you to the right person on my team to keep in your back pocket, happy to do that too.

— David Byrne
CEO, Olander
{cert_standard|AS9100D · ISO 9001:2015} | 60+ years | Sunnyvale, CA`;

const E4_B_SUBJECT = "{should I take the hint|last one from me}?";
const E4_B_BODY = `{FIRST_NAME|Hey},

Reading the room — last one from me.

If you're already locked into a fastener program you love, congrats, that's rare. If not — and {cert_standard|AS9100D} documentation, kitted VMI, or 60+ years of Heli-Coil expertise ever sounds useful — my inbox is open.

PS: Even if you never order from us, if you want a free thread checker mailed to your desk, just reply "thread checker." Useful tool, not a sales trick.

— David, Olander`;

// ─── Upload ──────────────────────────────────────────────────────────────────

interface Campaign { data: { id: number; name: string } }
interface SequenceResponse {
  data: { id: number; sequence_steps: Array<{ id: number; variant: boolean; variant_from_step: number | null }> };
}

async function main() {
  console.log("Creating Olander campaign...");
  const campaign = await api<Campaign>("POST", "/campaigns", {
    name: "Olander — Fastener Outreach (Multi-Industry)",
  });
  const cid = campaign.data.id;
  console.log(`  Campaign ID: ${cid}\n`);

  // ── Step 1: Initial Outreach — 3 variants ──────────────────────────────
  console.log("Uploading Email 1 — Initial Outreach (3 variants, Day 0)...");
  const step1 = await api<SequenceResponse>("POST", `/campaigns/${cid}/sequence-steps`, {
    title: "Initial Outreach",
    sequence_steps: [
      { email_subject: E1_A_SUBJECT, email_body: E1_A_BODY, wait_in_days: 1 },
      { email_subject: E1_B_SUBJECT, email_body: E1_B_BODY, wait_in_days: 1, variant: true, variant_from_step: 1 },
      { email_subject: E1_C_SUBJECT, email_body: E1_C_BODY, wait_in_days: 1, variant: true, variant_from_step: 1 },
    ],
  });
  console.log(`  Steps: ${step1.data.sequence_steps.map((s) => s.id).join(", ")}\n`);

  // ── Step 2: Value Drop — 3 variants, Day 3, thread reply ───────────────
  console.log("Uploading Email 2 — Value Drop (3 variants, +3 days, thread reply)...");
  const step2 = await api<SequenceResponse>("POST", `/campaigns/${cid}/sequence-steps`, {
    title: "Value Drop — 5 docs / VMI math",
    sequence_steps: [
      { email_subject: E2_A_SUBJECT, email_body: E2_A_BODY, wait_in_days: 3, thread_reply: true },
      { email_subject: E2_B_SUBJECT, email_body: E2_B_BODY, wait_in_days: 3, thread_reply: true, variant: true, variant_from_step: 1 },
      { email_subject: E2_C_SUBJECT, email_body: E2_C_BODY, wait_in_days: 3, thread_reply: true, variant: true, variant_from_step: 1 },
    ],
  });
  const s2 = step2.data.sequence_steps.slice(-3);
  console.log(`  Steps: ${s2.map((s) => s.id).join(", ")}\n`);

  // ── Step 3: Direct Offer — 3 variants, Day 8, thread reply ─────────────
  console.log("Uploading Email 3 — Direct Offer (3 variants, +5 days, thread reply)...");
  const step3 = await api<SequenceResponse>("POST", `/campaigns/${cid}/sequence-steps`, {
    title: "Direct Offer — sample box / quote / walk-through",
    sequence_steps: [
      { email_subject: E3_A_SUBJECT, email_body: E3_A_BODY, wait_in_days: 5, thread_reply: true },
      { email_subject: E3_B_SUBJECT, email_body: E3_B_BODY, wait_in_days: 5, thread_reply: true, variant: true, variant_from_step: 1 },
      { email_subject: E3_C_SUBJECT, email_body: E3_C_BODY, wait_in_days: 5, thread_reply: true, variant: true, variant_from_step: 1 },
    ],
  });
  const s3 = step3.data.sequence_steps.slice(-3);
  console.log(`  Steps: ${s3.map((s) => s.id).join(", ")}\n`);

  // ── Step 4: Breakup — 2 variants, Day 13, thread reply ─────────────────
  console.log("Uploading Email 4 — Breakup (2 variants, +5 days, thread reply)...");
  const step4 = await api<SequenceResponse>("POST", `/campaigns/${cid}/sequence-steps`, {
    title: "Breakup — door open + free thread checker",
    sequence_steps: [
      { email_subject: E4_A_SUBJECT, email_body: E4_A_BODY, wait_in_days: 5, thread_reply: true },
      { email_subject: E4_B_SUBJECT, email_body: E4_B_BODY, wait_in_days: 5, thread_reply: true, variant: true, variant_from_step: 1 },
    ],
  });
  const s4 = step4.data.sequence_steps.slice(-2);
  console.log(`  Steps: ${s4.map((s) => s.id).join(", ")}\n`);

  console.log("════════════════════════════════════════");
  console.log("Olander campaign uploaded.");
  console.log("════════════════════════════════════════");
  console.log(`\nCampaign: "Olander — Fastener Outreach (Multi-Industry)"  (ID: ${cid})`);
  console.log("\nSequence:");
  console.log("  Step 1 (Day 0)   — Initial Outreach          — 3 A/B/C variants");
  console.log("  Step 2 (+3 days) — Value Drop                — 3 A/B/C variants, thread reply");
  console.log("  Step 3 (+5 days) — Direct Offer              — 3 A/B/C variants, thread reply");
  console.log("  Step 4 (+5 days) — Breakup                   — 2 A/B variants,  thread reply");
  console.log("\nNext steps in EmailBison UI:");
  console.log("  1. Attach David Byrne's warmed sender inbox(es)");
  console.log("  2. Upload leads CSV with custom fields:");
  console.log("       email, first_name, company_name, job_title, department,");
  console.log("       industry, cert_standard, cert_focus");
  console.log("     Suggested values per ICP:");
  console.log("       Aerospace  → industry=aerospace,  cert_standard=AS9100D");
  console.log("       Medical    → industry=medical,    cert_standard=ISO 13485");
  console.log("       Electronics→ industry=electronics,cert_standard=ISO 9001:2015");
  console.log("       General    → industry=manufacturing, cert_standard=ISO 9001:2015");
  console.log("  3. Set schedule: 8am-5pm Pacific, M-Th, 50-100 sends/day per inbox");
  console.log("  4. Review + launch");
}

main().catch((err) => {
  console.error("Failed:", err.message);
  process.exit(1);
});
