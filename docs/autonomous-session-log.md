# Autonomous Session Log — Phases 19-28

## Phase 19: PDF Invoice Generation + Client Portal Invoices
**Status**: COMPLETE

### What was built:
- **19A**: Updated `lib/pdf/invoice-pdf.tsx` -- AM Collective branding (was TBGC), clean Offset Brutalist PDF design, payment link section, tax support
- **19A**: Created `app/api/invoices/[id]/pdf/route.ts` -- PDF download endpoint, dual auth (admin OR client who owns the invoice)
- **19B**: Created `app/(client)/[slug]/invoices/[id]/page.tsx` -- Full client invoice detail page with Pay Now, Download PDF, line items table, notes
- **19B**: Updated `app/(client)/[slug]/invoices/page.tsx` -- Invoice numbers link to detail page, PDF download column added
- **19B**: Updated `app/(admin)/invoices/[id]/invoice-actions.tsx` -- Added Download PDF button (sent/paid/overdue)

### Validation:
- pnpm tsc --noEmit: 0 errors
- pnpm lint: 0 errors (26 pre-existing warnings)
- pnpm build: passes

---

## Phase 20: Linear MCP + Project Tracking in ClaudeBot
**Status**: COMPLETE

### What was built:
- Installed `@linear/sdk`
- Created `lib/connectors/linear.ts` -- Full connector: getTeams, getIssues, getActiveCycle, getProjects, getMyIssues
- Created `lib/mcp/linear/index.ts` -- 5 Anthropic SDK tool definitions + executor
- Updated `lib/ai/tools.ts` and `lib/ai/tools-sdk.ts` -- Registered Linear tools
- Updated integrations page, connectors index, .env.example

### Validation:
- pnpm tsc --noEmit: 0 errors
- pnpm lint: 0 errors
- pnpm build: passes

---

## Phase 21: Weekly Report + Invoice Reminders + Churn Tracking
**Status**: COMPLETE

### What was built:
- **21A**: Fixed churn tracking in `app/api/finance/summary/route.ts` -- Added `getChurnedThisMonth()` querying cancelled subscriptions
- **21B**: Added `lastReminderAt` column to `lib/db/schema/billing.ts` invoices table
- **21B**: Created `lib/inngest/jobs/invoice-reminders.ts` -- Daily cron (5 PM UTC), finds due-soon (3 days) and overdue invoices, sends email reminders via Resend, updates lastReminderAt, creates audit logs
- **21C**: Created `lib/inngest/jobs/weekly-report.ts` -- Sunday cron (10 PM UTC), WoW comparison of MRR/cash/clients, sends Slack message
- **21D**: Registered both new jobs in barrel export and Inngest serve route (now 16 total)

### Schema changes:
- `invoices.lastReminderAt` (timestamp) -- needs `pnpm drizzle-kit push`

### Validation:
- pnpm tsc --noEmit: 0 errors
- pnpm lint: 0 errors
- pnpm build: passes

---

## Phase 22: Notification Center
**Status**: COMPLETE

### What was built:
- **22A**: Added `notificationTypeEnum` and `notifications` table to `lib/db/schema/system.ts` -- user-facing in-app notifications with type, title, message, link, isRead, metadata
- **22B**: Created `lib/db/repositories/notifications.ts` -- Full CRUD: createNotification, createNotificationForAdmins, getNotifications, getUnreadCount, markAsRead, markAllAsRead, deleteNotification, notifyAdmins
- **22C**: Created API routes:
  - `app/api/notifications/route.ts` -- GET list with unread count
  - `app/api/notifications/[id]/route.ts` -- PATCH (mark read), DELETE
  - `app/api/notifications/read-all/route.ts` -- PATCH (mark all read)
- **22D**: Created `components/notification-bell.tsx` -- Dropdown bell with 30s polling, unread badge, mark read/all/delete, click-to-navigate
- **22D**: Integrated notification bell into admin header (`admin-shell.tsx`)
- **22E**: Wired `notifyAdmins()` into Inngest jobs: check-overdue-invoices, weekly-report, invoice-reminders

### Schema changes:
- `notifications` table (9 columns, 5 indexes) -- needs `pnpm drizzle-kit push`

### Validation:
- pnpm tsc --noEmit: 0 errors
- pnpm lint: 0 errors
- pnpm build: passes

---

## Phase 23: Search Upgrade (pg_trgm + semantic)
**Status**: COMPLETE

### What was built:
- **23A**: Created `lib/db/setup-extensions.ts` -- Enables pg_trgm extension (run once)
- **23B**: Rewrote `app/api/search/route.ts` -- Upgraded from simple ilike to trigram similarity scoring with graceful fallback
  - Added invoice search (by number or client name)
  - Added semantic search via pgvector (optional, when `?semantic=true`)
  - Results sorted by similarity score
  - Auto-detects pg_trgm availability (cached)
- **23C**: Updated `components/command-palette.tsx` -- Added Receipt (invoices) and Sparkles (semantic) icons to type mapping

### Env requirements:
- pg_trgm extension must be enabled: `CREATE EXTENSION IF NOT EXISTS pg_trgm`
- OPENAI_API_KEY for semantic search (optional)

### Validation:
- pnpm tsc --noEmit: 0 errors
- pnpm lint: 0 errors
- pnpm build: passes

---

## Phase 24: Multi-Admin Access
**Status**: COMPLETE

### What was built:
- **24A**: Updated `lib/auth/require-admin.ts` -- SUPER_ADMIN_EMAILS now configurable via env var (comma-separated), defaults include adamwolfe102@gmail.com + maggie@amcollectivecapital.com
- **24B**: Updated `app/(admin)/team/page.tsx` -- Added Platform Admins panel showing all configured admin emails
- **24C**: Updated `.env.example` -- Added SUPER_ADMIN_USER_IDS and SUPER_ADMIN_EMAILS entries

### Validation:
- pnpm tsc --noEmit: 0 errors
- pnpm lint: 0 errors
- pnpm build: passes

---

## Phase 25: Scorecard Builder
**Status**: COMPLETE

### What was built:
- **25A**: Created `app/(admin)/scorecard/add-metric-dialog.tsx` -- Full form for creating new scorecard metrics (name, owner, target, direction, unit, display order)
- **25B**: Created `app/(admin)/scorecard/scorecard-cell.tsx` -- Inline editable cells: click to edit, Enter to save, Escape to cancel, auto-focus
- **25C**: Rewrote `app/(admin)/scorecard/page.tsx` -- Integrated Add Metric dialog + inline cell editing, fetches team members for owner dropdown

### Validation:
- pnpm tsc --noEmit: 0 errors
- pnpm lint: 0 errors
- pnpm build: passes

---

## Phase 26: Mobile Responsiveness Pass
**Status**: COMPLETE

### What was built:
- Dashboard metric cards: 2-col grid on mobile, 1-col on desktop (`grid-cols-2 lg:grid-cols-1`)
- Notification bell dropdown: Responsive width (`w-[calc(100vw-2rem)] sm:w-80`)
- Admin shell: Larger touch targets on mobile nav items (`py-3 md:py-2.5`), safe area padding (`pb-safe`)
- Tables: Added `overflow-x-auto` to all table containers across:
  - invoices/page.tsx, invoices/[id]/page.tsx
  - clients/page.tsx
  - team/page.tsx, team/[id]/page.tsx
  - services/page.tsx

### Validation:
- pnpm tsc --noEmit: 0 errors
- pnpm lint: 0 errors
- pnpm build: passes

---

## Phase 27: Platform Polish + Settings Cleanup
**Status**: COMPLETE

### What was built:
- **27A**: Fixed FROM_EMAIL default in `lib/email/index.ts` -- Changed from `orders@truffleboys.com` to `team@amcollectivecapital.com` (2 instances)
- **27B**: Cleaned up unused `sql` import from `lib/inngest/jobs/invoice-reminders.ts`
- **Audit results**: No emojis found, no stale TODOs/FIXMEs, 404 page and settings page are clean, all TBGC/Wholesail references are intentional portfolio company references

### Validation:
- pnpm tsc --noEmit: 0 errors
- pnpm lint: 0 errors (26 warnings, down from 27)
- pnpm build: passes

---

## Phase 28: ClaudeBot Improvements + Context Depth
**Status**: COMPLETE

### What was built:
- **28A**: Enriched system prompt in `app/api/ai/chat/route.ts` -- Added portfolio descriptions, full capability list, 11 rules including today's date injection, financial health guidance
- **28B**: Created `app/api/ai/conversations/[id]/export/route.ts` -- Markdown export of conversations with title, date, model, all messages, tool call annotations
- **28C**: Updated `app/(admin)/ai/page.tsx` -- Added Export button (Download icon) in chat header, shows when conversation is active
- **28D**: Added `get_scorecard` tool to both `lib/ai/tools-sdk.ts` (Vercel AI SDK) and `lib/ai/tools.ts` (Anthropic SDK) -- Returns metrics with targets, owners, and weekly values

### Validation:
- pnpm tsc --noEmit: 0 errors
- pnpm lint: 0 errors (26 pre-existing warnings)
- pnpm build: passes

---

## Final Summary

### All 10 phases complete (19-28)

### New files created (this session):
- `lib/inngest/jobs/invoice-reminders.ts`
- `lib/inngest/jobs/weekly-report.ts`
- `lib/db/repositories/notifications.ts`
- `lib/db/setup-extensions.ts`
- `app/api/notifications/route.ts`
- `app/api/notifications/[id]/route.ts`
- `app/api/notifications/read-all/route.ts`
- `app/api/ai/conversations/[id]/export/route.ts`
- `components/notification-bell.tsx`
- `app/(admin)/scorecard/add-metric-dialog.tsx`
- `app/(admin)/scorecard/scorecard-cell.tsx`

### Schema changes requiring push:
- `notifications` table (system.ts) -- `pnpm drizzle-kit push`
- `notificationTypeEnum` enum (system.ts)
- `invoices.lastReminderAt` column (billing.ts)

### Env vars added:
- `SUPER_ADMIN_USER_IDS` -- Comma-separated Clerk user IDs for admin access
- `SUPER_ADMIN_EMAILS` -- Comma-separated emails for owner role

### Inngest jobs (now 16 total):
syncVercelCosts, syncStripeMrr, syncNeonUsage, sendClientReports, embedDocuments, morningBriefing, clientHealthCheck, weeklyCostAnalysis, syncStripeFull, checkOverdueInvoices, syncVercelFull, syncPosthogAnalytics, syncMercury, snapshotDailyMetrics, **invoiceReminders**, **weeklyReport**

### AI tools (now includes):
- Core: search_clients, get_client_detail, get_portfolio_overview, get_revenue_data, get_deploy_status, get_rocks, get_alerts, get_costs, search_knowledge, get_invoices, **get_scorecard**
- External: 5 Vercel + 5 PostHog + 5 Mercury + 5 Linear tools
