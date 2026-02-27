# AM Collective Portal - Memory

> This file is updated by Claude Code at the end of each session. Read this at the start of every session to restore context.

## Current State
- **Phase**: 0+1 complete (Infrastructure + Foundation)
- **Last Session**: Session 1 (Feb 26, 2026)
- **Last Commit**: `3910540` — feat: scaffold AM Collective platform from Wholesail template
- **Build Status**: Clean (tsc 0 errors, lint 0 errors, build passes, 31 routes)

## Completed (Session 1)
- [x] PRD moved to docs/PRD.md
- [x] Wholesail template cloned and all wholesale code stripped
- [x] Prisma replaced with Drizzle ORM (7 schema files, 20 tables)
- [x] Dependencies installed (drizzle, inngest, posthog, arcjet, etc.)
- [x] Drizzle schema written: crm, billing, projects, operations, costs, ai, system
- [x] DB client at lib/db/index.ts (Neon HTTP via @neondatabase/serverless)
- [x] drizzle.config.ts configured
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
- [x] Pushed to origin/main

## NOT Done (Deferred)
- [ ] Sentry wizard setup (requires interactive CLI: `npx @sentry/wizard@latest -i nextjs`)
  - Run this manually before first deploy
  - Will create sentry.client.config.ts, sentry.server.config.ts, sentry.edge.config.ts
  - Needs SENTRY_DSN and SENTRY_AUTH_TOKEN env vars
- [ ] Vercel project linking (manual: `vercel link`)
- [ ] Deploy to Vercel (do after Clerk + Neon are configured)

## Environment Setup Needed (Before Session 2)
- [ ] **Neon**: Create project `amcollective-prod` at console.neon.tech
  - Enable pgvector extension: `CREATE EXTENSION IF NOT EXISTS vector;`
  - Copy DATABASE_URL to .env.local
  - Run `pnpm db:push` to create tables
- [ ] **Clerk**: Create app at dashboard.clerk.com
  - Create org "AM Collective Capital"
  - Add roles: owner, admin, member, client
  - Copy publishable key + secret key to .env.local
  - Configure session claims to include `metadata.role`
- [ ] **Sentry**: Run `npx @sentry/wizard@latest -i nextjs` in the repo
- [ ] **PostHog**: Get project API key from us.posthog.com
- [ ] **ArcJet**: Get API key from app.arcjet.com
- [ ] **Upstash**: Create Redis database at console.upstash.com
- [ ] **Stripe**: Copy existing AM Collective Stripe keys
- [ ] **Anthropic**: Copy API key

## Key Decisions Made
- Base template: Wholesail portal-intake (cloned + stripped)
- Auth: Clerk with session claims for role checking (no DB role lookup needed)
- ORM: Drizzle (NOT Prisma) — all schema in lib/db/schema/
- DB: Neon PostgreSQL + pgvector via @neondatabase/serverless + neon-http driver
- Design: Trackr Offset Brutalist (dark sidebar, #F3F3EF bg, Newsreader + Geist Mono)
- Route groups: app/(admin)/ and app/(client)/[slug]/
- ESLint: v9 with eslint-config-next v15 (next lint broken in Next.js 16, using eslint directly)

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
└── drizzle.config.ts    # Drizzle Kit config
```

## Session 2 Prompt (Phase 2: Core CRM CRUD)

```
Read docs/PRD.md and memory.md first.

SCOPE: Phase 2 ONLY — Core CRM CRUD. Do NOT build connectors, AI, or EOS features.

PREREQUISITES (verify before starting):
1. Neon DB is created and DATABASE_URL is in .env.local
2. Run `pnpm db:push` to create tables
3. Clerk app is created with publishable + secret keys in .env.local

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
