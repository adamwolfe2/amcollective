# AM Collective OS -- Activation Log

**Date**: 2026-02-27
**Session**: Platform Activation (connecting live integrations)

---

## Integration Status

| Integration | API Key Status | Test Result | Data in DB | Notes |
|---|---|---|---|---|
| **Stripe** | SET | OK | 2 clients, 2 invoices, 0 subs | Clean account, no customers yet |
| **Anthropic (Claude)** | SET | OK | N/A | Haiku responding, 6 tokens out |
| **Resend** | SET | PARTIAL | N/A | API key valid, `amcollectivecapital.com` not verified. Only `send.trytrackr.com` works |
| **Neon (DB)** | SET | OK | 25+ tables, data seeded | Vercel-managed, floral-flower-60494944 |
| **Clerk** | SET | OK (via app) | N/A | Dev instance, roles via publicMetadata |
| **PostHog (client)** | SET | OK (client-side) | N/A | Client keys set, personal API key missing |
| **Upstash Redis** | SET | Untested | N/A | Keys present, used for rate limiting |
| **Firecrawl** | SET | Untested | N/A | Used by research agent |
| **Tavily** | SET | Untested | N/A | Used by research agent |
| **Bloo.io** | SET | Untested | N/A | Used by TBGC messaging |
| **Vercel** | TEAM_ID set, TOKEN empty | BLOCKED | N/A | Need VERCEL_API_TOKEN for connector |
| **Sentry** | All 4 vars EMPTY | BLOCKED | N/A | Need DSN + auth token |
| **ArcJet** | EMPTY | BLOCKED | N/A | Need ARCJET_KEY |
| **Inngest** | Both EMPTY | BLOCKED | N/A | Need EVENT_KEY + SIGNING_KEY |
| **Mercury** | MISSING | BLOCKED | N/A | Need MERCURY_API_KEY |
| **Linear** | MISSING | BLOCKED | N/A | Need LINEAR_API_KEY |
| **PostHog (server)** | MISSING | BLOCKED | N/A | Need POSTHOG_PERSONAL_API_KEY + PROJECT_ID |
| **OpenAI (embeddings)** | MISSING | BLOCKED | N/A | Need OPENAI_API_KEY for pgvector |
| **Slack** | MISSING | BLOCKED | N/A | Need SLACK_WEBHOOK_URL |

## Code Changes

| File | Change | Why |
|---|---|---|
| `lib/stripe/sync.ts:558` | Guard changed from `isStripeConfigured()` to `!process.env.STRIPE_SECRET_KEY` | Webhook secret only needed for webhook handler, not API pulls |
| `lib/stripe/sync.ts:12` | Removed unused `isStripeConfigured` import | Lint cleanup |

## Data Seeded

| Table | Count | Source |
|---|---|---|
| `companies` | 9 | `scripts/seed-companies.ts` |
| `subscription_costs` | 17 | `scripts/seed-costs.ts` |
| `daily_metrics_snapshots` | 31 | `scripts/seed-snapshots.ts` (30 days backfill) |
| `clients` | 2 | Pre-existing |
| `invoices` | 2 | Pre-existing |
| `portfolio_projects` | 6 | Pre-existing |

## Scripts Created

| Script | Purpose | Usage |
|---|---|---|
| `scripts/test-stripe.ts` | Stripe connection test | `npx tsx --env-file=.env.local scripts/test-stripe.ts` |
| `scripts/test-anthropic.ts` | AI connection test | `npx tsx --env-file=.env.local scripts/test-anthropic.ts` |
| `scripts/test-resend.ts` | Email connection test | `npx tsx --env-file=.env.local scripts/test-resend.ts` |
| `scripts/run-stripe-sync.ts` | Full Stripe data sync | `npx tsx --env-file=.env.local scripts/run-stripe-sync.ts` |
| `scripts/seed-companies.ts` | Seed companies from enum | `npx tsx --env-file=.env.local scripts/seed-companies.ts` |
| `scripts/verify-dashboard.ts` | Dashboard health check | `npx tsx --env-file=.env.local scripts/verify-dashboard.ts` |

## Dashboard Baseline (2026-02-27)

```
Clients: 2
Subscriptions: 0
MRR: $0.00
Invoices: 2
Daily Snapshots: 31
Subscription Costs: 17
Companies: 9
Portfolio Projects: 6
```

## Next Steps

See `docs/missing-env-vars.md` for what Adam must provide to unlock remaining integrations.
See `docs/vercel-env-checklist.md` for production deployment env vars.
