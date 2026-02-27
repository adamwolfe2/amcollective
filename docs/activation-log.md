# AM Collective OS -- Activation Log

**Date**: 2026-02-27
**Session**: Full Platform Activation

---

## Integration Status (Final)

| Integration | API Key Status | Test Result | Data in DB | Notes |
|---|---|---|---|---|
| **Stripe** | SET (org live key) | NEEDS ACCOUNT CONTEXT | 2 clients, 2 invoices | `sk_org_live_` key requires Stripe-Context header -- need standard `sk_live_` key or account ID |
| **Stripe Webhook** | SET | Untested (needs deploy) | N/A | `whsec_` key added |
| **Anthropic (Claude)** | SET | OK | N/A | Haiku responding, CONNECTION_OK |
| **Resend** | SET (new key) | PARTIAL | N/A | 6 domains visible, `amcollectivecapital.com` status: `not_started` -- needs DNS records |
| **Mercury** | SET (new key) | OK | 2 accounts, 5 transactions | $20,745.18 checking, $0 savings |
| **OpenAI** | SET (new key) | OK | N/A | text-embedding-3-small, 1536 dims |
| **Neon (DB)** | SET | OK | 25+ tables, data seeded | Vercel-managed |
| **Clerk** | SET | OK (via app) | N/A | Dev instance |
| **PostHog (client)** | SET | OK (client-side) | N/A | Client keys only |
| **Upstash Redis** | SET | Untested | N/A | Rate limiting |
| **Firecrawl** | SET | Untested | N/A | Research agent |
| **Tavily** | SET | Untested | N/A | Research agent |
| **Bloo.io** | SET | Untested | N/A | TBGC messaging |
| **Vercel** | TEAM_ID set, TOKEN empty | BLOCKED | N/A | Need VERCEL_API_TOKEN |
| **Sentry** | All 5 vars EMPTY | BLOCKED | N/A | Need DSN + auth token |
| **ArcJet** | EMPTY | BLOCKED | N/A | Need ARCJET_KEY |
| **Inngest** | Both EMPTY | BLOCKED | N/A | Need EVENT_KEY + SIGNING_KEY |
| **Linear** | MISSING | BLOCKED | N/A | Need LINEAR_API_KEY |
| **PostHog (server)** | MISSING | BLOCKED | N/A | Need POSTHOG_PERSONAL_API_KEY |
| **Slack** | MISSING | BLOCKED | N/A | Need SLACK_WEBHOOK_URL |

## Code Changes

| File | Change | Why |
|---|---|---|
| `lib/stripe/sync.ts:558` | Guard changed from `isStripeConfigured()` to `!process.env.STRIPE_SECRET_KEY` | Webhook secret not needed for pull-based sync |
| `lib/stripe/sync.ts:12` | Removed unused `isStripeConfigured` import | Lint cleanup |
| `lib/connectors/mercury.ts:81` | Map unknown account types to "checking" | Mercury returns "mercury" not "checking"/"savings" |
| `lib/connectors/mercury.ts:102` | Infer transaction direction from amount sign | Mercury omits `direction` field |
| `app/(public)/contracts/[token]` | Moved to `app/(public)/contracts/sign/[token]` | Next.js 16 ambiguous route error with admin `/contracts/[id]` |
| `app/(admin)/contracts/[id]/page.tsx` | Updated signing URL to `/contracts/sign/${token}` | Match new public route path |

## Data Seeded / Synced

| Table | Count | Source |
|---|---|---|
| `companies` | 9 | `scripts/seed-companies.ts` |
| `subscription_costs` | 17 | `scripts/seed-costs.ts` |
| `daily_metrics_snapshots` | 31 | `scripts/seed-snapshots.ts` |
| `mercury_accounts` | 2 | `scripts/run-mercury-sync.ts` (live data) |
| `mercury_transactions` | 5 | `scripts/run-mercury-sync.ts` (live data) |
| `clients` | 2 | Pre-existing |
| `invoices` | 2 | Pre-existing |
| `portfolio_projects` | 6 | Pre-existing |

## Vercel Env Vars Added

5 keys added across 3 environments each (15 total operations):
- STRIPE_SECRET_KEY (updated from test to live org key)
- STRIPE_WEBHOOK_SECRET (new)
- MERCURY_API_KEY (new, updated once)
- OPENAI_API_KEY (new)
- RESEND_API_KEY (updated)
- NEXT_PUBLIC_APP_URL (production URL)

## Deploy

- **URL**: https://amcollective.vercel.app
- **Status**: DEPLOYED, BUILD SUCCESS
- **Routes**: 146 (56 static, 90 dynamic)
- **Sign-in page**: 200 OK
- **Root**: 404 (Clerk auth protecting -- expected for unauthenticated requests)

## Dashboard Baseline (2026-02-27)

```
Clients: 2
Subscriptions: 0
MRR: $0.00
Invoices: 2
Payments: 0
Mercury Accounts: 2 ($20,745.18 total)
Mercury Transactions: 5
Daily Snapshots: 31
Subscription Costs: 17
Companies: 9
Portfolio Projects: 6
```

## Errors Encountered & Resolved

1. **Ambiguous route error**: `/contracts/[id]` vs `/contracts/[token]` -- fixed by moving public to `/contracts/sign/[token]`
2. **Mercury account type "mercury"**: Not in DB enum -- fixed by mapping to "checking"
3. **Mercury transaction direction null**: API omits field -- fixed by inferring from amount sign
4. **Stripe org key**: `sk_org_live_` requires Stripe-Context header -- not yet resolved, need standard key or account ID
