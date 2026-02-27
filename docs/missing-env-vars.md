# Missing Environment Variables

**Last updated**: 2026-02-27

Grouped by priority: what blocks the dashboard vs what's nice-to-have.

---

## P0 -- Blocks Core Dashboard Features

### STRIPE_WEBHOOK_SECRET
- **Status**: Empty
- **Blocks**: Real-time Stripe event processing (payment confirmations, subscription changes)
- **Where to get**: Stripe Dashboard > Developers > Webhooks > Add endpoint
- **Endpoint URL**: `https://amcollective.vercel.app/api/webhooks/stripe`
- **Events to listen for**: `customer.*`, `invoice.*`, `subscription.*`, `charge.*`
- **Note**: NOT needed for pull-based sync (fixed in this session), but needed for real-time updates

### SENTRY_DSN + SENTRY_AUTH_TOKEN + SENTRY_ORG + SENTRY_PROJECT + NEXT_PUBLIC_SENTRY_DSN
- **Status**: All 5 empty
- **Blocks**: Error tracking, performance monitoring
- **Where to get**: sentry.io > Settings > Projects > AM Collective > Client Keys (DSN) and API Keys
- **Priority**: High -- CLAUDE.md says "Sentry must be configured before first deployment"

### INNGEST_EVENT_KEY + INNGEST_SIGNING_KEY
- **Status**: Both empty
- **Blocks**: All 8 background jobs (Stripe sync cron, morning briefing, client health check, cost analysis, etc.)
- **Where to get**: inngest.com > Dashboard > Manage > Keys
- **Note**: Without these, no cron jobs run

---

## P1 -- Blocks Secondary Features

### VERCEL_API_TOKEN
- **Status**: Empty (VERCEL_TEAM_ID is set)
- **Blocks**: Vercel connector (deployment status, build logs, cost tracking)
- **Where to get**: vercel.com > Settings > Tokens > Create
- **Scope**: Full Account or team_jNDVLuWxahtHSJVrGdHLOorp

### ARCJET_KEY
- **Status**: Empty
- **Blocks**: Rate limiting, bot detection, shield protection
- **Where to get**: arcjet.com > Dashboard > API Keys
- **Note**: App works without it but has no DDoS/abuse protection

### NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY
- **Status**: Empty
- **Blocks**: Client-side Stripe Elements (payment forms in portal)
- **Where to get**: Stripe Dashboard > Developers > API Keys > Publishable key

### Resend Domain Verification
- **Status**: API key works, `amcollectivecapital.com` NOT verified
- **Blocks**: Sending emails from `team@amcollectivecapital.com`
- **Where to fix**: resend.com > Domains > Add Domain > `amcollectivecapital.com` > Add DNS records
- **Currently verified**: `send.trytrackr.com` only

---

## P2 -- Nice to Have / Future

### MERCURY_API_KEY
- **Status**: Missing entirely
- **Blocks**: Cash position tracking, bank transaction sync
- **Where to get**: Mercury Dashboard > Settings > API Keys
- **Note**: Requires Mercury business account approval for API access

### POSTHOG_PERSONAL_API_KEY + POSTHOG_PROJECT_ID
- **Status**: Missing (client-side keys ARE set)
- **Blocks**: Server-side analytics queries, PostHog connector
- **Where to get**: app.posthog.com > Project Settings > Personal API Keys

### LINEAR_API_KEY
- **Status**: Missing entirely
- **Blocks**: Linear issue tracking integration
- **Where to get**: linear.app > Settings > API > Personal API Keys

### OPENAI_API_KEY
- **Status**: Missing entirely
- **Blocks**: pgvector embeddings for RAG/document search
- **Where to get**: platform.openai.com > API Keys
- **Alternative**: Could use Anthropic embeddings instead (voyage-3)

### SLACK_WEBHOOK_URL
- **Status**: Missing entirely
- **Blocks**: Slack notifications (alerts, daily briefings)
- **Where to get**: api.slack.com > Your Apps > Incoming Webhooks

### VERCEL_WEBHOOK_SECRET
- **Status**: Missing entirely
- **Blocks**: Vercel deployment event webhooks
- **Where to get**: Generated when creating a webhook in Vercel Dashboard
