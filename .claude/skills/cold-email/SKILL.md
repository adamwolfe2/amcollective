---
name: cold-email
description: Use when writing cold email copy, designing or auditing a campaign, drafting auto-replies, or working on the Bison autoresearch loop in AM Collective OS. Applies to every brand in the portfolio (Cursive, CampusGTM, Wholesail, Olander, TBGC, etc.).
---

# Cold Email — AM Collective OS

This repo runs a continuously-improving cold-email machine. Three layers:

1. **Knowledge plane** — `lib/ai/knowledge/cold-email-playbook.ts` is the single source of truth for cold-email doctrine. Both agents below load it as a cached system prompt. Edit this file when adding new best practices.
2. **Agents** —
   - `lib/ai/agents/outreach-agent.ts` writes new campaign emails (5-step sequences).
   - `lib/ai/agents/reply-responder.ts` classifies inbound replies and drafts responses.
   - `lib/ai/agents/cold-email-coach.ts` ("Bison") analyzes performance, generates challenger variants, audits each brand's KB, and surfaces questions to the user. Persona companion to Tara/Alex/Carl.
3. **Loop** — `lib/inngest/jobs/cold-email-research-loop.ts` (cron `0 13 * * *`) runs Bison daily across every workspace.

## How brand-specific training works

Each campaign carries a `CampaignKnowledgeBase` JSONB on `outreach_campaigns.knowledge_base`:

```ts
{
  productName: "Olander Fasteners",
  valueProp: "AS9100D-certified Heli-Coil distribution with kitted VMI",
  icp: {
    roles: ["Director of Operations", "Buyer", "Supply Chain Lead"],
    industries: ["aerospace", "medical device", "electronics"],
    companySizes: ["50-500 employees"],
    painPoints: ["fastener stockouts", "audit documentation gaps", "expedite fees"]
  },
  toneProfile: "mid-level",
  proof: [{ company: "[redacted aero shop]", result: "Cut expedites 40%", metric: "Q1 savings $XXk" }],
  copyGuidelines: { use: ["60+ years", "Sunnyvale", "AS9100D"], avoid: ["best-in-class"] }
}
```

Bison reads this on every analyze/draft call. The user updates it by answering questions in the AGENT QUESTIONS widget — answers map to `answeredAction.field` and patch the JSONB directly.

## When asked to write cold email copy in this repo

1. **Read the playbook first**: `lib/ai/knowledge/cold-email-playbook.ts`. Don't re-derive principles from memory.
2. **Find or build the campaign KB**: if the campaign exists in `outreach_campaigns`, read its `knowledge_base`. If not, ask the user the 7 KB questions before writing.
3. **Per-step variant rule**: 3 A/B/C variants per sequence step, signed by the brand's founder/operator. EmailBison sequence-step API expects `variant: true, variant_from_step: 1` on B and C (see `scripts/upload-campusgtm-campaign.ts` and `scripts/upload-olander-campaign.ts` for the exact shape).
4. **Token syntax**: EmailBison uses `{TOKEN|fallback}` for personalization with fallback and `{a|b|c}` for spintax. Don't double-curly-brace — single braces only.
5. **Dynamic per-industry copy**: don't write 3 separate campaign branches per industry. Use a single campaign and pass `industry`, `cert_standard`, `cert_focus` as lead custom fields. One campaign = less ops overhead.

## When asked to optimize an existing campaign

1. Run the Bison loop manually: `inngest.send({ name: "cold-email/research.run", data: { workspace: "olander" } })`.
2. Check `cold_email_experiments` for pending_approval rows. Each carries a baseline + challenger + reasoning. Review, then mark `requiresApproval=false, status=running, deployedAt=now()` once Adam green-lights.
3. After 7 days (or the configured evaluation window) Bison auto-evaluates and sets `status=winner_challenger | winner_baseline | inconclusive`.

## Continuous learning (Bison's reply-quality loop)

Every time Adam approves a reply draft and clicks send, the system captures:
1. The original incoming reply body
2. The draft Bison produced (snapshotted in `email_drafts.metadata.originalDraftBody`)
3. The body Adam actually sent (may equal draft, may be edited)
4. Edit-distance between the two (0.0 = unedited, 1.0 = fully rewritten)
5. The classifier intent + confidence at draft time

This becomes a `reply_training_examples` row. Then `reply-outcome-classifier` (daily cron) waits 3-21 days and resolves the outcome:
- **won** = lead got flagged "interested" in EmailBison after our reply
- **progressed** = lead replied again, neutral/positive sentiment
- **dead** = no follow-up within 21 days
- **negative** = lead unsubscribed or sent hostile reply

Wons + progresseds with low edit-distance flip `isExemplar=true` and enter the few-shot retrieval pool. Future drafts on similar incoming messages pull the top-3 most-similar exemplars (same brand preferred) and inject them as the system context. The model literally sees "here's what Adam sent on a similar lead — match this voice."

`reply_brand_voice_stats` aggregates per-brand metrics rolling 30d:
- sampleSize, meanEditDistance, medianEditDistance
- cleanApprovalRatePct (% sent without edits)
- positiveOutcomeRatePct
- **voice_locked** flag — when ALL thresholds clear (sample≥25, mean≤0.10, clean≥60%, positive≥30%), drafts for that brand become eligible for auto-send.

Thresholds in `lib/ai/agents/reply-learning.ts` → `VOICE_LOCK_THRESHOLDS`.

## Discipline rules (non-negotiable)

- ONE variable per experiment (subject OR opener OR CTA — never multiple).
- Floor of 50 sends per arm before evaluating.
- Promote winners on ≥20% relative reply-rate lift.
- If the KB is missing the info you need, STOP and surface a question. Don't fabricate proof points or pain points.
- Plain text only in cold emails. No HTML, no images, no bullet lists in initial touches.
- Banned phrases live in the playbook — grep `Banned phrases` before writing.

## Files you'll touch most

- `lib/ai/knowledge/cold-email-playbook.ts` — doctrine
- `lib/ai/agents/cold-email-coach.ts` — analyzer + challenger + KB audit
- `lib/ai/agents/outreach-agent.ts` — new sequence drafter
- `lib/ai/agents/reply-responder.ts` — inbox replies
- `lib/inngest/jobs/cold-email-research-loop.ts` — daily loop
- `lib/db/schema/outreach.ts` — `outreach_campaigns.knowledge_base` JSONB
- `lib/db/schema/cold-email-coach.ts` — questions + experiments + insights
- `scripts/upload-*-campaign.ts` — one-shot campaign uploaders (templates)

## Reference: the third-party sources distilled into the playbook

- `coreyhaines31/marketingskills` cold-email skill — voice, frameworks, benchmarks, follow-up cadence
- MindStudio AutoResearch loop — evaluation windows, 20% lift threshold, sample-size floor
- Adam's reference playbook — persona-over-individual at scale, "wet the beak" opener, subject patterns ("question about {company}'s X"), multi-threading by company size, plain-text discipline, re-approach every 4 months
