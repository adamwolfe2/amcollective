# AM Collective Master Dashboard: Complete Build Prompt & PRD

> **Purpose**: This document is the single source of truth for building the AM Collective internal operations platform from scratch. Hand this entire document to Claude Code (Opus 4.6) in a fresh Warp terminal session. It contains every decision, every file to clone, every integration to wire up, and the exact sequence to build it in.

> **Owner**: Adam Wolfe | AM Collective Capital  
> **Target**: Private internal CRM + CEO dashboard + client portal + AI agent hub  
> **Base Template**: Wholesail portal-intake (TBGC-synced)  
> **Design Language**: Trackr's Offset Brutalist UI

---

## Table of Contents

1. [Project Overview & Vision](#1-project-overview--vision)
2. [Architecture Decision Record](#2-architecture-decision-record)
3. [Tech Stack (Final)](#3-tech-stack-final)
4. [Source Repos & What to Clone](#4-source-repos--what-to-clone)
5. [Data Model (Prisma Schema)](#5-data-model-prisma-schema)
6. [Application Structure](#6-application-structure)
7. [Authentication & Security](#7-authentication--security)
8. [Integration Connectors](#8-integration-connectors)
9. [AI Agent Architecture](#9-ai-agent-architecture)
10. [Build Sequence (Phased)](#10-build-sequence-phased)
11. [Claude Code Session Prompt](#11-claude-code-session-prompt)
12. [MCP & Environment Setup](#12-mcp--environment-setup)
13. [What NOT to Build (Scope Control)](#13-what-not-to-build-scope-control)
14. [Success Criteria](#14-success-criteria)

---

## 1. Project Overview & Vision

AM Collective Capital operates a portfolio of 6+ companies (CampusGTM/Cursive, TaskSpace, Trackr, Wholesail, Hook UGC, TBGC) with 17+ Vercel projects, dozens of API keys, multiple Stripe accounts, and a growing team. Today, running these companies requires jumping between 15+ tools. This platform consolidates everything into one private, secure, internal dashboard.

**What this is**: A multi-tenant agency CRM with a CEO dashboard, client portals, team management, financial tracking, and AI-powered operations intelligence. Built on the same battle-tested infrastructure as the TBGC order portal.

**What this is NOT**: A public SaaS product. This is private internal tooling for AM Collective and invited clients only.

**The mental model**: You already built the TBGC portal for a client. Now you're the client. Same architecture, different domain model.

### Core Concept Mapping (TBGC to AM Collective)

| TBGC Concept | AM Collective Equivalent |
|---|---|
| Org (restaurant client) | Portfolio company or agency client |
| Order (food order) | Project / deliverable |
| Invoice / Quote | Agency invoice / proposal |
| Product catalog | Services catalog |
| Admin portal | Internal ops dashboard (CEO view) |
| Client portal | Client-facing project tracker |
| Rocky AI assistant | AM Collective internal AI agent |
| Messaging (Bloo.io) | Client communication hub |
| Sales rep | Team member / project lead |

---

## 2. Architecture Decision Record

These decisions are final. Do not revisit during the build.

| Decision | Choice | Rationale |
|---|---|---|
| Base template | Wholesail portal-intake | Most complete (460 files, 146 routes, admin+client portals). Already decoupled from TBGC food-specific logic. |
| Auth provider | Clerk | Already on team plan. Handles MFA, org hierarchy, roles, API keys. Avoids Supabase auth security debt (Cursive lesson). |
| Database | Neon PostgreSQL (new project) | Fresh slate. Don't pollute existing DBs. Consistent with portfolio standard. |
| ORM | Drizzle | Consistent with Trackr, Wholesail. Compile-time type safety. |
| Vector search | pgvector on same Neon DB | No new service needed. Separate schema, same database. |
| Background jobs | Inngest | Battle-tested in Cursive. Retry/step/cron patterns ready. |
| Cross-project data | Webhook push (Option A) | Each portfolio project POSTs normalized events to AM Collective. Decoupled, simple. Direct DB reads as Phase 2+ for high-value aggregations only. |
| UI design | Trackr's Offset Brutalist | Distinctive, fast to build, bespoke feel for clients. |
| DB architecture | Single Neon DB, schema-per-domain | Budget-friendly. Cross-schema queries far easier than cross-database. Schemas: crm.*, billing.*, projects.*, ai_agents.*, analytics.* |
| Start approach | Clone Wholesail, strip wholesale logic | NOT from scratch. Saves 30-40% of tokens recreating auth, middleware, DB patterns, UI components. |

---

## 3. Tech Stack (Final)

| Layer | Tool | Notes |
|---|---|---|
| Framework | Next.js 15+ (App Router, Server Actions, after()) | Same as entire portfolio |
| Auth | Clerk | One org = AM Collective. Roles: owner, admin, member, client |
| Database | Neon PostgreSQL + pgvector | New project: `amcollective-prod` |
| ORM | Drizzle | Type-safe, compile-time guarantees |
| Email | Resend | Already on team plan at team@amcollectivecapital.com with 10 domains |
| Payments | Stripe | Already on team plan. Webhook idempotency via webhookEvents table |
| Analytics | PostHog | Already connected across projects. Use exact Trackr pattern |
| Error tracking | Sentry | @sentry/nextjs. Configure BEFORE first commit |
| Observability | Axiom | Vercel logs integration (2 min setup from Vercel marketplace) |
| Rate limiting | Upstash Redis | Same pattern as Trackr lib/middleware/rate-limit.ts |
| Security | ArcJet | Rate limit, bot detection, shield. From day 1 |
| AI | Claude SDK (Opus for agents, Sonnet for research, Haiku for classification) | Already have API key |
| Search/scrape | Firecrawl + Tavily | Already in Trackr for research pipeline |
| Background jobs | Inngest | Cron, webhooks, retry logic |
| Secrets | Doppler | One place for all secrets across 17+ projects. Non-negotiable with 40+ env vars |
| CI/Code review | CodeRabbit | On new repo from day 1 |
| Hosting | Vercel | New project under AM Collective team workspace |
| UI components | shadcn/ui | Consistent across TBGC, Wholesail, Cursive, Trackr |
| PDF generation | Copy from Wholesail/TBGC | Invoice + report PDF generation already built |
| Messaging | Bloo.io | Copy integration pattern from Wholesail |

---

## 4. Source Repos & What to Clone

### Primary Base: Wholesail Portal Intake
- **Local path**: `/Users/adamwolfe/portal-intake`
- **What to copy**: EVERYTHING initially, then strip
- **Clone command**: `cp -r /Users/adamwolfe/portal-intake /Users/adamwolfe/am-collective`

**Keep from Wholesail (copy verbatim)**:
- `components/` (57 shadcn/ui components, data tables, stat cards, modals, forms)
- Admin dashboard layout (sidebar, nav, breadcrumbs, responsive shell)
- `lib/auth/` (Clerk RBAC helpers: admin/rep/client roles)
- `lib/stripe/` (Stripe service, billing portal, invoice generation)
- `lib/email/` (20+ Resend template patterns)
- `lib/pdf/` (Invoice + price list PDF generation)
- `lib/rate-limit.ts` (Upstash rate limiting)
- `middleware.ts` (Route protection pattern)
- `lib/ai/order-parser.ts` (AI SDK integration pattern, swap order parsing for RAG chat)
- `lib/integrations/blooio.ts` (Messaging integration pattern, template for other connectors)
- `app/(admin)/` (Entire admin shell and pattern)

**Delete from Wholesail** (food-specific, irrelevant):
- `lib/pricing.ts`, `lib/loyalty.ts`, `lib/smart-reorder.ts`, `lib/sms-ordering.ts`
- All product catalog / wholesale application logic
- Food-specific AI order parser logic
- Drops/flash-sale features
- Distributor-facing wholesale application flow

### From TaskSpace
- **GitHub repo**: TaskSpace repo
- **What to pull**:
  - Multi-org hierarchy pattern (Organization > Workspace > Member)
  - `verifyWorkspaceOrgBoundary` middleware (data isolation between client companies)
  - WorkspaceFeatureToggles (control what each client sees per portal)
  - EOD Reports system (repurpose for client status updates)
  - API pattern (ApiResponse, Zod validation, error handling)
  - AI Workspace Builder (onboarding: paste client brief, AI extracts team/projects/deliverables)
  - Rocks + Scorecard + L10 (run AM Collective on EOS internally)

### From Trackr
- **GitHub repo**: Trackr repo
- **What to pull**:
  - Firecrawl + Tavily + Perplexity + GPT-4o research pipeline
  - `after()` + background job pattern for expensive AI work
  - Spend tracking module (softwareSpend table, adapt for API cost tracking per project)
  - PostHog integration (posthog-server.ts singleton + PostHogProvider + after() captures)
  - Stripe billing architecture (webhook idempotency via webhookEvents table)
  - Offset Brutalist Design System (UI/UX patterns)
  - Rate limiting (Upstash Redis helper in lib/middleware/rate-limit.ts)

### From Cursive
- **GitHub repo**: Cursive repo
- **What to pull**:
  - Repository pattern (typed repositories with error transformation)
  - Inngest background job architecture (retry/step/cron)
  - Outbound webhook system (webhook delivery + retry + delivery logs)
  - "Ask Your Data" RAG architecture (AskYourDataSlideOver + Tavily + pgvector)
  - Admin revenue dashboard patterns (waterfall, KPI tiles, trend indicators, audit log viewer)
  - CRM module (contacts, companies, deals, pipeline, activities, conversations)
  - Email sequence system (List-Unsubscribe, bounce handling, cadence management)

### From TBGC
- **GitHub repo**: TBGC repo
- **What to pull** (most already in Wholesail template):
  - Prisma base schema patterns (User, Org, Invoice, Message models)
  - Clerk auth middleware
  - Stripe webhook handler
  - Bloo.io SMS integration
  - PDF invoice generation
  - AI chat assistant pattern (Rocky > repurpose as AM Collective agent)
  - Email template system
  - `getSiteUrl()` utility

---

## 5. Data Model (Prisma/Drizzle Schema)

15 core models. NOT 39. Lean and purpose-built.

```
// Core Entities
PortfolioProject {
  id, name, slug, domain, vercelProjectId, githubRepo
  status (active/paused/archived), healthScore (0-100)
  createdAt, updatedAt
}

Client {
  id, name, companyName, email, phone, website
  clerkUserId, portalAccess (boolean), accessLevel (viewer/collaborator/admin)
  notes, createdAt, updatedAt
  // A client can span multiple projects
}

ClientProject {
  id, clientId, projectId
  role, startDate, endDate, status
  // Junction table: which clients are on which projects
}

Engagement {
  id, clientId, projectId, title, description
  type (build/retainer/consulting/maintenance)
  status (discovery/active/paused/completed/cancelled)
  startDate, endDate, value (cents), valuePeriod (one_time/monthly/annual)
  createdAt, updatedAt
}

Invoice {
  id, engagementId, clientId, stripeInvoiceId
  number, status (draft/sent/paid/overdue/cancelled)
  amount (cents), currency, dueDate, paidAt
  pdfUrl, lineItems (JSON)
  createdAt, updatedAt
}

Service {
  id, name, description, category
  basePrice (cents), pricePeriod
  isActive, sortOrder
}

TeamMember {
  id, name, email, clerkUserId, role (owner/admin/member)
  title, avatarUrl, isActive
  // Assigned across multiple projects
}

TeamAssignment {
  id, teamMemberId, projectId
  role, hoursPerWeek, startDate, endDate
}

ToolAccount {
  id, name (Vercel/Neon/Clerk/Stripe/Resend/Upstash/etc)
  accountId, apiKeyRef (Doppler reference, NOT plaintext)
  monthlyBudget, alertThreshold
}

ToolCost {
  id, toolAccountId, projectId
  amount (cents), period (monthly), periodStart, periodEnd
  metadata (JSON: usage details)
}

APIUsage {
  id, provider (anthropic/openai/firecrawl/tavily/etc)
  projectId, tokensUsed, creditsUsed, cost (cents)
  date, metadata (JSON)
}

Task {
  id, title, description, status (todo/in_progress/done)
  priority (high/medium/low), dueDate
  assigneeId (TeamMember), projectId, clientId (optional)
  source (manual/linear/voice/webhook)
  createdAt, updatedAt
}

Message {
  id, threadId, direction (inbound/outbound)
  channel (email/sms/blooio/slack)
  from, to, subject, body, metadata (JSON)
  projectId, clientId, isRead
  createdAt
}

AIConversation {
  id, userId, title, model
  createdAt, updatedAt
}

AIMessage {
  id, conversationId, role (user/assistant/system/tool)
  content, toolCalls (JSON), tokenCount
  createdAt
}

AuditLog {
  id, actorId, actorType (user/system/agent)
  action, entityType, entityId
  metadata (JSON), ipAddress
  createdAt
}

WebhookRegistration {
  id, projectId, endpointUrl, secret
  events (JSON array of event types)
  isActive, lastPingAt, lastFailureAt
  createdAt
}

Alert {
  id, projectId, type (error_spike/cost_anomaly/build_fail/health_drop)
  severity (info/warning/critical)
  title, message, metadata (JSON)
  isResolved, resolvedAt, resolvedBy
  createdAt
}

Domain {
  id, projectId, name, registrar
  expiresAt, autoRenew, sslStatus
  dnsRecords (JSON)
}

// Vector embeddings table (pgvector)
Embedding {
  id, content, embedding (vector(1536))
  sourceType (sop/client_note/project_doc/invoice/meeting)
  sourceId, metadata (JSON)
  createdAt
}
```

---

## 6. Application Structure

```
am-collective/
├── app/
│   ├── (admin)/                          # Internal AM Collective team views
│   │   ├── dashboard/                    # CEO view: revenue, projects, team health
│   │   │   └── page.tsx                  # Morning briefing, KPI tiles, alerts
│   │   ├── clients/                      # CRM: all client companies
│   │   │   ├── page.tsx                  # Client list with search/filter
│   │   │   └── [clientId]/              
│   │   │       ├── page.tsx              # Client detail (from Cursive CRM)
│   │   │       ├── engagements/          # Their projects with us
│   │   │       ├── invoices/             # Their billing history
│   │   │       └── messages/             # Communication history
│   │   ├── projects/                     # All portfolio companies + client projects
│   │   │   ├── page.tsx                  # Grid view with health scores
│   │   │   └── [projectId]/
│   │   │       ├── page.tsx              # Deploy status, costs, metrics
│   │   │       ├── team/                 # Who's assigned
│   │   │       ├── costs/                # Vercel + API spend breakdown
│   │   │       └── settings/             # Webhooks, API keys, config
│   │   ├── invoices/                     # Billing across all clients (Stripe)
│   │   │   ├── page.tsx                  # Invoice list, status filters
│   │   │   └── [invoiceId]/page.tsx      # Invoice detail + PDF
│   │   ├── services/                     # What AM Collective sells
│   │   │   └── page.tsx                  # Service catalog management
│   │   ├── team/                         # Staff across all projects
│   │   │   ├── page.tsx                  # Team roster + utilization
│   │   │   └── [memberId]/page.tsx       # Member detail + assignments
│   │   ├── costs/                        # Financial intelligence
│   │   │   ├── page.tsx                  # Vercel spend, API costs, per-project
│   │   │   ├── api-usage/                # Token/credit tracking per provider
│   │   │   └── margins/                  # Revenue vs cost per client (the moat)
│   │   ├── domains/                      # Domain management (Vercel MCP)
│   │   │   └── page.tsx                  # DNS, SSL, expiry, transfers
│   │   ├── rocks/                        # AM Collective quarterly OKRs (EOS)
│   │   │   └── page.tsx                  # From TaskSpace
│   │   ├── scorecard/                    # Weekly metrics (EOS)
│   │   │   └── page.tsx                  # From TaskSpace
│   │   ├── meetings/                     # L10 meeting notes
│   │   │   └── page.tsx                  # From TaskSpace
│   │   ├── messages/                     # Unified inbox
│   │   │   └── page.tsx                  # Bloo.io + email + Slack aggregation
│   │   ├── ai/                           # Internal AI agent chat
│   │   │   └── page.tsx                  # RAG over all data (Cursive pattern)
│   │   ├── alerts/                       # System alerts from all projects
│   │   │   └── page.tsx                  # Error spikes, cost anomalies, build fails
│   │   ├── activity/                     # Cross-project audit log
│   │   │   └── page.tsx                  # Timeline of all events
│   │   └── settings/                     # Platform configuration
│   │       ├── integrations/             # API keys, webhook registrations
│   │       ├── team/                     # Invite/manage team members
│   │       └── security/                 # ArcJet rules, audit log, Clerk config
│   │
│   ├── (client)/[slug]/                  # Per-client portal (TBGC pattern)
│   │   ├── dashboard/page.tsx            # Client's project status overview
│   │   ├── projects/                     # Their active engagements
│   │   │   └── [projectId]/page.tsx      # Project detail + deliverables
│   │   ├── invoices/page.tsx             # Their invoices
│   │   ├── reports/page.tsx              # EOD/weekly status reports (TaskSpace)
│   │   ├── messages/page.tsx             # Communication with AM Collective
│   │   └── portal/page.tsx               # Deliverables, files, downloads
│   │
│   ├── api/
│   │   ├── webhooks/
│   │   │   ├── stripe/route.ts           # Stripe webhook handler
│   │   │   ├── vercel/route.ts           # Vercel deploy webhooks
│   │   │   ├── sentry/route.ts           # Error spike alerts
│   │   │   └── inbound/[projectSlug]/route.ts  # Spoke project event ingestion
│   │   ├── connectors/
│   │   │   ├── vercel/route.ts           # Pull deploy status, costs
│   │   │   ├── stripe/route.ts           # Pull MRR, invoices
│   │   │   ├── neon/route.ts             # DB health per project
│   │   │   ├── clerk/route.ts            # User counts per project
│   │   │   └── postHog/route.ts          # Analytics roll-up
│   │   ├── ai/
│   │   │   ├── chat/route.ts             # Internal AI agent (streaming)
│   │   │   ├── embed/route.ts            # Embedding pipeline
│   │   │   └── agents/
│   │   │       ├── morning-brief/route.ts
│   │   │       ├── client-health/route.ts
│   │   │       └── cost-analysis/route.ts
│   │   ├── clients/                      # CRUD
│   │   ├── projects/                     # CRUD
│   │   ├── invoices/                     # CRUD + PDF generation
│   │   ├── team/                         # CRUD
│   │   └── auth/                         # Clerk webhooks
│   │
│   ├── sign-in/[[...sign-in]]/page.tsx
│   ├── sign-up/[[...sign-up]]/page.tsx
│   ├── layout.tsx
│   └── page.tsx                          # Landing/redirect
│
├── lib/
│   ├── connectors/                       # One file per external service
│   │   ├── vercel.ts                     # Vercel REST API connector
│   │   ├── stripe.ts                     # Stripe multi-account connector
│   │   ├── neon.ts                       # Neon API connector
│   │   ├── clerk.ts                      # Clerk API connector
│   │   ├── postHog.ts                    # PostHog API connector
│   │   ├── linear.ts                     # Linear API (task sync)
│   │   ├── resend.ts                     # Resend email connector
│   │   └── mercury.ts                    # Mercury (stub until API available)
│   ├── ai/
│   │   ├── chat.ts                       # Claude SDK chat handler
│   │   ├── embeddings.ts                 # pgvector embedding pipeline
│   │   ├── rag.ts                        # RAG query handler
│   │   ├── agents/
│   │   │   ├── morning-briefing.ts       # Cron: 7am daily
│   │   │   ├── client-health.ts          # Trigger: invoice/milestone events
│   │   │   ├── cost-analysis.ts          # Cron: weekly
│   │   │   └── research.ts              # Trigger: new tool/vendor added
│   │   └── tools/                        # Claude tool definitions
│   │       ├── vercel-tools.ts
│   │       ├── stripe-tools.ts
│   │       └── project-tools.ts
│   ├── auth/                             # Clerk helpers + middleware
│   ├── db/                               # Drizzle schema + queries
│   │   ├── schema/
│   │   │   ├── crm.ts                    # Clients, engagements
│   │   │   ├── billing.ts                # Invoices, services
│   │   │   ├── projects.ts               # Portfolio projects, assignments
│   │   │   ├── operations.ts             # Tasks, messages, alerts
│   │   │   ├── costs.ts                  # ToolAccount, ToolCost, APIUsage
│   │   │   ├── ai.ts                     # Conversations, messages, embeddings
│   │   │   └── system.ts                 # AuditLog, webhooks, domains
│   │   ├── queries/                      # Typed query functions per domain
│   │   └── migrations/
│   ├── email/                            # Resend templates
│   ├── pdf/                              # Invoice + report PDF generation
│   ├── stripe/                           # Stripe service layer
│   ├── inngest/                          # Background job definitions
│   │   ├── client.ts                     # Inngest client
│   │   ├── sync-vercel-costs.ts          # Nightly Vercel cost pull
│   │   ├── sync-stripe-mrr.ts            # Hourly Stripe MRR
│   │   ├── morning-briefing.ts           # 7am CEO briefing
│   │   ├── client-health-check.ts        # After invoice/milestone events
│   │   └── weekly-cost-report.ts         # Weekly cost analysis
│   ├── middleware/
│   │   ├── rate-limit.ts                 # Upstash Redis
│   │   └── arcjet.ts                     # ArcJet shield
│   └── utils/                            # Shared utilities
│
├── components/                           # shadcn/ui + custom (from Wholesail)
│   ├── ui/                               # Base shadcn components
│   ├── dashboard/                        # CEO view widgets
│   ├── clients/                          # Client CRM components
│   ├── projects/                         # Project cards, health indicators
│   ├── invoices/                         # Invoice tables, PDF preview
│   ├── team/                             # Team roster, utilization charts
│   ├── costs/                            # Spend charts, margin tables
│   ├── ai/                               # Chat interface, agent status
│   └── layout/                           # Sidebar, nav, shell
│
├── inngest/                              # Inngest function exports
├── drizzle/                              # Migration files
├── public/
├── .env.local                            # Local dev (Doppler pulls to this)
├── doppler.yaml                          # Doppler project config
├── drizzle.config.ts
├── next.config.ts
├── middleware.ts                          # Clerk + ArcJet route protection
├── tailwind.config.ts
├── tsconfig.json
└── package.json
```

---

## 7. Authentication & Security

### Clerk Configuration

**Organization**: AM Collective Capital  
**Roles**:
- `owner` (Adam) - full access to everything
- `admin` - full internal access, no billing/security settings
- `member` - team member, access to assigned projects only
- `client` - external client, access to their portal only

**Clerk Features to Enable**:
- Multi-factor authentication (MFA) required for owner/admin
- Organization invitations for team + clients
- Session management (custom session duration)
- Webhook sync to AM Collective DB (user.created, user.updated, org.membership.created)

### Security Stack (All from Day 1)

| Layer | Tool | Config |
|---|---|---|
| Application firewall | ArcJet | Rate limiting on all API routes, bot detection, shield mode |
| Auth | Clerk | MFA, session management, RBAC |
| Rate limiting | Upstash Redis | Per-user, per-route limits |
| Error tracking | Sentry | DSN configured before first deployment |
| Secrets | Doppler | All env vars managed centrally, never in .env files in prod |
| Audit logging | Custom AuditLog table | Every write operation logged with actor + timestamp |
| API route protection | middleware.ts | withAdmin, withMember, withClient guards on every route |
| CORS | Next.js config | Locked to amcollective domain only |
| Content Security Policy | Next.js headers | Strict CSP headers |

### Route Protection Matrix

| Route Pattern | Required Role | Notes |
|---|---|---|
| `/dashboard/*` | owner, admin | CEO view |
| `/clients/*` | owner, admin, member | Members see assigned only |
| `/projects/*` | owner, admin, member | Members see assigned only |
| `/invoices/*` | owner, admin | Billing access |
| `/costs/*` | owner | Financial intelligence |
| `/team/*` | owner, admin | Team management |
| `/settings/*` | owner | Platform config |
| `/ai/*` | owner, admin, member | Internal AI agent |
| `/client/[slug]/*` | client | Their portal only, enforced by workspace boundary |

---

## 8. Integration Connectors

Each connector is a typed class following Cursive's repository pattern. One file per integration in `lib/connectors/`.

### Connector Interface

```typescript
interface AMConnector {
  name: string;
  authenticate(): Promise<void>;
  healthCheck(): Promise<{ status: 'ok' | 'degraded' | 'down'; latencyMs: number }>;
  pullMetrics(): Promise<ConnectorMetrics>;
}
```

### Vercel Connector (Priority 1)
- **API**: Vercel REST API v9
- **Pulls**: Project list, deployment status/history, function usage, bandwidth, build times, domain list, costs per project
- **Frequency**: Deploy status on webhook push, costs nightly via Inngest cron
- **Auth**: Vercel API token (stored in Doppler)
- **MCP**: Vercel MCP already connected at AM Collective level

### Stripe Connector (Priority 1)
- **API**: Stripe API
- **Pulls**: MRR across all projects, invoice status, customer list, subscription changes, payment events
- **Frequency**: Hourly via Inngest cron + real-time via webhooks
- **Auth**: Stripe secret key per account (stored in Doppler)
- **Note**: Multi-key support needed (TBGC Stripe, Cursive Stripe, Trackr Stripe, etc.)

### Neon Connector (Priority 2)
- **API**: Neon API
- **Pulls**: Database health, storage usage, compute hours, active connections per project
- **Frequency**: Nightly
- **Auth**: Neon API key

### Clerk Connector (Priority 2)
- **API**: Clerk Backend API
- **Pulls**: User counts per project, new signups, active sessions
- **Frequency**: Daily
- **Auth**: Clerk secret key per project

### PostHog Connector (Priority 2)
- **API**: PostHog API
- **Pulls**: DAU/WAU/MAU per project, key event counts, feature flag usage
- **Frequency**: Daily
- **Auth**: PostHog personal API key

### Linear Connector (Priority 3)
- **API**: Linear GraphQL API
- **Pulls**: Open tickets/tasks per project, sprint progress, team velocity
- **Frequency**: Real-time via webhooks
- **Auth**: Linear API key

### Resend Connector (Priority 3)
- **API**: Resend API
- **Pulls**: Email send volume, delivery rates, bounce rates per domain
- **Frequency**: Daily
- **Auth**: Resend API key (already configured)

---

## 9. AI Agent Architecture

### Principle: Specialized agents with clear triggers. Not generic "AI" -- purpose-built workers.

### Agent 1: Morning Briefing
- **Trigger**: Inngest cron at 7:00 AM PT daily
- **Pulls**: Stripe MRR delta (24hr), Vercel build status (all projects), Clerk new signups, open tasks (overdue), alerts (unresolved)
- **Output**: Slack DM to Adam + dashboard widget on CEO view
- **Model**: Claude Haiku (fast, cheap, structured output)

### Agent 2: Client Health Scorer
- **Trigger**: After invoice created, after project milestone, after 7 days of no communication
- **Pulls**: Last communication date, invoice payment history, task completion rate, NPS (if tracked)
- **Output**: Health score (0-100) on Client record, alert if score drops below 60
- **Model**: Claude Haiku

### Agent 3: Research Agent (from Trackr)
- **Trigger**: Manual or when new tool/vendor added
- **Pulls**: Firecrawl scrape + Tavily search + Claude Sonnet analysis
- **Output**: Research report stored in DB, embedded in pgvector for RAG
- **Model**: Claude Sonnet

### Agent 4: Cost Analysis
- **Trigger**: Inngest cron weekly (Sunday 8 PM PT)
- **Pulls**: All connector cost data (Vercel, Stripe fees, Neon usage, API token spend per key)
- **Output**: Cost attribution report by project, anomaly alerts (>20% spike), gross margin per client
- **Model**: Claude Sonnet

### Agent 5: Internal RAG Chatbot (the "AM Agent")
- **Trigger**: User sends message in /ai chat
- **Data source**: pgvector embeddings of SOPs, client notes, project docs, meeting summaries, invoices, Rocks, EODs
- **Architecture**: Copy Cursive's AskYourDataSlideOver. Claude Sonnet with tool use (can query DB, pull connector data, search embeddings)
- **Embedding pipeline**: Inngest nightly job embeds new/updated records into pgvector
- **Model**: Claude Sonnet (with tool use)

### Agent 6: Daily Client Reporter
- **Trigger**: Inngest cron at 5 PM PT daily (configurable per client)
- **Pulls**: TaskSpace EOD data, deployment activity, task completions
- **Output**: Auto-generated client-facing status email via Resend
- **Model**: Claude Haiku

---

## 10. Build Sequence (Phased)

### Phase 0: Infrastructure Setup (Session 1, ~30 min)

```bash
# 1. Create new GitHub repo
gh repo create am-collective/am-collective-portal --private

# 2. Clone Wholesail as base
cp -r /Users/adamwolfe/portal-intake /Users/adamwolfe/am-collective-portal
cd /Users/adamwolfe/am-collective-portal

# 3. Reset git
rm -rf .git
git init
git remote add origin git@github.com:am-collective/am-collective-portal.git

# 4. Create Neon database
# Via Neon dashboard: project "amcollective-prod", database "amcollective"
# Enable pgvector extension

# 5. Set up Doppler
doppler setup --project am-collective --config dev

# 6. Set up Vercel project
vercel link  # Connect to AM Collective team workspace

# 7. Install additional dependencies
pnpm add @clerk/nextjs @sentry/nextjs posthog-js posthog-node @arcjet/next
pnpm add @upstash/ratelimit @upstash/redis inngest drizzle-orm drizzle-kit
pnpm add @anthropic-ai/sdk ai pgvector
pnpm add -D @types/node typescript

# 8. Configure integrations on Vercel dashboard:
# - Sentry (add from marketplace)
# - Axiom (add from marketplace)
# - PostHog (connect existing)
# - CodeRabbit (on GitHub repo)

# 9. Initial commit
git add .
git commit -m "feat: initial scaffold from Wholesail template"
git push -u origin main
```

### Phase 1: Foundation (Session 2, ~2-3 hours)

**Goal**: Auth working, DB schema deployed, admin shell rendering, deploy to Vercel

1. Strip all wholesale-specific code (pricing tiers, loyalty, smart-reorder, SMS ordering, product catalog, distributor flows)
2. Write Drizzle schema (all models from Section 5)
3. Run `drizzle-kit generate` and `drizzle-kit push`
4. Configure Clerk (org, roles, middleware)
5. Configure ArcJet on middleware
6. Configure Sentry DSN
7. Build admin layout shell (sidebar with all nav items, placeholder pages)
8. Deploy skeleton to Vercel
9. Verify: login works, admin shell renders, DB connected, Sentry captures test error

### Phase 2: Core CRM (Session 3, ~3-4 hours)

**Goal**: Clients, projects, team, invoices all CRUD-functional

1. `/admin/clients` - Client list, create, edit, detail view (adapt Cursive CRM)
2. `/admin/projects` - Portfolio project list with cards, health scores (placeholder), create/edit
3. `/admin/team` - Team roster, create/invite members, assign to projects
4. `/admin/invoices` - Invoice list, create, PDF generation, Stripe payment link
5. `/admin/services` - Service catalog CRUD
6. Client portal: `/client/[slug]/dashboard`, `/invoices`, `/projects`
7. All API routes with withAdmin/withMember/withClient guards
8. Audit logging on all write operations

### Phase 3: Connectors & Dashboard (Session 4, ~3-4 hours)

**Goal**: CEO dashboard with live data from all portfolio projects

1. Build Vercel connector (project list, deploy status, costs)
2. Build Stripe connector (MRR, invoices across accounts)
3. Build `/admin/dashboard` CEO view:
   - Total MRR across all Stripe accounts
   - Active projects with deploy status indicators
   - Open invoices (amount outstanding)
   - Team utilization (assigned hours vs capacity)
   - Recent alerts
   - Quick actions (create invoice, add client, deploy project)
4. Build `/admin/costs` page:
   - Vercel spend per project (the unfair advantage)
   - API token cost per project per provider
   - Gross margin per client (revenue - costs)
5. Build `/admin/projects/[id]` detail page with connector data
6. Set up Inngest: nightly Vercel cost sync, hourly Stripe MRR sync

### Phase 4: Messaging & Reports (Session 5, ~2-3 hours)

**Goal**: Unified inbox, EOD reports, client-facing status updates

1. `/admin/messages` - Unified inbox (Bloo.io integration from Wholesail)
2. Email aggregation pattern (pull from Resend for all domains)
3. EOD report submission (from TaskSpace pattern)
4. Auto-generated client status emails (Inngest + Resend + Haiku)
5. `/client/[slug]/reports` - Client sees their status updates
6. `/client/[slug]/messages` - Client-AM communication thread

### Phase 5: EOS / Internal Ops (Session 6, ~2 hours)

**Goal**: Run AM Collective on EOS inside the platform

1. `/admin/rocks` - Quarterly OKRs (from TaskSpace)
2. `/admin/scorecard` - Weekly metrics tracking
3. `/admin/meetings` - L10 meeting notes
4. `/admin/activity` - Cross-project audit log timeline

### Phase 6: AI Agent Layer (Session 7, ~3-4 hours)

**Goal**: Internal AI chatbot + automated agents

1. Set up pgvector embedding pipeline (Inngest nightly job)
2. Build RAG query handler (`lib/ai/rag.ts`)
3. `/admin/ai` - Chat interface with Claude Sonnet + tool use
4. Morning Briefing agent (Inngest cron, Slack webhook)
5. Client Health agent (trigger on invoice/milestone events)
6. Cost Analysis agent (weekly cron)
7. Research agent (manual trigger from UI)

### Phase 7: Domain Management & Advanced (Session 8+)

1. `/admin/domains` - Pull from Vercel API, DNS record viewing
2. Alert system (webhook-triggered from Sentry, Vercel, Stripe)
3. PostHog connector + analytics roll-up
4. Linear connector + task sync
5. Neon/Clerk connectors
6. Feature flag system per client portal (from TaskSpace)

---

## 11. Claude Code Session Prompt

Copy this EXACTLY into your Claude Code terminal to start the build:

```
You are building the AM Collective Master Dashboard -- an internal multi-tenant agency CRM with CEO dashboard, client portals, team management, financial tracking, and AI-powered operations intelligence.

CRITICAL CONTEXT:
- Base template: Clone from /Users/adamwolfe/portal-intake (Wholesail). This is the TBGC-synced wholesale portal template with 460 files, 146 routes, admin+client portals, Stripe, invoices, messaging, PDF generation, and full shadcn/ui component library.
- DO NOT start from scratch. Clone the template, then strip wholesale-specific logic.
- Design language: Trackr's Offset Brutalist UI (distinctive, clean, professional).

WHAT TO STRIP from the Wholesail template:
- lib/pricing.ts, lib/loyalty.ts, lib/smart-reorder.ts, lib/sms-ordering.ts
- All product catalog / wholesale application flow
- Food-specific AI order parser logic
- Drops/flash-sale features
- Distributor-facing application flow

WHAT TO KEEP:
- All shadcn/ui components, data tables, stat cards, modals, forms
- Admin dashboard layout (sidebar, nav, breadcrumbs, responsive shell)
- lib/auth/ (Clerk RBAC helpers)
- lib/stripe/ (Stripe service, billing portal, invoice generation)
- lib/email/ (Resend templates)
- lib/pdf/ (Invoice PDF generation)
- lib/rate-limit.ts (Upstash)
- middleware.ts (route protection)
- lib/integrations/blooio.ts (messaging pattern)
- app/(admin)/ (entire admin shell)

STACK:
- Next.js 15+ App Router
- Clerk auth (owner/admin/member/client roles)
- Neon PostgreSQL + pgvector
- Drizzle ORM
- Resend email
- Stripe payments
- PostHog analytics
- Sentry error tracking
- ArcJet security
- Upstash Redis rate limiting
- Inngest background jobs
- Claude SDK (AI agents)
- Doppler secrets management

DATA MODEL (15 core tables):
PortfolioProject, Client, ClientProject, Engagement, Invoice, Service, TeamMember, TeamAssignment, ToolAccount, ToolCost, APIUsage, Task, Message, AIConversation, AIMessage, AuditLog, WebhookRegistration, Alert, Domain, Embedding (pgvector)

BUILD PHASE 1 GOAL:
1. Strip wholesale code from cloned template
2. Write Drizzle schema for all models above
3. Configure Clerk (org: AM Collective, roles: owner/admin/member/client)
4. Configure ArcJet + Sentry + PostHog
5. Build admin layout shell with all navigation items
6. Deploy skeleton to Vercel
7. Verify: auth works, DB connected, admin shell renders

IMPORTANT RULES:
- Configure Sentry BEFORE first deployment. Do not fly blind.
- Every API route must have withAdmin/withMember/withClient middleware.
- Every write operation must create an AuditLog entry.
- Use Drizzle, not Prisma (portfolio is transitioning to Drizzle).
- Use after() for expensive operations (PostHog captures, webhook sends).
- MCP integrations are READ layer only. Use native webhooks for writes.
- Token efficiency: clone and adapt, don't regenerate existing UI components.

START: Set up the new GitHub repo, clone the template, strip wholesale code, write the schema, configure auth and security, build the admin shell, and deploy.
```

---

## 12. MCP & Environment Setup

### MCPs Already Connected (at AM Collective Vercel level)

| MCP | Purpose |
|---|---|
| Sorcery | Code generation assistance |
| Stripe | Payment processing |
| Kernel | AI infrastructure |
| Autonomo | Automation |
| Cubic | Analytics |
| Resend | Email |
| Clerk | Auth |
| PostHog | Product analytics |
| Upstash Redis | Rate limiting + caching |
| Neon | Database |
| Supabase | (Cursive only, not for this project) |
| Slack | Team communication |
| Claude SDK | AI agents |
| Vercel | Hosting + deployment |

### Environment Variables (Doppler Project: `am-collective`)

```env
# Clerk
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=
CLERK_SECRET_KEY=
NEXT_PUBLIC_CLERK_SIGN_IN_URL=/sign-in
NEXT_PUBLIC_CLERK_SIGN_UP_URL=/sign-up

# Neon
DATABASE_URL=
DIRECT_DATABASE_URL=

# Stripe
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=

# Resend
RESEND_API_KEY=

# PostHog
NEXT_PUBLIC_POSTHOG_KEY=
NEXT_PUBLIC_POSTHOG_HOST=

# Sentry
SENTRY_DSN=
SENTRY_AUTH_TOKEN=

# ArcJet
ARCJET_KEY=

# Upstash
UPSTASH_REDIS_REST_URL=
UPSTASH_REDIS_REST_TOKEN=

# Inngest
INNGEST_EVENT_KEY=
INNGEST_SIGNING_KEY=

# Claude
ANTHROPIC_API_KEY=

# Vercel API (for connector)
VERCEL_API_TOKEN=
VERCEL_TEAM_ID=

# Firecrawl (for research agent)
FIRECRAWL_API_KEY=

# Tavily (for research agent)
TAVILY_API_KEY=

# Bloo.io
BLOOIO_API_KEY=

# App
NEXT_PUBLIC_APP_URL=https://portal.amcollectivecapital.com
```

---

## 13. What NOT to Build (Scope Control)

These are explicitly OUT OF SCOPE for the initial build. They are real features but belong in Phase 5+.

| Feature | Why Not Now |
|---|---|
| Voice messages to WhatsApp > OpenClaw > Linear | Separate automation project. Don't conflate with portal or it never ships. |
| Mercury banking integration | Mercury doesn't have a reliable public API. Stub it, build later. |
| Mac Mini + OpenClaw orchestration | Phase 5+. Build the dashboard first. Voice is a pipeline; each piece must work independently. |
| SSO / SAML | Clerk handles this but it's enterprise complexity. Add when you have enterprise clients. |
| DNS record EDITING (not viewing) | Viewing is Phase 7. Editing DNS programmatically is risky. Start read-only. |
| Multi-org hierarchy (TaskSpace pattern) | Start with single org (AM Collective). Add sub-orgs in Phase 3+ if needed. |
| Custom email sequences | Copy from Cursive but implement in Phase 5+. Get manual emails working first. |
| Real-time websockets | Use React Query polling initially. Websockets in Phase 6+ when you have the data volume to justify it. |
| Mobile app | The web app will be responsive. Native mobile is a separate project. |

---

## 14. Success Criteria

### Phase 1 Complete When:
- [ ] New GitHub repo created and connected to Vercel
- [ ] Clerk auth working with owner/admin/member/client roles
- [ ] Drizzle schema deployed to Neon with all 15+ models
- [ ] Admin shell renders with all navigation items
- [ ] ArcJet, Sentry, PostHog all capturing data
- [ ] Deployed to Vercel at portal.amcollectivecapital.com

### Phase 3 Complete When (MVP):
- [ ] Can create clients, projects, team members, invoices
- [ ] CEO dashboard shows live Vercel deploy status for all projects
- [ ] CEO dashboard shows aggregated Stripe MRR
- [ ] Cost page shows Vercel spend per project
- [ ] Gross margin visible per client (revenue from invoices - costs from Vercel/API)
- [ ] Client can log in and see their project status + invoices

### Phase 6 Complete When (Full Platform):
- [ ] AI chatbot answers questions from embedded company data
- [ ] Morning briefing arrives in Slack at 7am daily
- [ ] Client health scores auto-calculated and alerting
- [ ] Weekly cost report generated and reviewed
- [ ] All 6 portfolio projects pushing webhook events to AM Collective

### The North Star Metric:
**Can Adam wake up, open one URL, and know exactly how every company, client, project, and dollar is performing -- without opening any other tool?**

When the answer is yes, the platform is working.

---

## Appendix: Token Budget Strategy

Building this in one shot with Opus 4.6 will burn significant credits. The right approach:

1. **Use Opus for**: Architecture decisions, agent prompt design, complex business logic, schema design, this PRD synthesis
2. **Use Sonnet for**: Implementation, UI components, API routes, connector code, CRUD operations
3. **Build order**: Scaffold entire project structure first (routes, schema, empty components), commit, then fill in one section at a time
4. **Don't generate what you already own**: Clone Wholesail's UI components. Don't regenerate 57 shadcn components from scratch.
5. **Session strategy**: 3-4 focused Claude Code sessions, not one marathon. Commit after each phase.

---

*This document synthesizes strategic inputs from TaskSpace, Trackr, TBGC, Wholesail, and Cursive codebases. Every recommendation is grounded in patterns already proven across AM Collective's portfolio.*
