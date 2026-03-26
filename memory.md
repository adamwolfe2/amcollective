# AM Collective Portal - Memory

> Updated 2026-03-26 after full-day production hardening + feature session.

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
