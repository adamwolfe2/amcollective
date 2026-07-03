# AM Collective Portal - Memory

> Updated 2026-07-02 after CRM-refresh Phases 1–3 (PRD ingest → One Page → agent layer).
>
> **FROZEN FOR CRM WORK (2026-07-02, Adam's call):** Adam's actual daily CRM is
> `crm.amcollectivecapital.com` = repo `adamwolfe2/am-collective-os`
> (`/Users/adamwolfe/am-collective-os`). The whole CRM refresh below was built
> in THIS repo by mistake — the PRD data + clients-first redesign have been
> ported to am-collective-os (commit a1b7b2f there). Do not build CRM features
> here. This repo stays as the back-office portal only.

## Jul 2 — CRM Refresh Phase 2+3 (One Page + agent layer)

- Phase 2 (commit 276a53f): /command is the one-page landing — clients grid,
  cash/MRR/AR/burn/runway strip, CASH-IN + BUILD/PARTNER boards, top-3
  actions. Nav pruned 45→7 flat items (admin-shell.tsx); demoted pages live
  behind Settings, nothing deleted. /leads renders the full tracker grid
  (priority, pay_status, $ columns, staleness, data_confidence, ip/legal).
- Phase 3 (this commit): 6-agent push layer complete —
  · sync-mercury: pagination FIXED (>200 txns/day no longer dropped) +
    txn→lead matching + unlogged-revenue flag + runway<30d alert
  · collections-dunning NEW: weekday 10 AM CT, AR aging buckets
    (0-15/16-30/31-60/60+), AI drafts → email_drafts one-click send
  · lead-followup-reminder: follow-up-rot upgrade — thresholds Active 7d /
    Prospect 10d / Nurture 21d / Proposal 5d off last_step_date, AI drafts
  · pipeline-hygiene NEW: Monday sweep — Active/Proposal rows missing
    next_step/date/owner + stale high-value ($10K+) flags
  · prospect-from-reply NEW: hourly — interested EmailBison reply with no
    tracker match auto-creates prospect row + Slack ping
  · daily-digest: rewired to the grid — follow-ups due, AR by aging bucket,
    top-3 priorities, LeaseStack IP blocker line
  All 3 new jobs registered (jobs/index.ts + api/inngest/route.ts +
  registry.ts). tsc clean, build clean.
- NEXT: verify jobs appear in Inngest dashboard after deploy; Adam to reauth
  Mercury/HubSpot/n8n/supabase MCPs in claude.ai connectors; scope Trackr +
  Wholesail placeholder rows.

## Jul 2 — CRM Refresh Phase 1 (commit 9c331a1)

Littlebird PRD ingested. Spec + full audit findings:
`.claude/specs/2026-07-02-crm-refresh.md` — READ IT FIRST next session.

- **Principle: zero-login CRM — the digest is the interface.** Push > pages.
- Migration 0016 applied (Neon prod): company_tag += campusgtm/reseller,
  lead_stage += prospect/active/proposal, data_confidence enum, 11 tracker
  columns on `leads` (priority, next_step, last_step_date, pay_status,
  total_value/mrr/collected cents, ip_or_legal_flag, correct_email,
  owner_secondary, data_confidence).
- `leads` = THE single tracker grid now. 38 PRD entities seeded
  (scripts/seed-prd-2026-07-02.ts, idempotent); 9 dupes/excluded archived
  (incl. Kreg AI/Caleb — PRD removed-list; distinct from Cadel/"Keto AI").
- Contradictions preserved as [CONFLICT]/[VERIFY] in notes — never flatten:
  Mentor126 contract version, SG RE deposit, DevSwarm balance, LeaseStack IP
  (internal blocker row, ip_or_legal_flag on Trig/SG/LBA/Guardian).
- NEXT (Phase 2): One Page — /command becomes landing, nav ≤7 flat items
  (admin-shell.tsx NAV_ITEMS), /leads renders new columns, CASH-IN +
  BUILD/PARTNER boards. (Phase 3): upgrade existing jobs — sync-mercury
  pagination BUG (>200 txns/24h dropped), collections/rot AI drafts via
  email_drafts one-click flow, digest rewire. All inputs in the spec.
- Mercury MCP unauth'd in claude.ai connectors (repo's direct MERCURY_API_KEY
  connector is primary). Pre-existing tsc errors in untracked
  scripts/deploy-*.ts (SpintaxValidation) — not mine, not blocking.

## May 26 Session B — COGS Visibility Loop Closed (4 commits)

Built the cost-allocation system (shared expenses like CheapInboxes can now
be split across ventures), the Mercury recurring detector (so anything
hitting your bank repeatedly auto-surfaces as a forecast candidate), and
seeded this week's 21 action items into the open 3/30 sprint.

**Migration 0014** — backfill missing `myvsl` + `leasestack` values on
`company_tag` enum (schema declared them; DB didn't have them).

**Migration 0015** — `subscription_cost_allocations` table (cost_id,
company_tag, percent_bps). When ≥1 row exists for a cost, the legacy
single-tag column is ignored and the cost splits per allocations.

**Forecast + venture P&L respect allocations:** a $300/mo CheapInboxes cost
split 50/30/20 across Cursive/Hook/SPM now emits 3 calendar events and
contributes to 3 venture rollups proportionally.

**New page** `/finance/recurring` — pure detector groups Mercury debits by
(counterparty + amount bucket), needs ≥2 hits at a recognized cadence,
estimates next renewal. One-click "Add as cost" promotes a candidate to a
tracked subscription_cost tagged to the right venture.

**21 action items seeded** into the open 3/30 sprint via
`scripts/seed-week-action-items.ts`. Sections per venture (LeaseStack,
Cursive, Vend Scout, JustSearched, Apropo, SPM, etc.). Calendar-view task
pre-marked DONE.

**Build:** tsc 0 errors, build clean, 4 commits on `main` (2c421b5..72de850).

## What's Next
1. ~~Pull recurring from Mercury~~ ✅ (today)
2. Run the Mercury recurring detector against real history (the page loads
   live — go to /finance/recurring to see candidates). Promote real
   recurring charges.
3. Add allocations to your shared costs (CheapInboxes, Beanstock) so
   per-venture P&L matches reality.
4. Tag historical Mercury transactions by `companyTag` so back-tested
   margin matches forward-projected margin.
5. Stripe subscription → companyTag mapping (still "untagged" for now).
6. Scenario planner ("close 2 retainers / sunset Trackr → runway delta").

---

## May 26 Session A — Cash Visibility (7 commits)

## May 26 Session A — Cash Visibility detail (7 commits)

Built the "I have no idea what's hitting my account next month" stack so we
can finally see COGS per venture and make kill/feed/scale decisions.

**Migration 0013** — added `payment_cadence` enum + `next_pay_date` +
`last_pay_date` to `engagements`. Applied to Neon prod via
`pnpm exec tsx --env-file=.env.local scripts/run-migration-0013-engagement-pay-dates.ts`.

**New routes:**
- `/finance/calendar` — month grid showing every projected income + expense
  event with day buckets, side panel of next 30 days, month nav, totals strip.
- `/finance/ventures` — per-companyTag monthly P&L (revenue, burn, margin %)
  with Scale / Feed / Watch / Kill signal. Portfolio totals at the bottom.
- `/finance/engagements` — pay-schedule manager. Buckets engagements into
  Overdue / Next 7d / Next 30d / Later / Unset with inline edit row for
  cadence + nextPayDate. Countdown badges.

**New service:** `lib/finance/forecast.ts` (pure) + `lib/finance/forecast-data.ts`
(Drizzle fetcher). Projects recurring sources forward over a date range.
Also exports `buildVenturePnL` for the rollup.

**Nav:** sidebar Finance group reordered to lead with the new pages. Finance
overview page got 3 cross-link CTAs in its header.

**Build:** tsc 0 errors, build clean, pushed to main as commits a6e4b5f..a1acc61.

## What's Next (for kill/feed decisions)
1. Tag historical Mercury transactions by `companyTag` so back-tested margin
   matches forward-projected margin.
2. Add engagement seed/import for existing active engagements so the calendar
   isn't empty on first load (right now relies on user manually setting
   `nextPayDate` per engagement at `/finance/engagements`).
3. Stripe subscription → companyTag mapping (currently always "untagged").
   Plumb via `subscriptions.metadata.company_tag` set during Stripe checkout.
4. Scenario planner on `/finance/ventures` — "what if I close 2 more retainers
   at $X / sunset Trackr" and see runway delta.
5. Pricing-floor calculator: minimum engagement price to be net-positive after
   allocated COGS + AI burn + overhead.

---

## March 26 Session Summary

## Current State
- **Phase**: All build phases complete. Platform in production with active hardening.
- **Last Session**: March 26, 2026 — 15+ commits, ~400 files changed, ~5,000 lines
- **Build Status**: tsc 0 errors, lint 0 warnings, build clean
- **Production URL**: https://amcollective.vercel.app
- **Scale**: 79 pages, 123 API routes, 27 schema files, 16 connectors, 41 Inngest jobs, 12 AI agents, 73 AI tools

## March 26 Session Summary

### QA + Security
- 70+ console.error -> captureError (Sentry)
- Connector TTL bug fixed (4 connectors: ms -> seconds)
- 3 security holes fixed (webhook fail-open, timing attack, missing validation)
- 12 sprint audit logs added
- getUserId extracted to shared requireAuth() across 15 action files
- TBGC branding purged from all emails and templates
- 7 dead email templates deleted
- Resend/FROM_EMAIL consolidated to shared imports

### Performance
- Fetch timeouts on 13 API calls
- Env var startup validation (lib/env.ts)
- crypto.randomUUID for sprint tokens
- revalidateTag for cache invalidation
- ArcJet rate limiting on 20+ routes
- Dynamic recharts imports on 4 pages
- Sprint import batched (65 -> 3 queries)
- N+1 fix in send-client-reports
- LIMIT on 3 unbounded queries
- optimizePackageImports, AVIF/WebP, 24hr image cache
- 12MB unused assets deleted from /public
- 3 waterfall pages parallelized
- ClientSearch + compliance debounced
- Notification bell visibility pause
- @vercel/speed-insights installed

### Features Built
- CampusGTM: CSV lead upload, lead-to-CRM conversion, upload dialog
- Multi-workspace EmailBison sync (EMAILBISON_API_KEYS)
- Overview stats from campaign sync (not just webhooks)
- Client portal: reports page + portal landing rewritten
- AI tool fixes: 4 bugs (unreachable tool, SQL injection, missing enums)
- Generate Now for Strategy + Intelligence
- System health dashboard (14 integrations)
- Manual sync triggers (7 Inngest jobs)
- Client portal provisioning (one-click)
- Actionable empty states on 11 pages

### Mobile (iPhone 375px/390px)
- AI chat sidebar: hidden on mobile with overlay toggle
- Signature canvas DPR coordinate fix
- 18 total mobile fixes (touch targets, grids, overflow, safe areas)

## What's Next (Priority Order)
1. **Test coverage** — ZERO unit/integration tests. Start with data isolation, billing, AI tools.
2. **Drizzle migration tracking** — /drizzle directory doesn't exist, using manual scripts
3. **Email template polish** — client-facing emails need professional design
4. **Stripe webhook e2e verification** — confirm payment flow works
5. **Sprint editor hardening** — keyboard shortcuts, mobile drag-drop
6. **Dashboard morning experience** — verify all 7 sections with real data
7. **Playwright improvements** — local testing, more flows, CI integration

## Key Architecture Notes
- Auth: Clerk with publicMetadata.role, email-based super admin
- DB: Neon PostgreSQL + pgvector, Drizzle ORM, `@neondatabase/serverless@0.10.4`
- Design: Trackr Offset Brutalist (no rounded corners, #F3F3EF bg, Newsreader + Geist Mono)
- Sentry for all error tracking
- ArcJet rate limiting on all write + sensitive endpoints
- AI chat: dual system (Anthropic SDK for agents, Vercel AI SDK for streaming portal chat)
- EmailBison: multi-workspace via EMAILBISON_API_KEYS (comma-separated workspace:key pairs)
- Inngest for all background jobs (40 registered, cron + event triggered)

## Session N+1 Prompt
See docs/CONTINUATION-PLAN.md for detailed continuation context.
