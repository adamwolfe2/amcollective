# AM Collective Portal - Memory

> This file is updated by Claude Code at the end of each session. Read this at the start of every session to restore context.

## Current State
- **Phase**: Not started
- **Last Session**: None
- **Last Commit**: Initial commit (PRD + README only)

## Completed
- [x] PRD written and committed to repo (am-collective-master-build-prompt.md)
- [x] CLAUDE.md created
- [x] memory.md created

## In Progress
- [ ] Nothing yet

## Next Up (Session 1)
- [ ] Copy Wholesail template into repo
- [ ] Strip wholesale-specific code
- [ ] Install dependencies
- [ ] Write Drizzle schema (15+ models)
- [ ] Configure Clerk auth with role-based route protection
- [ ] Configure Sentry, ArcJet, PostHog
- [ ] Build admin layout shell with full navigation
- [ ] Build client portal shell
- [ ] Create .env.example
- [ ] Deploy skeleton to Vercel

## Blockers
- None. Neon DB and Clerk app need to be created manually before Session 1.

## Key Decisions Made
- Base template: Wholesail portal-intake (NOT from scratch)
- Auth: Clerk (NOT Supabase)
- ORM: Drizzle (NOT Prisma)
- DB: Single Neon DB with schema-per-domain
- Cross-project data: Webhook push, not polling
- Design: Trackr Offset Brutalist UI

## Environment Setup Needed
- [ ] Neon: Create project "amcollective-prod", enable pgvector
- [ ] Clerk: Create app, set up org "AM Collective", create roles
- [ ] Doppler: Create project "am-collective"
- [ ] Vercel: Link project to AM Collective team workspace

## Notes
- Token budget is real. Use Opus for architecture, Sonnet for implementation.
- Don't regenerate UI components that exist in the template.
- Commit after each step, not at end of session.
