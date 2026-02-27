# AM Collective Portal - Memory

> This file is updated by Claude Code at the end of each session. Read this at the start of every session to restore context.

## Current State
- **Phase**: 0+1+2+3 complete (Infrastructure + Foundation + CRM CRUD + Connectors)
- **Last Session**: Session 3 — Connectors + Live CEO Dashboard (Feb 26, 2026)
- **Last Commit**: `f3059e5` — feat: rebuild dashboard with live connectors, build costs page
- **Build Status**: Clean (tsc 0 errors, lint 0 errors / 10 warnings, build passes, 36 routes)
- **Production URL**: https://amcollective.vercel.app (auto-deploying)
- **Vercel Project**: prj_pWERrQuAlX8doYVNcMl0LrsqQuRT (am-collective/amcollective)
- **DB Seeded**: 6 projects, 3 team members, 2 clients, 2 invoices, 3 services, 5 audit logs

## Session 3 Completed Work

### Connector Framework (lib/connectors/)
- [x] `base.ts` — ConnectorResult interface, in-memory TTL cache (Map), safeCall wrapper
- [x] `vercel.ts` — Projects, deployments, usage (via Vercel REST API)
- [x] `stripe.ts` — MRR, charges, invoice stats, revenue trend (adapted from lib/stripe/config.ts)
- [x] `neon.ts` — Projects, usage, DB size (needs NEON_API_KEY — graceful degradation)
- [x] `clerk.ts` — User count, recent signups (via Clerk Backend API)
- [x] `posthog.ts` — DAU/WAU/MAU, top events (needs POSTHOG_PERSONAL_API_KEY — stubbed)
- [x] `index.ts` — Barrel export

### Connector Status
| Connector | Status | Missing Env Var |
|-----------|--------|-----------------|
| Vercel | Connected | — (VERCEL_API_TOKEN + VERCEL_TEAM_ID set) |
| Stripe | Connected | — (STRIPE_SECRET_KEY set) |
| Clerk | Connected | — (CLERK_SECRET_KEY set) |
| Neon | Needs key | NEON_API_KEY |
| PostHog | Needs keys | POSTHOG_PERSONAL_API_KEY + POSTHOG_PROJECT_ID |

### Inngest Background Sync (lib/inngest/)
- [x] `client.ts` — Lazy-init singleton proxy (adapted from Cursive patterns)
- [x] `jobs/sync-vercel-costs.ts` — Nightly at midnight PT, writes to ToolCost
- [x] `jobs/sync-stripe-mrr.ts` — Hourly, writes MRR snapshot to ToolCost
- [x] `jobs/sync-neon-usage.ts` — Nightly, writes Neon usage to ToolCost
- [x] `app/api/inngest/route.ts` — Serves all functions

### Dashboard (app/(admin)/dashboard/)
- [x] Live MRR from Stripe connector
- [x] Vercel deploy activity feed (10 most recent, color-coded by state)
- [x] Revenue trend chart (recharts AreaChart, 6-month)
- [x] 15-entry audit log activity feed
- [x] Graceful degradation: "Connection needed" state when connector fails

### Costs Page (app/(admin)/costs/)
- [x] Total monthly spend overview
- [x] Per-tool breakdown table
- [x] Per-project cost table
- [x] Per-client margin tracking (revenue, costs, gross margin $, margin %)
- [x] Cost trend chart (recharts BarChart, 3-month)
- [x] "Sync Now" button for manual Inngest trigger

### Enhanced Project Detail (app/(admin)/projects/[id]/)
- [x] Deploys tab — Last 5 Vercel deployments with status/commit/branch
- [x] Costs tab — Tool-by-tool cost breakdown from DB
- [x] Info cards: Monthly cost + Last deploy status added

## Session 2 Completed Work (Summary)
- 7 repositories, 5 server actions, 10 admin pages, 3 client portal pages
- Seed data in Neon, `@neondatabase/serverless` downgraded to 0.10.4

## Session 1 + 1.5 (Summary)
- Wholesail template cloned/stripped, Drizzle ORM, 20 tables, Clerk auth
- Neon DB, Sentry, Vercel deploy, .env.local with all credentials

## Still TODO
- [ ] **NEON_API_KEY**: Generate at console.neon.tech > API Keys, add to .env.local + Vercel
- [ ] **POSTHOG_PERSONAL_API_KEY**: Generate at PostHog settings > Personal API Keys
- [ ] **POSTHOG_PROJECT_ID**: Find in PostHog project settings
- [ ] **Inngest keys**: Register at app.inngest.com, add INNGEST_EVENT_KEY + INNGEST_SIGNING_KEY
- [ ] **Sentry DSN**: Create project at sentry.io, add SENTRY_DSN + SENTRY_AUTH_TOKEN
- [ ] **ArcJet key**: Create at app.arcjet.com, add ARCJET_KEY
- [ ] **First Clerk user**: Sign up, set publicMetadata.role = "owner" via Clerk API
- [ ] **Custom domain**: Add amcollectivecapital.com to Vercel project

## Key Decisions
- Auth: Clerk with session claims (no org mode)
- ORM: Drizzle (NOT Prisma)
- DB: Neon PostgreSQL + pgvector via `@neondatabase/serverless@0.10.4` + neon-http driver
- Design: Trackr Offset Brutalist (dark sidebar, #F3F3EF bg, Newsreader + Geist Mono)
- Route groups: app/(admin)/ and app/(client)/[slug]/
- Server Actions for CRUD (NOT API routes)
- Connectors are READ-ONLY with 5-min in-memory cache
- Inngest for background sync, NOT polling
- recharts for all charts (already in template from shadcn)

## Schema Overview (lib/db/schema/)
| File | Tables |
|------|--------|
| projects.ts | portfolioProjects, teamMembers, teamAssignments |
| crm.ts | clients, clientProjects, engagements |
| billing.ts | invoices, services |
| operations.ts | tasks, messages, alerts |
| costs.ts | toolAccounts, toolCosts, apiUsage |
| ai.ts | aiConversations, aiMessages, embeddings (pgvector) |
| system.ts | auditLogs, webhookRegistrations, domains |

## File Structure
```
amcollective/
├── app/(admin)/         # 10+ admin pages with live data
├── app/(client)/[slug]/ # 3 client portal pages
├── app/api/inngest/     # Inngest webhook endpoint
├── components/ui/       # 57 shadcn components
├── lib/connectors/      # 5 read-only service connectors + base
├── lib/inngest/         # Client + 3 sync jobs
├── lib/db/schema/       # Drizzle schema (7 domain files)
├── lib/db/repositories/ # 7 data access layers
├── lib/db/seed.ts       # Seed script
├── lib/actions/         # 5 server action files
├── lib/stripe/          # Full Stripe service layer (from Wholesail)
├── lib/auth/            # Clerk helpers
├── lib/middleware/       # ArcJet config
├── lib/analytics/       # PostHog server singleton
├── middleware.ts         # Clerk + route protection
└── .vercel/             # Vercel project link
```

## Session 4 Prompt (Phase 4: Messaging + Reports + Settings)

```
Read CLAUDE.md and memory.md first.

SCOPE: Phase 4 — Messaging system, PDF reports, and settings/integrations page.
Do NOT build AI agents or EOS features.

PREREQUISITES (all done):
1. Full CRM CRUD with 36 routes
2. 5 connectors (Vercel, Stripe, Neon, Clerk, PostHog)
3. Inngest background sync jobs
4. Live CEO dashboard + costs page
5. Deployed at https://amcollective.vercel.app

TASKS:
1. Settings/Integrations (/admin/settings/integrations):
   - Connection status for each connector (Vercel, Stripe, Neon, Clerk, PostHog)
   - Show connected / needs key / error for each
   - API key management — last 4 chars shown, link to generate
   - Adapted from existing lib/connectors/ status checks

2. Messaging system:
   - Adapt lib/integrations/blooio.ts for AM Collective
   - Build /admin/messages — thread list with client names
   - Build /admin/messages/[id] — thread detail
   - Build /client/[slug]/messages — client-scoped messaging
   - Notification preferences for team members

3. PDF invoice generation:
   - Adapt lib/pdf/ from Wholesail template
   - Generate AM Collective branded PDF invoices
   - Download button on /invoices/[id] page
   - Email invoice via Resend (lib/email/)

4. Reports page (/admin/reports or /client/[slug]/reports):
   - Client-facing monthly summary report
   - Project status, hours logged, costs, next steps
   - PDF export option

5. Validate (tsc + lint + build) before every commit
6. Update memory.md with Session 5 prompt (Phase 5: EOS features)

RULES:
- Adapt existing Wholesail code for messaging, PDF, and email — DO NOT rebuild
- Server Actions for all mutations
- AuditLog on every write
- Client portal scoped to client data
```

## Notes
- `@neondatabase/serverless` 1.0.2 is BROKEN with drizzle-orm 0.39.x — stay on 0.10.4
- `next lint` is broken in Next.js 16 — using `eslint` CLI directly
- Neon org is managed by Vercel — neonctl can list/query but cannot create/rename projects
- Clerk organizations are NOT enabled — roles via user `publicMetadata.role`
- Stripe connector reuses existing lib/stripe/config.ts singleton (getStripeClient)
- All connectors gracefully degrade — show error state, don't crash the page
