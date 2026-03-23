# AM Collective Portal - Memory

> This file is updated by Claude Code at the end of each session. Read this at the start of every session to restore context.

## Current State
- **Phase**: All build phases complete (1–48+). Platform is production-ready.
- **Last Updated**: March 21, 2026
- **Last Commit**: `c68962e` — fix: QA hardening — replace 70+ console.error with captureError, fix lint warnings, enforce brutalist design
- **Build Status**: Clean (tsc 0 errors, lint 0 warnings, build passes, 209 routes)
- **Production URL**: https://amcollective.vercel.app (auto-deploying)
- **Vercel Project**: prj_pWERrQuAlX8doYVNcMl0LrsqQuRT (am-collective/amcollective)
- **Scale**: 79 pages, 123 API routes, 27 schema files, 16 connectors, 41 Inngest jobs, 12 AI agents

## Final QA Pass (March 21, 2026)

### Code Quality (70+ fixes)
- Replaced 70+ `console.error`/`console.warn` calls across 54 files with `captureError()` (Sentry)
- Fixed broken import in dashboard page
- Removed 18 duplicate captureError calls
- Removed unused imports (SUPER_ADMIN_EMAILS, unused catch variables)

### Security Audit (verified clean)
- All 123 API routes verified: every non-public route has auth guards
- 20 legitimately public routes confirmed: webhooks (signature-verified), public proposals/contracts/surveys, contact form (rate-limited), inngest (signed), bot endpoints (bearer/HMAC)
- All SQL uses Drizzle parameterized queries — no injection vectors
- Stripe webhook has signature verification via constructEvent
- Single dangerouslySetInnerHTML is safe (JSON-LD with JSON.stringify)

### TypeScript Hygiene (verified clean)
- Only 1 @ts-expect-error (Sentry instrumentation — legitimate)
- Only 1 `as any` (react-pdf render — legitimate)
- No implicit any, no @ts-ignore

### UI/UX Consistency (4 fixes)
- Fixed 4 rounded corner classes in marketing page to rounded-none

### Stripe Sync Fix (4 fixes)
- Fixed captureError calls passing strings instead of error objects
- Removed stray console.info

## Previous Work Summary

### Sessions 1–3 (Feb 2026): Foundation
- Wholesail template cloned/stripped, Drizzle ORM, Clerk auth, Neon DB
- 5 connectors (Vercel, Stripe, Clerk, Neon, PostHog)
- Inngest background sync, live CEO dashboard, costs page

### Sessions 4–8: Full Platform Build
- EOS schema + AI foundation (5 agents, chat UI)
- Full Stripe integration (sync engine, webhooks, billing dashboard)
- Overdue invoice detection, client portal billing

### Sessions 9–12: Scale Layer (Phases 8–48)
- All remaining phases built: CRM, contracts, forecasting, analytics
- Mercury banking, Gmail sync, EmailBison inbox
- Sales-to-cash pipeline, exports, webhooks

### Sessions 13–18: Hardening
- Comprehensive security passes (prompt injection, client isolation, CSP/HSTS)
- ArcJet rate limiting on all write endpoints
- Mobile optimization, toast notifications, error boundaries
- Collapsible sidebar, 10 infrastructure fixes

### Sessions 19–20: Performance
- Parallelized DB queries across all pages
- AI tool filtering (59 → ~15 tools/req), embedding cache
- unstable_cache, next/font migration, bundle reduction

## Admin Pages (app/(admin)/)
activity, ai, alerts, analytics, clients, compliance, contracts, costs, dashboard, documents,
domains, email, exports, finance, forecast, intelligence, invoices, knowledge, leads, meetings,
messages, nps, outreach, products, projects, proposals, rocks, scorecard, services, settings,
sprints, strategy, tasks, team, time, vault, webhooks

## Client Portal Pages (app/(client)/[slug]/)
board, dashboard, documents, invoices, messages, portal, projects, proposals, reports

## Connectors (lib/connectors/ — 16 total)
vercel, stripe, clerk, neon, posthog, mercury, linear, cursive, emailbison,
hook, taskspace, tbgc, trackr, wholesail + base framework

## Inngest Jobs (lib/inngest/jobs/ — 41 jobs)
Sync, AI/Intelligence, and Operations jobs across all integrations

## AI Agents (lib/ai/agents/ — 12)
ceo-agent, chat, research, outreach-agent, morning-briefing, weekly-intelligence,
anomaly-detection, client-health, cost-analysis, proactive, strategy-engine + shared/

## Schema (lib/db/schema/ — 27 files)
ai, billing, companies, contracts, costs, crm, documents, email-drafts, eos, index,
insights, integrations, kanban, leads, metrics, operations, outreach, project-snapshots,
projects, proposals, recurring, sprints, strategy, surveys, sync, system, time-tracking

## Key Decisions
- Auth: Clerk with session claims (no org mode), email-based super admin (adamwolfe102@gmail.com)
- ORM: Drizzle (NOT Prisma)
- DB: Neon PostgreSQL + pgvector via `@neondatabase/serverless@0.10.4` + neon-http driver
- Design: Trackr Offset Brutalist (dark sidebar, #F3F3EF bg, Newsreader + Geist Mono, NO rounded corners)
- Sentry for all error tracking (no console.error)
- ArcJet rate limiting on all write endpoints
- AI chat uses keyword-based tool filtering

## Notes
- `@neondatabase/serverless` 1.0.2 is BROKEN with drizzle-orm 0.39.x — stay on 0.10.4
- `next lint` is broken in Next.js 16 — using `eslint` CLI directly
- Neon org is managed by Vercel
- /api/inngest is in public routes for webhook access
- Super admin: adamwolfe102@gmail.com
