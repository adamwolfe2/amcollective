/**
 * Upload CampusGTM cold email campaign to EmailBison
 *
 * Usage:
 *   EMAILBISON_KEY="9|xxx" npx tsx scripts/upload-campusgtm-campaign.ts
 */

const BASE_URL = "https://send.meetcursive.com";
const API_KEY = process.env.EMAILBISON_KEY;

if (!API_KEY) {
  console.error("Missing EMAILBISON_KEY env var");
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

// ─── Initial Email — 3 Variants ─────────────────────────────────────────────

const INITIAL_A_SUBJECT = "campus growth program at {school}";
const INITIAL_A_BODY = `{Hey|What's up} {FIRST_NAME}{!|,}

{Hope the semester's treating you well|Hope school is going well} — {I know it's a grind right now|I know things get crazy this time of year}.

I {saw you|noticed you} {grinding on LinkedIn looking for experience|posting about wanting startup experience|looking for something real to do before graduation} and {might have something for you|think this could be perfect timing}.

We run CampusGTM — it's {a growth program|an accelerator program} that places {ambitious|high-agency|driven} students directly at funded startups to run real campus distribution. Not a campus org. Not a "post once a week" ambassador thing. Actual growth work — outreach, partnerships, community building — at companies that are actually building something.

{here's what you get|what's in it for you}:
-> Work directly with founding teams at real startups
-> Own a real growth lane (not fetch-coffee intern tasks)
-> Networking with some of the best GTM minds in the game
-> Letter of rec from startup founders you work with
-> First consideration for paid roles if you crush it

We only take a handful of students per school, and we're {looking for the top 1% at {school}|building our {school} cohort right now}.

{if you're remotely interested, shoot a reply and I'll send the full overview|reply "interested" and I'll send the details|shoot a reply if you're down and I'll send the packet}!

Adam @ CampusGTM`;

const INITIAL_B_SUBJECT = "{not a normal student role|this isn't a normal internship}";
const INITIAL_B_BODY = `{Hey|What's up} {FIRST_NAME}{!|,}

{Gonna be straight with you|I'll keep this short} — if I was still a student and wanted {insane|legit|real} startup experience without waiting around for a summer internship slot, this is exactly what I'd do.

We built CampusGTM to {solve a problem|fix something broken}: ambitious students want real startup reps, and funded startups need distribution on campus but {can't figure it out themselves|don't have the infrastructure}. {So we connect the two|We bridge the gap}.

You'd get plugged into a real startup, own {outreach, partnerships, and campus traction|their campus growth playbook} at {school}, and work directly with {the founding team|people actually building the product} — not middle managers.

{Small team. Real ownership. No deadweight.|Small cohort, real work, no hand-holding required.}

{We're building our {school} team right now|Looking for a few more cracked students at {school}} — {shoot a reply if you want the details|want me to send the overview|reply and I'll send the packet}?

Adam @ CampusGTM`;

const INITIAL_C_SUBJECT = "{quick question|heads up {FIRST_NAME}}";
const INITIAL_C_BODY = `{Hey|Yo} {FIRST_NAME}{!|,}

{Hope school's going well|Hope you're surviving the semester} — {I'll keep this quick|reaching out because I think you'd be a fit for this}.

You're probably {thinking about how to get legit experience on your resume before you graduate|looking for something real to put on LinkedIn that isn't just a campus club}.. {well|honestly}, we built something specifically for students like you.

CampusGTM is a growth program that places HIGH AGENCY students at funded startups to run real campus distribution. {We're talking|Think}: outreach, partnerships, community, and actually driving traction — not posting flyers.

{what you get|why this is worth your time}:
-> Placed at a real, funded startup (not some side project)
-> Own a growth lane and ship real results
-> {Weekly sessions with cracked guest speakers + GTM operators|Access to an insane network of GTM minds and startup operators}
-> Founders personally vouch for you (rec letters, referrals, the works)
-> {Fast track to paid roles if you crush it|Top performers get offered paid positions}

We're only {bringing on a few students at {school}|taking a small cohort at {school} right now} and {I think you'd crush it|you seem like exactly the kind of person we're looking for}.

{shoot a reply if you're down|reply "in" and I'll send everything over|interested? just reply and I'll send the full breakdown}!

Adam @ CampusGTM`;

// ─── Follow-up Email — 3 Variants ───────────────────────────────────────────

const FOLLOWUP_A_SUBJECT = "still {open|looking}";
const FOLLOWUP_A_BODY = `{Hey|What's up} {FIRST_NAME},

{Bumping this|Quick bump} — {still putting together the {school} team for CampusGTM|still have a few spots open at {school}}.

{Quick recap|TLDR}: you'd get placed at a funded startup, own real campus growth work, and {come out with actual reps + connections|build real relationships with founders and GTM operators}. {Not a normal student role.|No fluff, no busy work.}

{If you're interested, just shoot a reply|Reply if you want me to send the details|Still worth sending the overview?}

Adam @ CampusGTM`;

const FOLLOWUP_B_SUBJECT = "{think you'd be great at this|still think this is a fit}";
const FOLLOWUP_B_BODY = `{Hey|What's up} {FIRST_NAME},

{Following up because|Circling back —} {you seem like exactly the kind of person who'd crush this|I genuinely think you'd be great here}.

{We're not picking based on GPA or who has the most polished resume|This isn't about credentials} — we want students who {learn fast, figure things out, and make things happen|are scrappy, high-agency, and don't wait to be told what to do}.

{Still worth sending the details?|Want me to send the packet?|Reply and I'll shoot over the overview.}

Adam @ CampusGTM`;

const FOLLOWUP_C_SUBJECT = "{last one from me|last ping}";
const FOLLOWUP_C_BODY = `Hey {FIRST_NAME},

{Last note from me|Last ping, I promise}.

{Reached out because we're building a small team at {school} and I thought you'd be a good fit|I reached out because this felt like a fit — real startup work, real ownership, small team at {school}}.

{If you want the details, just reply. If not, totally get it — no worries at all.|Reply "send it" if you want the overview. If the timing's off, no stress.}

Adam @ CampusGTM`;

// ─── Upload ─────────────────────────────────────────────────────────────────

interface Campaign { data: { id: number; name: string } }
interface Sequence { data: { id: number; sequence_steps: Array<{ id: number; variant: boolean; variant_from_step: number | null }> } }

async function main() {
  // 1. Create campaign
  console.log("Creating campaign...");
  const campaign = await api<Campaign>("POST", "/campaigns", {
    name: "CampusGTM - Campus Growth Program",
  });
  const cid = campaign.data.id;
  console.log(`  Campaign ID: ${cid}`);

  // 2. Initial email — 3 variants
  console.log("\nUploading Initial Email (3 variants)...");
  const initial = await api<Sequence>("POST", `/campaigns/${cid}/sequence-steps`, {
    title: "Initial Outreach",
    sequence_steps: [
      {
        email_subject: INITIAL_A_SUBJECT,
        email_body: INITIAL_A_BODY,
        wait_in_days: 1,
      },
      {
        email_subject: INITIAL_B_SUBJECT,
        email_body: INITIAL_B_BODY,
        wait_in_days: 1,
        variant: true,
        variant_from_step: 1,
      },
      {
        email_subject: INITIAL_C_SUBJECT,
        email_body: INITIAL_C_BODY,
        wait_in_days: 1,
        variant: true,
        variant_from_step: 1,
      },
    ],
  });
  const steps = initial.data.sequence_steps;
  console.log(`  Step A (primary): ID ${steps[0].id}`);
  console.log(`  Step B (variant):  ID ${steps[1].id} -> variant_from=${steps[1].variant_from_step}`);
  console.log(`  Step C (variant):  ID ${steps[2].id} -> variant_from=${steps[2].variant_from_step}`);

  // 3. Follow-up email — 3 variants, 3 days later, thread reply
  console.log("\nUploading Follow-up Email (3 variants, 3-day delay)...");
  const followup = await api<Sequence>("POST", `/campaigns/${cid}/sequence-steps`, {
    title: "Follow-up",
    sequence_steps: [
      {
        email_subject: FOLLOWUP_A_SUBJECT,
        email_body: FOLLOWUP_A_BODY,
        wait_in_days: 3,
        thread_reply: true,
      },
      {
        email_subject: FOLLOWUP_B_SUBJECT,
        email_body: FOLLOWUP_B_BODY,
        wait_in_days: 3,
        variant: true,
        variant_from_step: 1,
        thread_reply: true,
      },
      {
        email_subject: FOLLOWUP_C_SUBJECT,
        email_body: FOLLOWUP_C_BODY,
        wait_in_days: 3,
        variant: true,
        variant_from_step: 1,
        thread_reply: true,
      },
    ],
  });
  const fuSteps = followup.data.sequence_steps;
  // Filter to just the follow-up steps (last 3)
  const newSteps = fuSteps.slice(-3);
  console.log(`  Step A (primary): ID ${newSteps[0].id}`);
  console.log(`  Step B (variant):  ID ${newSteps[1].id} -> variant_from=${newSteps[1].variant_from_step}`);
  console.log(`  Step C (variant):  ID ${newSteps[2].id} -> variant_from=${newSteps[2].variant_from_step}`);

  console.log("\n========================================");
  console.log("Campaign uploaded successfully!");
  console.log("========================================");
  console.log(`\nCampaign: "CampusGTM - Campus Growth Program" (ID: ${cid})`);
  console.log("  Step 1: Initial Outreach — 3 A/B/C variants with spintax");
  console.log("  Step 2: Follow-up — 3 days later, 3 A/B/C variants, thread reply");
  console.log(`\nSender accounts available: 4 (all warming on @campusgtmsage.com and @campusgtmbeta.com)`);
  console.log("\nNext steps:");
  console.log("  1. Assign sender emails to the campaign in EmailBison UI");
  console.log("  2. Upload leads CSV (needs FIRST_NAME, school columns)");
  console.log("  3. Set sending schedule");
  console.log("  4. Review and launch");
}

main().catch((err) => {
  console.error("Failed:", err.message);
  process.exit(1);
});
