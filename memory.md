# AM Collective Portal - Memory

> This file is updated by Claude Code at the end of each session. Read this at the start of every session to restore context.

## Current State
- **Phase**: 0+1 complete (Infrastructure + Foundation), Infrastructure deployed
- **Last Session**: Session 1.5 — Infrastructure Setup (Feb 26, 2026)
- **Last Commit**: `14db44e` — feat: add Sentry error tracking, configure infrastructure
- **Build Status**: Clean (tsc 0 errors, lint 0 warnings, build passes, 31 routes)
- **Production URL**: https://amcollective.vercel.app (READY, deployed)
- **Vercel Project**: prj_pWERrQuAlX8doYVNcMl0LrsqQuRT (am-collective/amcollective)

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
  - Sign-in page working at /sign-in
- [x] **Sentry**: @sentry/nextjs 10.40.0 manually configured
  - sentry.client.config.ts, sentry.server.config.ts, sentry.edge.config.ts
  - instrumentation.ts for server/edge init
  - global-error.tsx error boundary
  - next.config.mjs wrapped with withSentryConfig
  - **DSN NOT SET** — create Sentry project and add SENTRY_DSN env var
- [x] **Vercel**: Project created, linked to GitHub, 15 env vars set across all environments
  - Auto-deploy on push to main
  - First deploy: READY in ~54 seconds
- [x] **.env.local**: Written with all gathered credentials
  - Clerk, Neon, Stripe (TBGC test), Resend, PostHog, Anthropic, Upstash, Firecrawl, Tavily, Bloo.io
- [x] **drizzle.config.ts**: Updated to load .env.local via dotenv

## Completed (Session 1)
- [x] PRD moved to docs/PRD.md
- [x] Wholesail template cloned and all wholesale code stripped
- [x] Prisma replaced with Drizzle ORM (7 schema files, 20 tables)
- [x] Dependencies installed (drizzle, inngest, posthog, arcjet, sentry, etc.)
- [x] Drizzle schema written: crm, billing, projects, operations, costs, ai, system
- [x] DB client at lib/db/index.ts (Neon HTTP via @neondatabase/serverless)
- [x] Clerk auth middleware with role-based route protection
- [x] Auth helpers: requireRole, requireAdmin, requireMember, requireOwner
- [x] ArcJet middleware: rate limiting + bot detection + shield
- [x] PostHog: server singleton + client provider component
- [x] Admin layout shell: dark sidebar (#0A0A0A), 16 nav items, Offset Brutalist
- [x] Client portal shell: light sidebar, slug-scoped, 6 nav items
- [x] 22 admin placeholder pages with phase badges
- [x] 6 client portal placeholder pages with phase badges
- [x] .env.example with all 25 env vars + inline comments
- [x] All three checks pass: tsc, lint, build

## Still TODO (Before Session 2)
- [ ] **Sentry DSN**: Create project at sentry.io, add SENTRY_DSN + SENTRY_AUTH_TOKEN to .env.local and Vercel
- [ ] **ArcJet key**: Create at app.arcjet.com, add ARCJET_KEY to .env.local and Vercel
- [ ] **Inngest keys**: Create at app.inngest.com, add INNGEST_EVENT_KEY + INNGEST_SIGNING_KEY
- [ ] **Stripe publishable key**: Add NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY (and create AM Collective-specific Stripe account or use existing)
- [ ] **Stripe webhook**: Create webhook endpoint in Stripe, add STRIPE_WEBHOOK_SECRET
- [ ] **First Clerk user**: Sign up at /sign-in, then set publicMetadata.role = "owner" via Clerk API
- [ ] **Custom domain**: Add amcollectivecapital.com to Vercel project

## Key Decisions Made
- Base template: Wholesail portal-intake (cloned + stripped)
- Auth: Clerk with session claims for role checking (no DB role lookup needed)
- ORM: Drizzle (NOT Prisma) — all schema in lib/db/schema/
- DB: Neon PostgreSQL + pgvector via @neondatabase/serverless + neon-http driver
- Design: Trackr Offset Brutalist (dark sidebar, #F3F3EF bg, Newsreader + Geist Mono)
- Route groups: app/(admin)/ and app/(client)/[slug]/
- ESLint: v9 with eslint-config-next v15 (next lint broken in Next.js 16, using eslint directly)
- Neon org managed by Vercel — must create projects via Vercel integration or reuse existing

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
├── app/(admin)/         # 22 admin pages + layout shell
├── app/(client)/[slug]/ # 6 client portal pages + layout
├── app/global-error.tsx # Sentry error boundary
├── app/api/             # Empty (Phase 2)
├── components/ui/       # 57 shadcn components (from Wholesail)
├── components/providers/ # PostHog provider
├── lib/db/schema/       # Drizzle schema (7 domain files)
├── lib/db/index.ts      # DB client singleton
├── lib/auth/            # Clerk helpers (requireRole, etc.)
├── lib/middleware/       # ArcJet config
├── lib/analytics/       # PostHog server singleton
├── lib/stripe/          # Stripe service layer (from Wholesail)
├── lib/email/           # Resend templates (from Wholesail)
├── lib/pdf/             # Invoice PDF (from Wholesail)
├── lib/integrations/    # Bloo.io messaging (from Wholesail)
├── middleware.ts         # Clerk + route protection
├── instrumentation.ts   # Sentry server/edge init
├── sentry.*.config.ts   # Sentry client/server/edge configs
├── drizzle.config.ts    # Drizzle Kit config (loads .env.local)
└── .vercel/             # Vercel project link
```

## Session 2 Prompt (Phase 2: Core CRM CRUD)

```
Read docs/PRD.md and memory.md first.

SCOPE: Phase 2 ONLY — Core CRM CRUD. Do NOT build connectors, AI, or EOS features.

PREREQUISITES (all done — verify .env.local has DATABASE_URL and Clerk keys):
1. Neon DB is live with 20 tables (verified)
2. Clerk is configured with session claims for role metadata
3. Vercel is deployed at https://amcollective.vercel.app

TASKS:
1. /admin/clients — Client list with DataTable, create dialog, search/filter
   - API: POST/GET /api/clients, GET/PATCH/DELETE /api/clients/[id]
   - Use Drizzle queries from lib/db/schema/crm.ts
2. /admin/clients/[clientId] — Client detail page with tabs (engagements, invoices, messages)
3. /admin/projects — Portfolio project grid with health score cards
   - API: CRUD /api/projects
4. /admin/team — Team roster with role badges, utilization
   - API: CRUD /api/team
5. /admin/invoices — Invoice list, create form, PDF generation, Stripe payment link
   - API: CRUD /api/invoices
6. /admin/services — Service catalog CRUD
   - API: CRUD /api/services
7. /admin/settings — Platform settings page
8. Client portal: /client/[slug]/dashboard, /invoices, /projects with real data
9. All API routes must use requireAdmin/requireMember/requireOwner guards
10. All write operations must create AuditLog entries
11. Validate (tsc + lint + build) before every commit
12. Update memory.md with Session 3 prompt

Clone Cursive CRM patterns for client detail pages.
Clone Wholesail DataTable patterns for list views.
Use the existing shadcn/ui components — do not regenerate.
```

## Notes
- The email/notifications.ts file is large (~29K tokens) — from Wholesail, has 20+ templates. Keep but adapt for AM Collective branding.
- Stripe service layer is clean and can be reused directly for AM Collective invoicing.
- `next lint` is broken in Next.js 16 — using `eslint` CLI directly via lint script.
- Neon org is managed by Vercel — neonctl can list/query but cannot create/rename projects. Use Vercel integration for new databases.
- Clerk organizations are NOT enabled on this instance. Roles are managed via user `publicMetadata.role`.
