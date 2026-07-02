# CRM Refresh + Proactive Agent Layer — 2026-07-02

Source: Littlebird PRD (in session). Owner: Adam. Principle: **zero-login operation — the digest is the interface.**

## Phases

### Phase 0 — Ground-truth audit (TODAY)
- Map real DB schema (lib/db/schema), Mercury sync path, Inngest jobs, all 89 pages.
- Output: keep/kill nav list (target ≤7 items), schema-gap list vs PRD §4.

### Phase 1 — PRD ingest (TODAY)
- Migration: add `correct_email`, `last_step_date`, `owner_secondary`, `ip_or_legal_flag`, `data_confidence` (verified/provisional/stale), RESELLER/PARTNER bucket.
- Idempotent seed script writes PRD §5 entity updates + §6 net-new entities + §9 contact corrections.
- Contradictions (§8) preserved as flags/notes — never flattened. All $ = provisional until Mercury-confirmed.
- Excluded (§1): Modern Amenities, AIMS, VendHub, VendScout, SteelTrap + the 7 explicitly-removed items. Never add.

### Phase 2 — The One Page
- Overview = clients table (Adam's favorite) + strip: cash, MRR, AR outstanding, burn, runway days.
- Two boards: CASH IN (AR/collections) · BUILD/PARTNER (equity/rev-share/reseller).
- Top-3 actions today. Prune nav to ≤7. Archive (don't delete) unused pages behind /archive.

### Phase 3 — Agent layer (6 Inngest agents, all PUSH via Resend email + Slack)
1. **finance-sync** — daily Mercury pull (direct API connector, not MCP), match txn→entity by amount+memo+counterparty, flag unlogged revenue; weekly cash/burn/runway/AR; alert runway <30d.
2. **collections** — dunning drafts by aging bucket (0-15/16-30/31-60/60+), one-click send. Seed queue: DevSwarm, POD $12K, Mentor126 $14K, SG RE $12.5K, Apropos $1,663, AI Advisors $200.
3. **follow-up-rot** (HIGHEST PRIORITY) — staleness thresholds: Active 7d, Prospect 10d, Nurture 21d, Proposal 5d. Auto-draft context-aware follow-up, push to owner. No active row without next_step + date.
4. **pipeline-hygiene** — enforce next_step+date+owner on Active/Proposal; flag stale high-value (JLL, UO Foundation, ACM NE).
5. **prospecting** — ingest positive replies from Cursive inboxes → auto-create prospect rows; weekly net-new pipeline report, prompt if 0.
6. **digest** — daily AM push: follow-ups due, overdue invoices, meetings, top 3 priorities. Weekly: cash+AR, pipeline movement, stale list, new opps, blockers.

## Decisions
- Digest → email + Slack both (assumed, unflagged).
- Mercury: repo's direct API connector is primary source; claude.ai Mercury MCP unauth'd — Adam to reauth in connector settings (also HubSpot/n8n/supabase MCPs unauth'd).
- Gmail reconnect (PRD §13) — Gmail MCP live in this session; Cursive/AMC inbox reconnect tracked separately.
- Trackr + Wholesail: placeholder rows flagged for scoping.

## Phase 0+1 results (DONE 2026-07-02)
- Migration `scripts/run-migration-0016-crm-refresh.ts` APPLIED: company_tag += campusgtm, reseller · lead_stage += prospect/active/proposal · data_confidence enum · 11 new leads columns (priority, next_step, last_step_date, owner_secondary, correct_email, pay_status, total_value, mrr, collected, ip_or_legal_flag, data_confidence).
- Seed `scripts/seed-prd-2026-07-02.ts` RUN: 38 entities upserted into `leads` (the single tracker grid). 9 pre-existing dupes/excluded rows archived (incl. Kreg AI/Caleb — on PRD removed list).
- `leads` is now the grid; `clients`/`engagements` untouched (Stripe-linked).

## Phase 2 inputs (from page audit)
- Nav: `app/(admin)/admin-shell.tsx` NAV_ITEMS — currently 4 flat + 8 groups ≈ 45 leaf links.
- KEEP 7 flat: Command (`/command`, becomes landing; absorb best `/dashboard` widgets, retire /dashboard as nav item) · Clients (`/clients`) · Pipeline (`/leads` — now the tracker grid; render new columns) · Finance (`/finance` + tabs for invoices/costs/forecast/ventures) · Outreach (`/outreach` + email folded in) · Tasks (`/tasks`, sprints inside) · AI (`/ai`).
- Demote off-nav (don't delete): Strategy, Operations extras (Time/Rocks/Meetings/Scorecard), Portfolio group, Knowledge group, Messages/NPS, System group → single Settings gear.
- `/leads` page must render: priority, pay_status, total/mrr/collected/remaining, next_step, last_step_date staleness, data_confidence badge, ip_or_legal_flag.

## Phase 3 inputs (from infra audit) — upgrade, not greenfield
- finance-sync: `lib/inngest/jobs/sync-mercury.ts` EXISTS (6h cron). BUG: no pagination loop — >200 txns/24h dropped. Fix pagination; add txn→lead matching (amount+memo+counterparty) + unlogged-revenue flag; runway<30d alert. `cash_snapshots` + `sync-cash-snapshot` exist.
- collections: `dunning-sequence` exists but Stripe-event-only + static HTML. New job: scan leads where collected<total_value & pay_status in (overdue,pending); AI-draft via `reply-responder` draft pattern → `email_drafts` status ready → `notify-draft-ready` Slack ping (one-click send flow EXISTS).
- follow-up-rot: `lead-followup-reminder` exists (plain Slack list). Upgrade: thresholds Active 7d / Prospect 10d / Nurture 21d / Proposal 5d off last_step_date; AI-draft context-aware follow-up (last step + next_step) → email_drafts + owner push.
- pipeline-hygiene: new light cron — Active/Proposal rows missing next_step/date/owner; stale high-value flags.
- prospecting: `sync-emailbison-inbox` → `emailbison_replies.isInterested` EXISTS. Add: interested reply → auto-create lead row (stage prospect, source outbound) if no match; weekly net-new report.
- digest: `daily-digest` (7am email → adamwolfe102@gmail.com) + `morning-briefing` (7am CT Slack DM via sendProactiveMessage) EXIST. Rewire both to new grid: follow-ups due, overdue AR by aging bucket, top-3 priorities, CASH-IN/BUILD-PARTNER movement, LeaseStack IP blocker line. Weekly: cash+AR+pipeline+stale+net-new.
- Push infra: `lib/email/shared.ts` (buildBaseHtml, FROM_EMAIL team@amcollectivecapital.com), `lib/webhooks/slack.ts` (notifySlack, notifySlackAndWakeHermes), `lib/ai/agents/proactive.ts`. Job registration: file in lib/inngest/jobs/ + export index.ts + list in app/api/inngest/route.ts + lib/inngest/registry.ts.

## Blockers
- Mercury MCP unauthenticated (claude.ai connectors) — non-blocking, direct API used.
- LeaseStack IP 50/50 w/ Maggie UNRESOLVED — surface as top internal blocker on overview.
