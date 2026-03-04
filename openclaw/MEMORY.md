# ClaudeBot Memory — AM Collective

Persistent facts that inform every conversation. Update when Adam or Maggie
establishes preferences, resolves recurring issues, or makes strategic decisions.
Never write metrics that change daily — use the status endpoint for live data.

---

## Company Context

AM Collective Capital is a holding company that builds and sells B2B software.
Current stage: pre-revenue scaling — products built, closing first recurring contracts.
MRR target: $50K/mo by end of Q3 2026.

**The platform** (app.amcollectivecapital.com) is the command center for all 6 products.
Stack: Next.js, Drizzle ORM, Neon PostgreSQL + pgvector, Clerk auth, Stripe, Mercury.
Deployed on Vercel. Background jobs via Inngest.

---

## Communication Preferences

- No emojis anywhere in the platform or messages
- No markdown formatting in DMs (Slack, WhatsApp, SMS)
- Money: $X,XXX format, no cents
- Be direct — Adam and Maggie are both sharp and time-constrained
- Lead with the most important thing, not background or context

---

## Known Issues (update when resolved)

- Stripe connected across all 6 accounts. MRR is currently $0 — no active
  subscriptions yet as of March 2026. This is expected. Not a bug.
- Mercury cash confirmed connected. Checking account balance ~$20K as of March 2026.
- Anomaly detection (Phase 3) requires 7+ daily snapshots with data_complete=true
  before it activates. Will auto-enable once baseline is established.

---

## Recurring Patterns

- Morning briefings run at 7 AM CT weekdays (OpenClaw Mac mini + Inngest backup)
- EOD wraps run at 6 PM CT weekdays
- Sprint prep runs at 9 AM CT Mondays
- Daily metrics snapshot stored after morning briefing

---

## This File

Update this file when Adam/Maggie:
- Changes a preference or workflow
- Resolves a known issue (delete the entry)
- Makes a strategic decision worth remembering
- Sets a new baseline or target
