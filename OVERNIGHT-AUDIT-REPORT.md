# Overnight Audit Report

**Date:** 2026-03-18
**Branch:** `overnight-improvements-2026-03-18`
**Base commit:** `a3d1a3f` (feat: integrate MyVSL into AM Collective portfolio)

## Build Status

| Metric | Before | After |
|--------|--------|-------|
| TypeScript errors | 0 | 0 |
| ESLint errors | 0 | 0 |
| ESLint warnings | 2 (font) | 2 (font) |
| Lint warning (unused var) | 1 | 0 (fixed) |
| Build | Clean | Clean |

## Changes Summary

### Commits on branch (3 new)

1. **`76ca046` fix: add try/catch error handling to 14 API routes missing it**
   - Added error handling to 14 API routes that were missing try/catch
   - Routes: vault-seed, bot/claw/status, connectors/refresh, dashboard/priorities, documents, gmail (5 endpoints), invoices preview, outreach inbox, strategy recommendations, strategy/run-analysis

2. **`29aa6e8` fix: Zod validation on 6 PATCH routes + myvsl companyTag + code quality**
   - Added Zod input validation schemas to 6 PATCH routes: proposals, contracts, time entries, knowledge articles, webhooks, email drafts
   - Added `myvsl` to `companyTagEnum` in schema and all 13 Zod validation arrays across API routes
   - Added `myvsl` to finance transaction feed company tags
   - Fixed unused `getToolsMap` lint warning in ceo-agent.ts
   - Added TODO comments for untyped `any` casts in dashboard connectors
   - 55 files changed, 340 insertions, 138 deletions

3. **`51b5f0e` style: replace mountain hero with forest backdrop image**
   - Replaced mountain parallax hero image with misty forest backdrop per user request
   - Resized from 5472x3648 (3.4MB) to 2400px wide (957KB)
   - Removed `unoptimized` flag from Image component

### By Category

**Security (Zod Validation)**
- proposals/[id] PATCH — was spreading raw `body` into DB update
- contracts/[id] PATCH — was spreading raw `body` for status/title/sections/terms
- time/[id] PATCH — was spreading raw `body` for date/hours/billable fields
- knowledge/[id] PATCH — was spreading raw `body` for title/content/tags
- webhooks/[id] PATCH — was spreading raw `body` for endpointUrl/events
- email/drafts/[id] PATCH — was spreading raw `body` for to/subject/body

**Data Integrity**
- Added `myvsl` to companyTagEnum (schema + all 13 validation arrays)
- NOTE: Database migration NOT run (per safety rules). Run `npx drizzle-kit generate && npx drizzle-kit push` to apply.

**API Error Handling**
- 14 API routes now have proper try/catch with error logging

**UI**
- Forest backdrop image replaces mountain parallax hero
- No design system violations found (monochrome palette is consistent)
- No shadow/rounded/dark-mode/color violations in admin pages

## Verified Clean

- All 54 dynamic routes have `error.tsx` boundaries
- All 53 dynamic routes have `loading.tsx` skeletons
- No hardcoded secrets in source code
- No `dangerouslySetInnerHTML` XSS vectors (2 safe usages: JSON-LD + chart CSS)
- `.env.example` covers all `process.env.*` references (196 lines)
- 0 semantic color violations in admin pages or custom components

## TODOs / Not Fixed

1. **proposals/[id] admin detail page** — Could not create because `(public)/proposals/[id]` already exists at the same path. Would need to either move public proposal view to `/p/[id]` or use a different admin path like `/proposals/detail/[id]`.
2. **Database migration for myvsl enum** — Schema updated but migration not run (safety rule). Run manually.
3. **`as any` casts in dashboard/page.tsx** — 6 connector snapshot casts remain. Added TODO comments. Proper fix: define typed interfaces for each connector's response shape.
4. **Font warnings** — 2 ESLint warnings about custom fonts in layout.tsx. These are false positives for App Router (no pages/_document.js needed).

## Files Modified

55+ files across commits. Key areas:
- `app/api/` — 20+ route files (error handling + Zod validation)
- `lib/db/schema/costs.ts` — companyTagEnum
- `app/(admin)/finance/transaction-feed.tsx` — company tag array
- `components/ParallaxHero.tsx` — hero image swap
- `public/forest-backdrop.jpg` — new hero image (957KB)
