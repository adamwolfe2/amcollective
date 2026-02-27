# Vercel Production Environment Variable Checklist

**Project**: AM Collective (prj_pWERrQuAlX8doYVNcMl0LrsqQuRT)
**Last updated**: 2026-02-27

Set these in Vercel Dashboard > Project Settings > Environment Variables.
Mark scope as "Production" (and optionally "Preview").

---

## Required (app won't function without these)

- [ ] `DATABASE_URL` -- Neon connection string (already auto-set by Vercel-Neon integration)
- [ ] `CLERK_SECRET_KEY` -- Clerk backend secret
- [ ] `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` -- Clerk frontend key
- [ ] `NEXT_PUBLIC_CLERK_SIGN_IN_URL` -- `/sign-in`
- [ ] `NEXT_PUBLIC_CLERK_SIGN_UP_URL` -- `/sign-up`
- [ ] `STRIPE_SECRET_KEY` -- Stripe API secret
- [ ] `NEXT_PUBLIC_APP_URL` -- `https://amcollective.vercel.app` (or custom domain)

## Required for Core Features

- [ ] `STRIPE_WEBHOOK_SECRET` -- Stripe webhook signing secret
- [ ] `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` -- Stripe client-side key
- [ ] `ANTHROPIC_API_KEY` -- Claude AI (agents, chatbot, briefings)
- [ ] `RESEND_API_KEY` -- Email sending (verify `amcollectivecapital.com` domain first)
- [ ] `UPSTASH_REDIS_REST_URL` -- Rate limiting
- [ ] `UPSTASH_REDIS_REST_TOKEN` -- Rate limiting
- [ ] `INNGEST_EVENT_KEY` -- Background job trigger
- [ ] `INNGEST_SIGNING_KEY` -- Background job verification

## Required for Monitoring

- [ ] `SENTRY_DSN` -- Server-side error reporting
- [ ] `NEXT_PUBLIC_SENTRY_DSN` -- Client-side error reporting
- [ ] `SENTRY_AUTH_TOKEN` -- Source map uploads
- [ ] `SENTRY_ORG` -- Sentry organization slug
- [ ] `SENTRY_PROJECT` -- Sentry project slug

## Required for Security

- [ ] `ARCJET_KEY` -- Rate limiting + bot detection + shield

## Optional (enhance dashboard but not critical)

- [ ] `VERCEL_API_TOKEN` -- Vercel connector (deployment monitoring)
- [ ] `VERCEL_TEAM_ID` -- Already set
- [ ] `NEXT_PUBLIC_POSTHOG_KEY` -- Client analytics
- [ ] `NEXT_PUBLIC_POSTHOG_HOST` -- PostHog cloud host
- [ ] `POSTHOG_PERSONAL_API_KEY` -- Server-side analytics
- [ ] `POSTHOG_PROJECT_ID` -- PostHog project
- [ ] `FIRECRAWL_API_KEY` -- Web research agent
- [ ] `TAVILY_API_KEY` -- Search research agent
- [ ] `BLOOIO_API_KEY` -- Messaging integration

## Future (when services are set up)

- [ ] `MERCURY_API_KEY` -- Bank account sync
- [ ] `LINEAR_API_KEY` -- Issue tracker sync
- [ ] `OPENAI_API_KEY` -- Embeddings for RAG
- [ ] `SLACK_WEBHOOK_URL` -- Slack notifications
- [ ] `VERCEL_WEBHOOK_SECRET` -- Deployment webhooks

---

## Notes

- Clerk keys should be **production** keys (not dev keys from `.env.local`)
- `DATABASE_URL` is auto-managed by the Vercel-Neon integration -- do not override manually
- `NEXT_PUBLIC_APP_URL` must match the actual deployment URL
- Sentry DSN values for `SENTRY_DSN` and `NEXT_PUBLIC_SENTRY_DSN` are typically the same value
