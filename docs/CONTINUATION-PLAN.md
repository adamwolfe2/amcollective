# AM Collective — Continuation Plan

> Generated 2026-03-26 after a full-day session (~15 commits, ~400 files changed, ~5,000 lines).
> Use this to onboard the next Claude Code session. Paste the relevant section as context.

## What Was Done This Session

### QA + Security (3 commits)
- Replaced 70+ console.error with captureError (Sentry)
- Fixed connector TTL bug (4 connectors caching for days instead of minutes)
- Fixed 3 security holes (intake webhook fail-open, EmailBison timing attack, missing Zod validation)
- Added audit logs to 12 sprint write operations
- Extracted getUserId from 15 action files into shared requireAuth()
- Added try/catch to 4 action files missing error handling
- Fixed TBGC/truffleboys branding in email footer + 5 Bloo.io templates
- Deleted 7 dead email templates with TBGC branding

### Performance (2 commits)
- Added fetch timeouts to 13 API calls across 10 files
- Added env var startup validation (lib/env.ts)
- Sprint share tokens: Math.random() -> crypto.randomUUID()
- Cache invalidation: added revalidateTag alongside revalidatePath
- Added ArcJet rate limiting to 20+ routes (vault, search, exports, sync, analytics)
- Dynamic import recharts on 4 pages
- Batch sprint import (65 queries -> 3)
- Fixed N+1 in send-client-reports Inngest job
- Added LIMIT to 3 unbounded repository queries
- optimizePackageImports for lucide-react, recharts, date-fns
- AVIF + WebP image formats with 24hr cache TTL
- Removed 12MB unused assets from /public
- Parallelized 3 waterfall pages (products, messages, domains)
- Debounced ClientSearch and compliance dashboard filters
- Notification bell pauses polling when tab hidden
- Installed @vercel/speed-insights

### Features (3 commits)
- CampusGTM outreach pipeline: CSV lead upload, lead-to-CRM conversion, upload dialog
- Multi-workspace EmailBison sync (EMAILBISON_API_KEYS env var)
- Overview stats now show campaign-level totals from sync
- Client portal: rewrote reports page + portal landing with live counts
- AI tool fixes: unreachable taskspace tool, SQL injection in close_sprint, missing rock status "done", missing portfolio platforms
- Generate Now buttons for Strategy + Intelligence pages
- System health dashboard on /settings/integrations (14 integrations)
- Manual sync triggers on /settings (7 Inngest jobs)
- Client portal provisioning (one-click from client detail page)
- Actionable empty states on 11 pages

### Mobile (1 commit)
- 18 fixes for iPhone 375px/390px
- AI chat sidebar hidden on mobile with overlay toggle
- Signature canvas DPR coordinate fix
- Touch targets enlarged across marketing page, dashboard, notifications
- Floating chat bar respects iOS safe area

## Current Platform State

- **Build**: tsc 0 errors, lint 0 warnings, build clean
- **Scale**: 79 pages, 123 API routes, 27 schema files, 16 connectors, 41 Inngest jobs, 12 AI agents, 73 AI tools
- **Tests**: 5 E2E specs only. ZERO unit/integration tests.
- **Migrations**: Drizzle migrations not tracked (manual scripts in /scripts/)

## What to Work on Next (Prioritized)

### Priority 1: Test Coverage (HIGH IMPACT, ~2-3 hours)

The platform has ZERO unit or integration tests. This is the single biggest gap for production stability. Every fix we shipped today was verified by type-check and build, but never by automated tests. A single breaking change in a Drizzle query, a renamed column, or a bad merge could silently break billing, auth, or client data isolation with no automated detection.

**What to test first (ranked by blast radius):**

1. **Client portal data isolation** — The most critical security property. Write tests that verify:
   - Client A cannot see Client B's invoices, projects, documents, or messages
   - The `[slug]` URL parameter doesn't leak data across clients
   - Unauthenticated users are redirected
   - Users without `portalAccess: true` are blocked

2. **Billing pipeline** — Money flows. Test:
   - Invoice creation sets correct Stripe fields
   - markPaid updates status and creates audit log
   - Recurring invoice generation creates new invoices with correct dates
   - Overdue detection flags the right invoices at 3/10/21 day thresholds

3. **AI tool execution** — Test each tool category returns correct data shapes:
   - CRM tools (search_clients, create_client) against test DB
   - Finance tools (get_invoices, create_invoice)
   - Operations tools (get_current_sprint, create_task)
   - Verify tool responses don't throw on empty data

4. **Server action validation** — Test that:
   - Zod validation rejects bad input
   - requireAuth() throws for unauthenticated requests
   - Audit logs are created on write operations

5. **API route auth** — Verify every protected route returns 401/403 for unauthenticated requests

**Tech:** Use Vitest (already in the Next.js ecosystem). For DB tests, use a test database or transaction rollback pattern.

### Priority 2: Drizzle Migration Tracking (~30 min)

The `/drizzle` migrations directory doesn't exist. Schema changes have been applied via manual scripts in `/scripts/`. This needs to be formalized:

```bash
pnpm drizzle-kit generate  # Generate migration SQL from current schema
pnpm drizzle-kit migrate   # Apply (verify against prod first!)
```

Commit the `/drizzle` directory so migration state is version-controlled. This prevents schema drift between environments.

### Priority 3: Email Template Polish (~1-2 hours)

Transactional emails go directly to clients (invoice sends, contract sends, NPS surveys, overdue reminders). These are the most externally-visible part of the platform. Currently using a basic HTML template from `lib/email/shared.ts`.

**What to improve:**
- Design a professional email template matching the brutalist brand
- Test all email sending flows end-to-end:
  - Invoice send (via /invoices)
  - Contract send (via /contracts)
  - NPS survey send (via /nps)
  - Overdue reminder (via Inngest cron)
  - Daily digest (via Inngest cron)
  - Client status report (via Inngest cron)
- Verify "from" address, reply-to, and unsubscribe headers

### Priority 4: Stripe Webhook End-to-End Verification (~1 hour)

The Stripe webhook handler at `app/api/webhooks/stripe/route.ts` is 1,400+ lines. Verify:
- Payment success events update invoice status
- Subscription creation/update events sync to DB
- Customer creation events link to clients
- Webhook signature verification works
- Idempotency (duplicate events don't create duplicate records)

Use Stripe CLI to send test webhooks:
```bash
stripe listen --forward-to https://amcollective.vercel.app/api/webhooks/stripe
stripe trigger invoice.payment_succeeded
```

### Priority 5: Sprint Editor Hardening (~1-2 hours)

The sprint editor is the weekly-use tool. Improvements:
- Test the share link flow (generate token → share URL → public view)
- Verify drag-and-drop task reordering on mobile
- Add keyboard shortcuts (Enter to add task, Tab to indent)
- Test the import flow (AI-parsed sprint plan → sections + tasks)
- Verify sprint close flow (archive tasks, generate summary)

### Priority 6: Dashboard Morning Experience (~1 hour)

Make the dashboard perfect for the 9 AM check-in:
- Verify all 7 data sections load with real data
- Test the Actions Panel — are the action items actionable?
- Verify the Sprint Widget shows the current sprint correctly
- Test the Cash Runway Chart with real Mercury data
- Verify MRR from Stripe is accurate

### Priority 7: Playwright E2E Improvements (~1-2 hours)

The 5 existing E2E tests run against production only. Improve:
- Add `PLAYWRIGHT_BASE_URL` env var support for local testing
- Add tests for critical user flows:
  - Create client → enable portal → sign in as client → view dashboard
  - Create invoice → send → verify payment link
  - AI chat → ask question → verify tool call → verify response
- Set up CI to run E2E tests pre-deploy

### Priority 8: Documentation (~30 min)

Update `memory.md` with current state (it's been updated several times this session but should be finalized). Update `docs/PRD.md` to mark all completed phases and document the current architecture.

## Environment Variables Needed

These must be set in Vercel/Doppler for the platform to be fully functional:

**Required (platform won't work without):**
- `DATABASE_URL` — Neon PostgreSQL
- `CLERK_SECRET_KEY` + `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` — Auth
- `ANTHROPIC_API_KEY` — AI agent

**Required for billing:**
- `STRIPE_SECRET_KEY` — Stripe API
- `STRIPE_WEBHOOK_SECRET` — Webhook verification
- `RESEND_API_KEY` — Transactional email

**Required for integrations:**
- `VERCEL_API_TOKEN` — Vercel connector
- `MERCURY_API_KEY` — Banking
- `POSTHOG_PERSONAL_API_KEY` + `POSTHOG_PROJECT_ID` — Analytics
- `EMAILBISON_API_KEYS` — Multi-workspace outreach (format: `workspace:key,...`)
- `EMAILBISON_BASE_URL` — `https://send.meetcursive.com`
- `INNGEST_SIGNING_KEY` + `INNGEST_EVENT_KEY` — Background jobs
- `LINEAR_API_KEY` — Issue tracking
- `ARCJET_KEY` — Rate limiting + bot protection
- `SENTRY_DSN` — Error tracking

**Optional:**
- `GITHUB_PAT` + `GITHUB_KNOWLEDGE_OWNER` + `GITHUB_KNOWLEDGE_REPO` — AI memory
- `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN` — Caching

## Session Prompt for Next Conversation

Paste this to start the next Claude Code session:

```
Read CLAUDE.md, then memory.md, then docs/CONTINUATION-PLAN.md.

This is the AM Collective portal. Last session shipped ~15 commits covering QA, security,
performance, mobile, and features. The platform has 79 pages, 123 API routes, 73 AI tools.

Build status: tsc 0 errors, lint 0 warnings, build clean.

The top priority is test coverage — the platform has ZERO unit/integration tests. Start with
client portal data isolation tests, then billing pipeline, then AI tools. Use Vitest.

Secondary: Drizzle migration tracking, email template polish, Stripe webhook verification.

Work autonomously. Don't ask for permission. Ship production code.
```
