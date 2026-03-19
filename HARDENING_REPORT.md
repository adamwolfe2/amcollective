# Code Hardening Report
**Date:** 2026-03-19
**Project:** AM Collective Admin Portal
**Baseline:** 0 TS errors, 0 lint errors (2 pre-existing warnings), clean build, no tests

## Summary
- **Files Modified:** 51
- **Files Created:** 0
- **Files Deleted:** 0
- **Lint Errors Fixed:** 0 (was already 0)
- **New Lint Errors:** 0
- **Build Status:** Clean

## Changes by Phase

### Phase 1: Critical Fixes — Console Cleanup, Null Safety, Error Handling

**console.error to captureError (2 files):**
- `app/api/invoices/[id]/preview/route.ts` — replaced console.error with captureError
- `app/api/documents/route.ts` — replaced console.error with captureError

**console.warn/log cleanup (9 files):**
- `app/api/bot/sms/route.ts` — console.warn to captureError (warning level)
- `app/api/bot/slack/route.ts` — console.warn to captureError (warning level)
- `app/api/bot/claw/route.ts` — console.warn to comment (already returns early)
- `app/api/documents/[id]/route.ts` — console.warn to captureError + removed duplicate import
- `app/api/webhooks/emailbison/route.ts` — console.warn to captureError (warning/info)
- `app/api/webhooks/stripe/route.ts` — console.warn to comment (already returns early)
- `lib/ai/embeddings.ts` — console.warn to comment (already returns null)
- `lib/email/client-status.ts` — console.warn to comment (already returns null)
- `lib/db/setup-extensions.ts` — console.warn to comment (setup script)

**Null safety (2 files):**
- `app/api/dashboard/snapshot/route.ts` — added `?? []` guard on mercuryAccounts before .reduce()
- `app/api/voice/briefing/route.ts` — added `?? []` guard on mercuryAccounts before .reduce()

**Empty catch documentation (2 files):**
- `app/(admin)/admin-shell.tsx` — documented 2 empty catches (localStorage SSR)
- `app/(admin)/settings/nav-settings.tsx` — documented 1 empty catch (localStorage SSR)

### Phase 2: Code Cleanliness

No additional changes needed. The codebase has:
- 0 `any` types
- 0 TODO/FIXME/HACK comments
- 0 console.log/warn in app code (only in seed.ts and CLI scripts)
- Strict TypeScript enabled

### Phase 3: UI/UX Polish

**Page metadata (34 files):**
- Added `export const metadata: Metadata` with page titles to all admin pages missing them
- Pattern: `"Page Name | AM Collective"`
- Skipped: strategy (already had metadata), clients/[id] pages (need generateMetadata)

**Browser confirm() to AlertDialog (2 files):**
- `app/(admin)/leads/lead-actions.tsx` — replaced 2 confirm() calls with AlertDialog components for convert-to-client and archive actions
- `app/(admin)/sprints/sprint-delete-button.tsx` — replaced 1 confirm() call with AlertDialog for delete action

**Accessibility (2 files):**
- `app/(admin)/leads/lead-actions.tsx` — added aria-labels to 3 icon-only buttons
- `app/(admin)/sprints/sprint-delete-button.tsx` — added aria-label to delete button

**Loading states (1 file):**
- `app/(admin)/leads/lead-actions.tsx` — added loading text and disabled state to convert/archive dialog buttons

### Phase 4: Performance

No changes made. Architecture is already well-optimized:
- Connector caching via Upstash Redis with TTL tiers
- unstable_cache on dashboard queries
- Inngest for background processing
- No N+1 query patterns found

### Phase 5: Developer Experience

No changes made. Existing tooling is solid:
- All npm scripts present (dev, build, lint, db:*)
- Sentry configured for error tracking
- ESLint configured
- Strict TypeScript

### Phase 6: Feature Enhancements

Skipped. Dark mode toggle is forbidden by project rules. Other feature additions are out of scope for internal tool hardening.

### Phase 7: Security

No changes made. Security posture is already strong:
- Clerk auth on all protected routes
- ArcJet rate limiting + bot detection
- CSP headers configured
- Vault encryption for credentials
- Zero `any` types (full type safety)
- Webhook signature verification on handlers

## Known Issues Not Addressed

| Item | Why Skipped |
|------|-------------|
| 53 generic "Internal server error" responses | Most are admin-only sync endpoints; adding specific messages would expose internals |
| Zod on ~3 remaining unvalidated routes | Admin-only endpoints with no user-controlled body |
| `components/loading-skeleton.tsx` exports unused | Useful utility skeletons matching design system; keeping for future use |
| `lib/cache.ts` unused constants (CACHE_SHORT/MEDIUM/LONG/STATIC) | Harmless constants, may be used in future |
| Kanban fixed-width columns on mobile | Kanban boards are inherently desktop-first; would need full responsive redesign |
| generateMetadata for dynamic routes (clients/[id]) | Requires async data fetching pattern; separate task |

## Recommendations for Next Session

- **Tables need search/sort**: invoices, contracts, documents tables lack search and column sorting
- **Client portal metadata**: client-facing pages under app/(client)/ also need metadata exports
- **Webhook signature verification consolidation**: 5 webhook routes have similar verify functions that could be extracted to shared `lib/webhooks/verify.ts`
- **admin-shell.tsx decomposition**: At ~400 lines, could be split into SidebarNav + NavItem sub-components
- **E2E tests**: Playwright config exists but no test files; critical flows (auth, dashboard, invoices) should have basic smoke tests
