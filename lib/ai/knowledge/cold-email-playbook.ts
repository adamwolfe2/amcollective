/**
 * Cold Email Playbook — Distilled Best Practices
 *
 * Synthesized from three sources:
 *  - coreyhaines31/marketingskills/cold-email (writing craft, frameworks, benchmarks)
 *  - MindStudio AutoResearch optimization framework (A/B testing, evaluation windows)
 *  - Adam's reference playbook (persona-level personalization at scale, multi-threading,
 *    "wet the beak", subject patterns, plain-text discipline)
 *
 * Loaded as a system-prompt fragment by:
 *  - lib/ai/agents/reply-responder.ts       (when drafting replies)
 *  - lib/ai/agents/outbound-drafter.ts      (when drafting new outreach)
 *  - lib/ai/agents/campaign-optimizer.ts    (when A/B testing variants)
 *
 * Keep this file tight — every line consumes tokens on every call. Long-form
 * reference for human Claude Code sessions lives at `.claude/skills/cold-email/`.
 */

export const COLD_EMAIL_PLAYBOOK_PROMPT = `# Cold Email Playbook (apply to all outbound + reply drafting)

## When does cold email even fit?
- YES: prospects sit at a desk in front of a computer (SaaS, ecom, agency, B2B services, tech-forward manufacturing).
- NO: prospects are on the floor / on a job site / always-mobile (restaurants, construction trades, retail, mom-and-pops). Use phone for those.

## Voice — write like a peer, not a vendor
- Read aloud. If it sounds like marketing copy, rewrite.
- "You/your" dominates over "I/we." Lead with their world, not yours.
- Contractions on. Lowercase ok. NO emoji. NO exclamation points (except rare).
- **Plain text only.** Zero links, images, attachments, bullets, fancy fonts. Cold email must read like a personal note from a friend, not a newsletter. (One Cal link in a reply, once interest is shown, is fine.)
- Simple language. Grandma should understand it. Avoid jargon and corporate buzzwords.
- Banned phrases: "I hope this email finds you well", "circling back", "just checking in", "touching base", "synergy", "leverage" (verb), "best-in-class", "leading provider", "please let me know if this interests you", "looking forward to hearing from you".
- Never use a fake "Re:" / "Fwd:" subject. Never put {{first_name}} in the subject line (-12% replies).

## Length — every sentence earns its place
- Target 25–75 words for first touch. 5–6 short sentences MAX.
- Under 75 words = 83% more replies. 3rd–5th grade reading level = 67% more replies.
- ONE main idea per email. If a sentence doesn't move the reader toward replying, cut it.

## Personalization — match depth to volume (key strategic call)

**Persona-level (default for volume outbound, >200 leads):**
- Personalize to the role + industry + company-size combo, not the individual.
- Speak to pain points only your ICP would recognize. Use their exact verbiage (mine Gong calls, closed-won notes, G2 reviews, Reddit threads).
- Only tokens you need: {first_name}, {company_name}, {challenge_or_benefit}.
- This is how you achieve resonance AT SCALE. Same email body, persona-tuned, reads like it was written for them — because it was, just not for them specifically.

**Individual-level (reserved for high-value targets, <50 leads):**
- Specific timely observation about THIS person, connected to your value prop.
- Triggers: funding round, hiring spike, job change, recent post, podcast appearance, tech-stack change, news mention.
- The "so what" test: if you delete the personalized line and the email still makes sense, the personalization is failing.

**Both modes:** personalization must connect to the problem you solve. Random flattery ("cool that you went to UCLA!") is an attention hack, not personalization. It backfires.

## "Wet the beak" opening — strong default for cold first-touch
- Open with: "You might be interested in a tool/idea/approach that lets you [specific outcome they want]…"
- Or peer-to-peer cousin: "[Name] here — quick one. Are you still the right person for [their domain] at {company_name}?"
- Either way: orient them in 1 sentence to why this email exists, FROM THEIR PERSPECTIVE.

## Subject lines — short, boring, internal-looking
- 2–4 words. Lowercase. No punctuation tricks. No emoji. No numbers/%.
- Sit in the middle of the formal↔informal spectrum. Professional but not too professional.
- VAGUE > specific. Salesy = auto-delete.
- High-performing patterns:
  - "question about {company_name}'s [X]"
  - "idea for {company_name}'s [X]"
  - "suggestion for [X]"
  - "[X] idea for {company_name}"
  - "{painPoint}" — single noun phrase
- 2-word subjects get 60% more opens than 5-word. Mobile truncates at 30–35 chars.
- Specific-pain questions work. Generic questions ("Quick question?") tank opens 56%.
- Personalize with context tokens ({company_name}, {painPoint}), not {first_name}.

## Body structure — pick one, don't mix
- **PAS** (default): Problem → Agitate → Solution + soft CTA
- **BAB**: Before → After → Bridge (transformation offers)
- **QVC**: Question → Value → CTA (C-suite, ultra-brief)
- **Mouse Trap**: Observation + binary value-prop question, 1–2 sentences (max brevity)
- **3C's**: Compliment → Case study → CTA (agency/services)
- **PPP**: Praise → Picture → Push (senior prospects with real triggers only)

## Must-have ingredients in the body
- Lead with THEIR challenge (they are the main character).
- ONE basic explanation: what you do, how, and why you do it better (differentiator).
- Social proof: 1 concrete metric or named customer ("3 of the top 5 aerospace shops in CA" / "cut expedites 40% at a Series B"). Must be factual.
- ONE clear, direct CTA. Not passive. "Worth a 15-minute intro this week?" beats "Let me know if this interests you."
- Calibrate CTA by seniority: C-suite = "curious?" / "worth 2 min?". Mid-level = specific swap ("want me to walk through X?"). Never ask for 30 min in email 1.

## Free-value offers (highest-converting CTAs)
- Sample box / physical item (tangible products only)
- Sample cert package / audit / report PDF
- 60-second SKU benchmark / quick teardown
- 15-minute walk-through (only AFTER value has been demonstrated)
- "Finder's fee" for warm intros (sample box + credit)

## Multi-threading — by company size
- 0–100 employees: 1–2 contacts. They sit next to each other; don't spam.
- 100–1,000 employees: 2–3 contacts.
- 1,000–10,000 employees: 3–4 contacts.
- Hit IC + manager + VP for "groundswell" — they talk internally; by the time you cold-call, your name is known.
- Wrong-person forwards happen often and convert well. Don't fear them.

## Follow-up sequences
- 4–8 touches total. 4–7 emails get 27% reply rates vs 9% for 1–3 emails.
- Cadence: Day 0 → +3 → +5–7 → +7–14 → +7–14 (breakup).
- Each follow-up adds something NEW: different angle, new proof, fresh value. Never "bumping this".
- Angle rotation: initial hook → value drop → social proof → new insight → breakup.
- Breakup = loss aversion. Acknowledge silence, validate "now isn't the right time," leave door open, never follow up again.
- Best send windows: Tue–Thu, 9–11am or 1–3pm prospect-local. Avoid Mon AM, Fri PM.

## Re-approaching cold leads
- Leads forget you within ~120 days. Re-approach every 4+ months with improved messaging and a new angle.
- This is where most of the back-half pipeline comes from.

## Common mistakes (avoid)
- Too long, too self-focused — count "I/We" vs "You/Your" sentences; You/Your must win.
- Feature dump — one proof beats ten features.
- Generic templates — {{FirstName}} alone isn't personalization.
- Asking too much too soon — 30-min call in email 1 = proposing on first date.
- Pushy language ("Act Now") — +67% spam-flag rate.
- "I never heard back" / "Did you see my last email?" — destroys reply rate (-12% bookings).
- Too many contacts per company — 1–2 = 7.8% reply; 10+ = 3.8%.
- HTML / images / 3 paragraphs of bullets — kills the "personal note" frame.

## Benchmarks (target)
- Open rate: 40–45% good, 50%+ excellent.
- Reply rate: 5–10% good, 10–15% excellent.
- Positive reply %: 55–60% good.
- Bounce rate: under 4% good, under 2% excellent.
- Meeting booking rate: 1–2% good, 2.3%+ excellent.
- Track ONE primary metric: replies that generate opportunities. That's it.

## EmailBison spintax + token discipline (critical — never break these)
- Two interpolation patterns share the same brace syntax:
  - **Spintax randomization**: \`{a|b|c}\` — one alternative chosen per send. Used for rotating openers, sign-offs, micro-phrases.
  - **Token with fallback**: \`{TOKEN_NAME|fallback}\` — replaced per-lead from custom fields. Token name is uppercase OR lowercase but always alphanumeric+underscore.
- Distinguishing rule: if the first alternative is a single uppercase-or-lowercase identifier (no spaces), it's a TOKEN. Otherwise it's spintax.
- **Preserve every token in the baseline when rewriting a challenger.** Dropping \`{company_name|your company}\` will produce emails addressed to no one.
- Don't nest braces — EmailBison won't parse \`{a|{b|c}|d}\` correctly.
- Each spintax group needs ≥2 non-empty alternatives. \`{a|}\` and \`{a}\` are invalid.
- Known tokens (the lead CSV may provide any of these): FIRST_NAME, LAST_NAME, FULL_NAME, EMAIL, COMPANY, first_name, last_name, company_name, job_title, department, industry, cert_standard, cert_focus, painPoint, school. If you need a new token, ASK before introducing it.
- Run \`validateSpintax(text, { originalTokens })\` after any rewrite. If it returns \`ok: false\`, do not deploy.

## A/B testing protocol (when iterating)
- Floor: 50 sends per variant before evaluating.
- Promote winners only on ≥20% relative reply-rate lift (e.g., 3.0% → 3.6%).
- Change ONE variable per iteration (subject OR opener OR CTA — never all). Preserve all merge tags.
- Evaluation window: 3 days at 500+/wk, 7 days at 100–500/wk, 2–4 weeks below.
- "Single-biggest-weakness" pass before generating a challenger: identify the weakest element, then rewrite ONLY that.
- Steal first, reinvent later. Mine your closed-won + closed-lost notes for what already works.`;

/**
 * Compact version for short-context calls (under 1k tokens).
 * Use when the parent prompt is already large.
 */
export const COLD_EMAIL_PLAYBOOK_COMPACT = `# Cold Email Rules (compact)
- Voice: peer-to-peer, you-focused, 25–75 words, 3rd–5th grade reading level, plain text only (no links/images/bullets).
- Subjects: 2–4 words, lowercase, internal-looking ("question about {company}'s X", "idea for {company}"), no {{firstName}}, no emoji/numbers.
- Personalize to PERSONA (role + industry + company size) at scale. Individual-level only for <50 high-value targets.
- One main idea, ONE clear direct CTA. Interest CTAs > meeting requests in first touch. Never ask for 30 min in email 1.
- Must include: their challenge, basic what-you-do + differentiator, 1 concrete social proof, direct CTA.
- Follow-ups: 4–8 touches, each adds new value/angle. Cap at 5 emails. Breakup last.
- Multi-thread: 1–2 contacts at <100 employees, 2–3 at 100–1k, 3–4 at 1k–10k.
- Banned: "hope this finds you well", "circling back", "just checking in", "synergy", "leverage" (verb), "please let me know if this interests you", fake Re:/Fwd: subjects.
- Best windows: Tue–Thu, 9–11am / 1–3pm prospect-local.
- Re-approach cold leads every 4+ months with new angle.`;
