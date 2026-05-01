# AM Collective — Operational Runbook

**Last updated:** 2026-05-01 (overnight E2E hardening session)

This is the single source of truth for operating AM Collective day-to-day. If something breaks, start here. If you (or future-you) come back to this in a fresh session, this doc + `CLAUDE.md` + `memory.md` should give you full context.

---

## Architecture in 60 seconds

```
                       SLACK (focal point — Adam + Maggie + Hermes)
                                       |
                                       |  @mention / cron / event
                                       v
                       HERMES (Fly.io, Slack Socket Mode bot)
                                       |
                                       |  MCP over HTTPS
                                       v
                  AM COLLECTIVE PORTAL (Vercel @ app.amcollectivecapital.com)
                  /api/mcp — 32 tools (read DB + call connectors + write drafts)
                                       |
                                       |  Drizzle ORM
                                       v
                         NEON POSTGRES (single source of truth)
                                       |
                                       v
                  CONNECTORS — Stripe / Mercury / Vercel / Composio / Linear /
                               EmailBison / Cursive / Trackr / TaskSpace / etc.
```

**Slack is where you live.** The portal is the dashboard you visit when Hermes references something specific. Hermes proactively posts on a schedule; AM Collective fires events that wake Hermes for important things (cold-email replies, overdue invoices, build failures, alerts).

---

## Where stuff runs

| Component | Host | Cost/mo | Cron / Trigger | Purpose |
|---|---|---|---|---|
| AM Collective portal | Vercel (am-collective team) | varies | requests + Inngest | Web app, MCP server, Inngest endpoints |
| Hermes | Fly.io (hermes-am-collective) | ~$4 | Slack Socket Mode + own cron | Slack bot, autonomous agent |
| Mike | Fly.io (mike-am-collective) | ~$4 | API on demand | Legal review backend |
| Database | Neon (floral-flower-60494944) | varies | persistent | All app data + memory + roadmap |
| Inngest | Inngest cloud | free tier | crons + webhooks | 50+ background jobs |

---

## How proactive Hermes works

### 9 cron jobs (defined in `services/hermes/seed_crons.py`)

All times in UTC. Output goes to whichever channel you ran `/hermes sethome` in.

| Cron | When | Purpose |
|---|---|---|
| `morning-briefing` | 15:00 Mon-Fri (8am PDT) | MRR + roadmap + reply queue + alerts + "one hard question" |
| `reply-queue-check` | 16,18,20,22 Mon-Fri | Posts only if 3+ drafts pending |
| `eod-checkin` | 00:00 Tue-Sat (5pm PDT) | Blockers + at-risk rocks + reflect on day |
| `week-wrap` | 23:00 Fri (4pm PDT) | Strategic summary + next-week priority + memory pattern reflect |
| `roadmap-drift` | 14:00 Mon+Thu (7am PDT) | Drift alert (silent if clean) |
| `client-blocker-sweep` | 16:00 Mon (9am PDT) | Auto-drafts nudges for waiting clients |
| `self-reflection` | 01:30 Tue-Sat (6:30pm PDT) | Daily reflection log |
| `group-chat-update` | 16:00 Tue+Thu (9am PDT) | Team-wide pulse to home channel |
| `memory-rollup` | 18:00 Sun (11am PDT) | Weekly rule candidate proposal |

### Event-driven Hermes wake-ups

When AM Collective fires these events, Hermes is automatically @mentioned to summarize:

| Event | Trigger | What Hermes does |
|---|---|---|
| **New cold-email reply** | `sync-emailbison-inbox` finds new reply (every 15 min) | Calls `memory.recall` for client context + `email.reply-context`, posts 2-3 sentence summary with recommendation |
| **Inbound Gmail from known contact** | `sync-gmail` finds new message from a registered client/lead | Same as above for Gmail (uses `process-gmail-message`) |
| **Invoice overdue ≥$1000** | `check-overdue-invoices` runs hourly | Pulls memory, drafts collections nudge, posts to Slack |
| **Critical alert** | Any code path that calls `alerts.create()` w/ severity='critical' | Posts via `sendProactiveMessage` (already Hermes-driven) |

To extend to a new event: import `notifySlackAndWakeHermes` from `lib/webhooks/slack.ts` and call it instead of `notifySlack`.

---

## Cost guardrails (the $200 last-month-bill response)

**Built-in:**
- Hermes fluid memory: **disabled** (`memory_enabled: false` in `cli-config.yaml`)
- Hermes uses `claude-haiku-4-5` by default (10x cheaper than Sonnet)
- Hermes per-turn budget: 30k input tokens, 12 tool iterations max
- CEO agent tool loop: bounded at 6 iterations (env: `CEO_MAX_TOOL_ITERATIONS`)
- Chat tool loop: 6 for CEO users, 3 for standard users
- Reply-responder daily ceiling: 100 drafts per 24h (env: `REPLY_RESPONDER_DAILY_CEILING`)
- Gmail auto-draft daily ceiling: 50 drafts per 24h (env: `GMAIL_AUTO_DRAFT_DAILY_CEILING`)
- Alert hourly dedupe: 5 same-type alerts/hr → DM throttled (10 for critical)
- Opus path: blocked. Re-enable with `ALLOW_OPUS_STRATEGY=1` env.
- `aiUsageAlert` cron: hourly check vs `AI_HOURLY_SPEND_THRESHOLD_USD` (default $5/hr)

**Verify:**
```bash
# Health snapshot — confirms env vars + connector matrix
curl -H "Authorization: Bearer $MCP_SERVICE_TOKEN" \
  https://app.amcollectivecapital.com/api/mcp/diagnostic | jq
```

---

## When something breaks

### "Hermes can't find any tools" / "I don't have AM Collective tools"

**Diagnosis:** Hermes can't reach the MCP server. From Fly:
```bash
fly ssh console --app hermes-am-collective -C \
  "curl -s -o /dev/null -w '%{http_code}\n' https://app.amcollectivecapital.com/api/mcp"
```

If it returns 000 with a TLS error: **Vercel firewall is blocking Fly's egress IP.**

**Fix:**
1. Get Fly's egress IP:
   ```bash
   fly ssh console --app hermes-am-collective -C "curl -s https://api.ipify.org"
   ```
2. Vercel dashboard → amcollective → Settings → Firewall:
   - System Bypass → Add: sourceIp=`<that_IP>`, domain=app.amcollectivecapital.com, ttl=0
   - Toggle Attack Challenge Mode OFF if on

### "Hermes is generating verbose responses / costing too much"

Check cli-config.yaml is being applied:
```bash
fly ssh console --app hermes-am-collective -C \
  "cat /root/.hermes/cli-config.yaml" | grep -E "max_tokens|model:|memory_enabled"
```

Should show `default: claude-haiku-4-5`, `max_tokens: 600`, `memory_enabled: false`.

If wrong, redeploy:
```bash
cd services/hermes && fly deploy --app hermes-am-collective --remote-only
```

### "Cron jobs aren't firing"

Check Hermes cron list:
```bash
fly ssh console --app hermes-am-collective -C "hermes cron list"
```

Should show 9 jobs. If fewer, the seed script is failing silently. Check logs:
```bash
fly logs --app hermes-am-collective | grep seed_crons
```

### "Inngest jobs aren't running"

Check Inngest endpoint is reachable:
```bash
curl https://app.amcollectivecapital.com/api/inngest
# Expected: 401 (Inngest signing key required — that's correct)
```

Then check Inngest dashboard for errors: https://app.inngest.com

### "/command page shows nothing / errors"

1. Sign in via Clerk first (admin role required)
2. Verify migration 0012 ran:
   ```bash
   curl -H "Authorization: Bearer $MCP_SERVICE_TOKEN" \
     https://app.amcollectivecapital.com/api/mcp/diagnostic | jq '.checks[] | select(.name=="hermes-memory-table")'
   ```
3. If diagnostic shows `failed`, run:
   ```bash
   npx tsx --env-file=.env.local scripts/run-migration-0012-hermes-memory.ts
   ```

### Build fails on Vercel

Check Sentry release upload — usually the culprit when env build is otherwise clean. Set `SENTRY_DISABLE_BUILD=true` to bypass.

```bash
# Via Vercel MCP
mcp__claude_ai_Vercel__list_deployments({ projectId: "prj_pWERrQuAlX8doYVNcMl0LrsqQuRT", teamId: "team_jNDVLuWxahtHSJVrGdHLOorp" })
```

---

## Setup from scratch (greenfield)

If you ever need to bootstrap a new dev or staging environment:

```bash
git clone https://github.com/adamwolfe2/amcollective
cd amcollective
pnpm install
cp .env.example .env.local
# Fill in DATABASE_URL, ANTHROPIC_API_KEY, MCP_SERVICE_TOKEN, etc.

# Run all migrations + seeds in one shot
npx tsx --env-file=.env.local scripts/setup-control-plane.ts <YOUR_CLERK_USER_ID>
npx tsx --env-file=.env.local scripts/run-migration-0012-hermes-memory.ts

pnpm dev  # local at :3000
```

---

## Deployment flow

### Vercel (auto)
Every push to `main` triggers Vercel build. No manual step needed. Watch:
```
https://vercel.com/am-collective/amcollective
```

### Hermes (manual)
Push to git, then:
```bash
cd services/hermes
fly deploy --app hermes-am-collective --remote-only
```

The entrypoint regenerates SOUL.md + cli-config.yaml + mcp.json on every boot, so all you need to push is code → redeploy → done.

### Mike (manual)
Same pattern but `mike-am-collective` Fly app. See `services/mike/README.md`.

---

## Migration policy

- New SQL goes in `drizzle/00NN_description.sql`
- Add a runner script `scripts/run-migration-00NN-description.ts` that's idempotent (uses `IF NOT EXISTS`)
- Update `scripts/setup-control-plane.ts` to include the new migration in the canonical setup chain
- Run manually after deploy: `npx tsx --env-file=.env.local scripts/run-migration-00NN-description.ts`

NEVER write code that depends on a DB column that hasn't been migrated to prod yet — that's how the memory tools broke until we ran 0012.

---

## What's NOT yet wired (known gaps)

- **`/sign-in/[[...sign-in]]` flows** — assumed working via Clerk; verify if onboarding new users
- **Mike legal review** — backend exists but `MIKE_API_URL` and `MIKE_SERVICE_TOKEN` env vars need confirmation
- **Composio OAuth completion** — Adam needs to finish OAuth for googlecalendar / googlesheets connections per Composio dashboard
- **`HERMES_SLACK_USER_ID`** — must be set as Fly secret for event-driven wake to work
- **`BUDGET_OWNER_CLERK_ID`** — must be set on Vercel for `budget.summary` MCP tool to return data
- **Vercel firewall System Bypass** — must be added for Fly egress IP (otherwise Hermes is blind)

---

## Environment variable reference

Required (platform won't function):
```
DATABASE_URL
ANTHROPIC_API_KEY
MCP_SERVICE_TOKEN
CLERK_SECRET_KEY  (and CLERK_PUBLISHABLE_KEY)
```

Required for specific features:
```
STRIPE_SECRET_KEY              — billing/MRR tools
EMAILBISON_API_KEY + _BASE_URL — cold-email reply pipeline
COMPOSIO_API_KEY               — Gmail / Calendar / Sheets sync
SLACK_WEBHOOK_URL              — proactive notifications
RESEND_API_KEY                 — outbound email (non-EmailBison)
VERCEL_API_TOKEN + VERCEL_TEAM_ID — Vercel connector
```

Cost / behavior guardrails (have defaults; override only when needed):
```
REPLY_RESPONDER_DAILY_CEILING       (default: 100)
GMAIL_AUTO_DRAFT_DAILY_CEILING      (default: 50)
ALERT_HOURLY_DEDUPE_LIMIT           (default: 5)
CEO_MAX_TOOL_ITERATIONS             (default: 6)
AI_HOURLY_SPEND_THRESHOLD_USD       (default: 5)
ALLOW_OPUS_STRATEGY                 (default: unset — Opus blocked)
```

Owner-scoped:
```
BUDGET_OWNER_CLERK_ID  — Clerk user_id whose budget data is exposed via budget.summary
HERMES_SLACK_USER_ID   — Hermes' Slack member ID for event-driven @mentions
```

---

## How to add a new MCP tool

1. Edit `lib/mcp/tools.ts`
2. Add `server.registerTool(...)` block following existing pattern
3. Use Zod schema for input validation (no `z.any()`)
4. Return via `ok(data, summary)` or `err(message)` helpers
5. Update SOUL.md in `services/hermes/entrypoint.sh` to advertise it
6. `pnpm tsc --noEmit` to verify
7. Commit + push (Vercel auto-deploys)
8. Hermes picks up new tools on next call (no restart needed)

## How to add a new cron job

1. Add an entry to `JOBS` in `services/hermes/seed_crons.py`
2. Push + `fly deploy --app hermes-am-collective --remote-only`
3. The seeder upserts by name — new jobs created, existing ones updated

---

## "Help me, I'm lost" — start here

```bash
# 1. Health check
curl -H "Authorization: Bearer $MCP_SERVICE_TOKEN" \
  https://app.amcollectivecapital.com/api/mcp/diagnostic | jq '.summary'

# 2. Latest deploy state
# (use Vercel MCP or)
gh run list --repo adamwolfe2/amcollective --limit 3

# 3. Hermes alive?
fly status --app hermes-am-collective

# 4. Check recent Hermes logs
fly logs --app hermes-am-collective --no-tail | tail -30

# 5. In Slack: ask @Hermes "what's blocking me today"
# Should call tasks.next + email.reply-queue + pipeline.next-actions in parallel
# and post a synthesized answer.
```

If all 5 pass, the platform is healthy. If any fails, the troubleshooting sections above tell you what to do.
