# Codebase Cleanup Report
**Date:** 2026-03-19
**Project:** AM Collective Admin Portal
**Branch:** cleanup/2026-03-19

## Impact Summary

| Metric | Before | After | Reduction |
|--------|--------|-------|-----------|
| Total Files | 774 | 770 | 4 (0.5%) |
| Lines of Code | 101,409 | 100,744 | 665 (0.7%) |
| Dependencies | 75 | 68 | 7 (9.3%) |
| DevDependencies | 16 | 15 | 1 (6.3%) |
| Lint Errors | 0 | 0 | 0 |
| Lint Warnings | 4 | 4 | 0 |

## Files Removed (4)
1. `components/loading-skeleton.tsx` -- orphaned component, zero imports (replaced by dashboard skeletons)
2. `components/ui/form.tsx` -- shadcn Form component, zero imports (forms use native state, not react-hook-form)
3. `lib/rate-limit.ts` -- unused rate-limit module, zero imports (ArcJet handles rate limiting via middleware)
4. `lib/jobs/compute-product-velocity.ts` -- standalone script, never called from any job or API route

## Empty Directories Removed (3)
1. `app/api/proposals/[id]/approve/` -- empty, no route file
2. `app/(admin)/sprints/new/` -- empty, no page file
3. `lib/jobs/` -- empty after file deletion

## Dependencies Removed (8)
1. `@react-email/components` -- zero imports; email templates use Resend directly
2. `@stripe/stripe-js` -- zero imports; no client-side Stripe.js usage
3. `@vercel/analytics` -- zero imports; PostHog provides analytics
4. `framer-motion` -- zero imports; no animations use this library
5. `next-themes` -- only used in sonner.tsx for theme detection; hardcoded to "light" since dark mode is forbidden
6. `@hookform/resolvers` -- zero imports; no form validation uses zodResolver
7. `react-hook-form` -- only imported in form.tsx which was itself unused
8. `tw-animate-css` (dev) -- zero references; Tailwind v4 has native animation support

## Dead CSS Removed
- 8 unused utility classes: `.animate-marquee`, `.animate-marquee-reverse`, `.animate-ticker`, `.animate-loading-bar`, `.btn-blue`, `.link-body`, `.btn-outline`, `.btn-outline-white`
- 4 associated `@keyframes` blocks: `marquee`, `marquee-reverse`, `ticker`, `loading-bar`
- 7 unused CSS variables: `--bg-blue`, `--bg-blue-dark`, `--text-on-blue`, `--blue-light`, `--blue-border`, `--black` (standalone, `--cream` already covers it)

## Dead Code Removed
- 9 unused exports from `lib/ui/status-colors.ts`: `taskStatusCategory`, `productStatusCategory`, `subscriptionStatusCategory`, `scorecardGoalCategory`, `webhookStatusCategory`, `sprintStatusCategory`, `engagementStatusCategory`, `alertSeverityCategory`, `getStatusText`
- 1 unnecessary export keyword on `productLogos` in `lib/ui/product-logos.ts` (only used internally by `getProductLogo`)
- `next-themes` import removed from `components/ui/sonner.tsx`, replaced with hardcoded `theme="light"`

## What Was Intentionally Kept
- `@composio/core` -- appeared low-usage but is actively used across Gmail integration, webhooks, Inngest jobs, AI tools
- `postgres` -- appeared unused but the Cursive connector uses it for direct DB access via dynamic import
- `@tailwindcss/typography` (dev) -- prose classes actively used in `components/ai-chat.tsx`
- `_cleanupInterval` in `lib/cache.ts` -- properly `.unref()`'d interval for memory cache cleanup
- 394 `console.error` statements -- structured error logging with context tags, not debug output
- 5 `eslint-disable` comments -- all justified (PDF `any` type, img element, intentional hook deps)
- All Inngest jobs and AI tools -- appear orphaned at import level but are registered via index.ts barrel exports
