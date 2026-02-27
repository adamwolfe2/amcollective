# Phase 15+16 Audit — Error Boundaries + Historical Snapshots

**Date**: 2026-02-26
**Auditor**: Claude Opus 4.6 (Phase 15+16 Step 0)

---

## Block 1: Error Boundaries + Loading States

### Current Coverage

| Route | error.tsx | loading.tsx |
|-------|-----------|-------------|
| dashboard | YES | YES |
| clients | NO | NO |
| clients/[id] | NO | NO |
| finance | NO | NO |
| invoices | NO | NO |
| projects | NO | NO |
| documents | NO | NO |
| ai | NO | NO |
| scorecard | NO | NO |

**Only 1 of 9 routes has error/loading boundaries.**

### Reference Pattern (dashboard)

**loading.tsx**: Pure divs with `animate-pulse`, `bg-[#0A0A0A]/5`, `border border-[#0A0A0A]/10`, `rounded-none`. 3-zone `lg:grid-cols-12` grid layout.

**error.tsx**: `"use client"`, centered `h-64` red box with `border-red-200 bg-red-50/50`, `font-mono` error text, underline "Retry" button calling `reset()`. **Missing**: `captureError` integration.

### Page Layout Structures (for skeleton design)

1. **clients**: Header + count badge, filter/search bar, full-width table (~5 cols)
2. **clients/[id]**: Back link, header + badges, separator, 6-tab Tabs component, content area
3. **finance**: Header + sync button, 4-col metric grid, 2-col chart panels, transaction table
4. **invoices**: Header + 3 action buttons, 5-col KPI grid, status filter, full-width table (~7 cols)
5. **projects**: Header + count badge + add button, full-width table (~7 cols)
6. **documents**: Header + count badge + upload button, 3-dropdown filter bar, full-width table (~6 cols)
7. **ai**: Client component — 2-panel layout (w-64 sidebar + flex-1 chat area)
8. **scorecard**: Header, horizontally scrollable matrix table (sticky left col, 15+ columns)

---

## Block 2: Historical Snapshots

### Existing Snapshot Tables

Found in `lib/db/schema/costs.ts`:
- `vercelProjectSnapshots` — Vercel project cost snapshots (per-project, daily)
- `posthogSnapshots` — PostHog analytics snapshots (per-project, daily)

**Missing**: No `dailyMetricsSnapshots` table for MRR, cash, client counts, etc.

### Dashboard Summary Route (`app/api/dashboard/summary/route.ts`)

Lines 235 and 239:
```
mrrChange: null,  // No historical MRR snapshot table yet
cashChange: null, // No historical Mercury balance snapshots yet
```

Both deltas are hardcoded to `null`. The snapshot table + Inngest job will unlock real calculations.

### Existing Inngest Jobs (14 total)

check-overdue-invoices, client-health-check, cost-analysis, embed-documents, morning-briefing, send-client-reports, sync-mercury, sync-neon-usage, sync-posthog-analytics, sync-stripe-full, sync-stripe-mrr, sync-vercel-costs, sync-vercel-full, weekly-cost-analysis

**No snapshot job exists.** Need: `snapshot-daily-metrics` (cron 0 4 * * *).

### Schema Needed

`dailyMetricsSnapshots` table:
- id (uuid PK)
- date (date, unique indexed)
- mrr (integer, cents)
- arr (integer, cents)
- totalCash (integer, cents)
- activeClients (integer)
- activeProjects (integer)
- activeSubscriptions (integer)
- overdueInvoices (integer)
- overdueAmount (integer, cents)
- metadata (jsonb, nullable)
- createdAt (timestamp)

---

## Build Sequence

1. ~~Audit (this document)~~
2. Build error.tsx for all 8 routes (+ fix dashboard error.tsx to add captureError)
3. Build loading.tsx for all 8 routes
4. Add `dailyMetricsSnapshots` schema to `lib/db/schema/metrics.ts`
5. Create Inngest job `snapshot-daily-metrics`
6. Create seed script to backfill ~30 days
7. Wire delta calculations into dashboard summary route
8. Add manual snapshot API endpoint
9. Type-check + lint + build
