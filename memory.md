# AM Collective Portal - Memory

> This file is updated by Claude Code at the end of each session. Read this at the start of every session to restore context.

## Current State
- **Phase**: 0+1+2 complete (Infrastructure + Foundation + Core CRM CRUD)
- **Last Session**: Session 2 — Core CRM CRUD (Feb 26, 2026)
- **Last Commit**: `2c0418a` — feat: add seed script with sample data, fix neon-http driver compat
- **Build Status**: Clean (tsc 0 errors, lint 0 errors / 10 warnings, build passes, 35 routes)
- **Production URL**: https://amcollective.vercel.app (auto-deploying)
- **Vercel Project**: prj_pWERrQuAlX8doYVNcMl0LrsqQuRT (am-collective/amcollective)
- **DB Seeded**: 6 projects, 3 team members, 2 clients, 2 invoices, 3 services, 5 audit logs

## Session 2 Completed Work

### Repositories (lib/db/repositories/)
- [x] `audit.ts` — Shared AuditLog helper
- [x] `clients.ts` — CRUD for clients + clientProjects + engagements
- [x] `projects.ts` — CRUD for portfolioProjects with team/client joins
- [x] `team.ts` — CRUD for teamMembers + teamAssignments
- [x] `invoices.ts` — CRUD for invoices with client joins, status filters
- [x] `services.ts` — Service catalog CRUD
- [x] `activity.ts` — Recent activity feed from auditLogs

### Server Actions (lib/actions/)
- [x] `clients.ts` — Zod validated, Clerk auth-gated
- [x] `projects.ts` — with assignTeamMember
- [x] `team.ts` — inviteMember, updateMember, removeMember
- [x] `invoices.ts` — createInvoice, sendInvoice, markPaid (amounts in cents)
- [x] `services.ts` — CRUD actions

### Admin Pages (app/(admin)/)
- [x] `/clients` — List table with search, count badge, add dialog
- [x] `/clients/[id]` — Detail with 4 tabs (Overview, Projects, Invoices, Activity)
- [x] `/projects` — Card grid with health scores, status badges
- [x] `/projects/[id]` — Detail with Team/Clients/Costs tabs
- [x] `/team` — Roster table with role badges, invite dialog
- [x] `/team/[id]` — Member detail with Projects/Activity tabs
- [x] `/invoices` — Invoice list with status filter, create dialog with line items
- [x] `/invoices/[id]` — Detail with line items table, Send/Mark Paid actions
- [x] `/services` — Service catalog table with inline edit/delete
- [x] `/dashboard` — CEO dashboard: 4 KPI cards, recent activity, quick actions

### Client Portal (app/(client)/[slug]/)
- [x] `/dashboard` — Welcome, stats, recent invoices
- [x] `/projects` — Client-scoped project cards
- [x] `/invoices` — Client-scoped invoice table

### Seed Data (lib/db/seed.ts)
- [x] 6 portfolio projects (CampusGTM, TaskSpace, Trackr, Wholesail, Hook UGC, TBGC)
- [x] 3 team members (Adam Wolfe, Sarah Chen, Marcus Rivera)
- [x] 6 team assignments
- [x] 2 clients (Jordan Matthews/Apex Ventures, Elena Rodriguez/Brightpath Media)
- [x] 3 client-project links
- [x] 2 engagements
- [x] 2 invoices (INV-2026-001 paid $7,500, INV-2026-002 draft $5,000)
- [x] 3 services (Platform Build, Monthly Retainer, AI Integration)
- [x] 5 audit log entries

### Bug Fix
- [x] Downgraded `@neondatabase/serverless` from 1.0.2 to 0.10.4 — v1.0.2 broke drizzle-orm neon-http driver (tagged template function incompatibility)

## Infrastructure (Completed Session 1.5)
- [x] **Neon DB**: Project `floral-flower-60494944` (was neon-red-grass, reused from Vercel-managed org)
  - Host: ep-wandering-violet-ah0ec5sm.c-3.us-east-1.aws.neon.tech
  - Database: neondb, Owner: neondb_owner
  - pgvector 0.8.0 enabled
  - 20 tables created via `drizzle-kit push`
- [x] **Clerk**: Instance ins_3AEOP7Tjm0hjXLmqPdq3cMkMLC3 (development)
  - Session claims configured: `metadata` → `{{user.public_metadata}}`
  - Role checking via `sessionClaims?.metadata?.role` (owner/admin/member/client)
  - Organizations NOT enabled (roles via user publicMetadata instead)
- [x] **Sentry**: @sentry/nextjs 10.40.0 manually configured
  - **DSN NOT SET** — create Sentry project and add SENTRY_DSN env var
- [x] **Vercel**: Project created, linked to GitHub, 15 env vars set
- [x] **.env.local**: All credentials gathered from portfolio repos
- [x] **drizzle.config.ts**: Updated to load .env.local via dotenv

## Completed (Session 1)
- [x] PRD at docs/PRD.md
- [x] Wholesail template cloned and stripped
- [x] Prisma replaced with Drizzle ORM (7 schema files, 20 tables)
- [x] Clerk auth middleware with role-based route protection
- [x] ArcJet middleware: rate limiting + bot detection + shield
- [x] PostHog: server singleton + client provider
- [x] Admin layout (dark sidebar) + Client portal layout (light sidebar)
- [x] 57 shadcn components from Wholesail

## Still TODO
- [ ] **Sentry DSN**: Create project at sentry.io, add SENTRY_DSN + SENTRY_AUTH_TOKEN
- [ ] **ArcJet key**: Create at app.arcjet.com, add ARCJET_KEY
- [ ] **Inngest keys**: Create at app.inngest.com, add INNGEST_EVENT_KEY + INNGEST_SIGNING_KEY
- [ ] **Stripe**: Add NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY + STRIPE_WEBHOOK_SECRET
- [ ] **First Clerk user**: Sign up, set publicMetadata.role = "owner" via Clerk API
- [ ] **Custom domain**: Add amcollectivecapital.com to Vercel project

## Key Decisions
- Auth: Clerk with session claims (no org mode)
- ORM: Drizzle (NOT Prisma)
- DB: Neon PostgreSQL + pgvector via `@neondatabase/serverless@0.10.4` + neon-http driver
- Design: Trackr Offset Brutalist (dark sidebar, #F3F3EF bg, Newsreader + Geist Mono)
- Route groups: app/(admin)/ and app/(client)/[slug]/
- Server Actions for CRUD (NOT API routes)
- Every write operation creates AuditLog entry
- Invoice amounts stored in cents

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
├── app/(admin)/         # 10 admin pages with real CRUD
├── app/(client)/[slug]/ # 3 client portal pages with data
├── app/global-error.tsx # Sentry error boundary
├── components/ui/       # 57 shadcn components
├── lib/db/schema/       # Drizzle schema (7 domain files)
├── lib/db/repositories/ # 7 data access layers
├── lib/db/index.ts      # DB client singleton
├── lib/db/seed.ts       # Seed script (pnpm db:seed)
├── lib/actions/         # 5 server action files
├── lib/auth/            # Clerk helpers
├── lib/middleware/       # ArcJet config
├── lib/analytics/       # PostHog server singleton
├── middleware.ts         # Clerk + route protection
└── .vercel/             # Vercel project link
```

## Session 3 Prompt (Phase 3: Connectors + Live CEO Dashboard)

```
Read docs/PRD.md and memory.md first.

SCOPE: Phase 3 — External service connectors and live CEO dashboard. Do NOT build AI agents or EOS features.

PREREQUISITES (all done):
1. Core CRM CRUD complete (clients, projects, team, invoices, services)
2. DB seeded with sample data
3. Deployed at https://amcollective.vercel.app

TASKS:
1. Build connectors in lib/connectors/:
   - vercel.ts — Fetch project deployments, costs per project (use Vercel MCP or API)
   - stripe.ts — Revenue roll-up, recent charges across all projects
   - github.ts — Repo activity, recent commits per project
   - neon.ts — DB size, connection stats per project
   - resend.ts — Email send counts, deliverability per domain
2. CEO Dashboard (/admin/dashboard) — Replace static KPIs with live data:
   - Monthly revenue (Stripe connector)
   - Active deployments (Vercel connector)
   - Open invoice total (DB query)
   - Team utilization (DB query)
   - Recent activity feed (audit logs + GitHub commits)
3. Costs page (/admin/costs):
   - Vercel usage costs per project (Vercel API)
   - API usage tracking (Claude, Firecrawl, Tavily)
   - Monthly cost breakdown chart
4. Settings/Integrations (/admin/settings/integrations):
   - Connection status for each service
   - API key management (encrypted, last 4 chars shown)
5. Validate (tsc + lint + build) before every commit
6. Update memory.md with Session 4 prompt

Use MCP servers where available (Vercel MCP, Stripe MCP).
For services without MCP, use their REST APIs with fetch.
All connector functions must handle errors gracefully and return typed results.
Cache expensive API calls with reasonable TTLs.
```

## Notes
- `@neondatabase/serverless` 1.0.2 is BROKEN with drizzle-orm 0.39.x — stay on 0.10.4
- `next lint` is broken in Next.js 16 — using `eslint` CLI directly
- Neon org is managed by Vercel — neonctl can list/query but cannot create/rename projects
- Clerk organizations are NOT enabled — roles via user `publicMetadata.role`
