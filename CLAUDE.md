# AM Collective Portal - CLAUDE.md

## Project Identity
- **Name**: AM Collective Master Dashboard
- **Type**: Private multi-tenant agency CRM + CEO dashboard + client portals
- **Owner**: Adam Wolfe, AM Collective Capital
- **Repo**: https://github.com/adamwolfe2/amcollective
- **PRD**: docs/PRD.md (READ THIS FIRST for every session)
- **State**: memory.md (READ THIS SECOND -- updated each session)

## Architecture
- **Framework**: Next.js 15+ App Router with Server Actions and after()
- **Auth**: Clerk (roles: owner/admin/member/client)
- **Database**: Neon PostgreSQL + pgvector, Drizzle ORM
- **UI**: shadcn/ui components, Trackr Offset Brutalist design language
- **Base Template**: Cloned from Wholesail portal-intake (~/portal-intake)

## Critical Rules
1. **Read docs/PRD.md before every session.** It has all architectural decisions, schema, and build phases.
2. **Read memory.md for current state.** It tracks what's done, what's next, and blockers.
3. **Use Drizzle, not Prisma.** Portfolio is transitioning to Drizzle.
4. **Clerk for auth, not Supabase.** Hard decision from Cursive's lessons.
5. **Sentry must be configured before first deployment.** Non-negotiable.
6. **Every API route must have role-based middleware guards.**
7. **Every write operation must create an AuditLog entry.**
8. **Use after() from next/server for expensive operations** (PostHog captures, webhook sends, email).
9. **Clone and adapt, never regenerate.** The Wholesail template has 57 shadcn components. Don't rebuild them.
10. **Atomic commits per feature.** Commit after each meaningful unit of work, not at end of session.

## Tech Stack Quick Reference
| Layer | Tool | Notes |
|-------|------|-------|
| Auth | Clerk | @clerk/nextjs |
| DB | Neon + Drizzle | DATABASE_URL in env |
| Email | Resend | team@amcollectivecapital.com |
| Payments | Stripe | Webhook idempotency via webhookEvents |
| Analytics | PostHog | posthog-server.ts singleton pattern |
| Errors | Sentry | @sentry/nextjs |
| Security | ArcJet | Rate limit + bot detection + shield |
| Rate Limit | Upstash Redis | @upstash/ratelimit |
| Background | Inngest | Cron, webhooks, retry logic |
| AI | Claude SDK | @anthropic-ai/sdk |
| Secrets | Doppler | All env vars managed centrally |
| Vector | pgvector | Same Neon DB, separate schema |

## File Structure Conventions
- `lib/connectors/` - One file per external service (Vercel, Stripe, Neon, etc.)
- `lib/db/schema/` - Drizzle schema files organized by domain (crm, billing, projects, etc.)
- `lib/ai/agents/` - Specialized AI agent definitions
- `lib/ai/tools/` - Claude tool definitions for agents
- `lib/inngest/` - Background job definitions
- `lib/middleware/` - ArcJet, rate limiting
- `app/(admin)/` - Internal AM Collective admin views
- `app/(client)/[slug]/` - Per-client portal views
- `components/` - shadcn/ui + custom components

## Portfolio Repos (Clone Patterns, Don't Rebuild)
When you need patterns from existing projects, READ the source files directly:
- **Wholesail (base template)**: ~/portal-intake -- Admin+client portals, Stripe, invoices, PDF, messaging
- **TaskSpace**: ~/taskspace -- Multi-org hierarchy, EOS (Rocks/Scorecard/L10), EOD reports, feature toggles
- **Trackr**: ~/trackr -- PostHog integration, spend tracking, Firecrawl+Tavily research, Offset Brutalist UI
- **Cursive**: ~/cursive -- Inngest patterns, webhook system, CRM module, RAG/Ask Your Data, repository pattern
- **TBGC**: ~/tbgc -- Clerk auth middleware, Stripe webhooks, Bloo.io messaging, AI chat assistant

When cloning code from these repos:
1. `cat` the source file to understand it
2. Copy the file to the correct location in this repo
3. Adapt imports, types, and naming to match AM Collective conventions
4. Do NOT rewrite from scratch what already exists

## Sub-Agent Strategy

### When to Use Sub-Agents
- **Parallel independent work**: Schema files, config setup, placeholder pages
- **Scoped implementation**: Give each sub-agent ONE task with explicit file paths
- **Research before action**: Explore the Wholesail template structure before stripping code

### When NOT to Use Sub-Agents
- **Sequential dependencies**: Middleware depends on auth, API routes depend on schema
- **Architectural decisions**: Keep those in the main agent context
- **Small tasks**: If it's < 5 minutes of work, just do it

### Sub-Agent Context Rules
- Give sub-agents ONLY the context they need. Never the full PRD.
- For schema work: Give only Section 5 of docs/PRD.md
- For route work: Give only Section 6 of docs/PRD.md
- For auth work: Give only Section 7 of docs/PRD.md
- Always include the relevant tech stack info from this CLAUDE.md

### Useful Agent Patterns for This Project

**Codebase Explorer** (use before stripping Wholesail code):
Before deleting anything from the template, read the file structure and understand dependencies. Map what references what. Then strip surgically.

**Pre-Commit Validator** (use before every commit):
Run this sequence. Do not commit if any step fails:
1. `pnpm tsc --noEmit` (type-check)
2. `pnpm lint` (lint)
3. `pnpm build` (build)
Fix errors immediately. Re-run all checks. Only commit when all pass.

**Migration Planner** (use for schema work):
When writing Drizzle schema, think about: zero-downtime migrations, index strategy, foreign key cascades, and pgvector index type (HNSW vs IVFFlat).

## Session Protocol
1. **Start**: Read docs/PRD.md, then memory.md
2. **Orient**: Identify current phase and remaining work from memory.md
3. **Execute**: Work through tasks sequentially within the phase
4. **Validate**: Type-check + lint + build before each commit
5. **Commit**: Atomic commits with conventional commit messages
6. **End**: Update memory.md with completed work, next steps, blockers, and the Session N+1 prompt

## Commit Message Format
- `feat: description` for new features
- `fix: description` for bug fixes
- `chore: description` for maintenance/config
- `refactor: description` for code restructuring

## What This Project is NOT
- Not a SaaS product (private internal tool)
- Not starting from scratch (Wholesail template is the foundation)
- Not using Prisma, Supabase Auth, or custom cookie auth
- Not building mobile apps (responsive web only)
- Not implementing real-time websockets yet (React Query polling first)
