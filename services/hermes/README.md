# services/hermes

Fly.io deployment of [Hermes Agent](https://github.com/NousResearch/hermes-agent)
acting as the AM Collective Slack bot.

## Production

| Field | Value |
|---|---|
| App | `hermes-am-collective` |
| Region | `iad` |
| URL | `hermes-am-collective.fly.dev` |
| Cost | ~$2/mo (shared-cpu-1x, 256MB RAM, 1GB volume) |

## Architecture

Hermes runs as a long-lived Slack Socket Mode client. It:

1. Holds an outbound websocket to Slack (no public ports needed)
2. Receives Slack events, processes them via Claude Haiku, calls back via Slack Web API
3. Has built-in cron — fires scheduled jobs (morning briefing, EOD checkin)
4. Calls into AM Collective via the MCP server at `app.amcollectivecapital.com/api/mcp`

State (skills, memory, sqlite session DB) persists on a Fly volume mounted at
`/root/.hermes`.

## Files

| File | Purpose |
|---|---|
| `Dockerfile` | Python 3.11 image, installs Hermes from upstream main |
| `entrypoint.sh` | First-boot config gen + cron seed + foreground gateway |
| `fly.toml` | App config: VM size, volume mount, health check |
| `health.py` | Tiny :8080 HTTP server so Fly health checks pass |
| `seed_crons.py` | Idempotent cron seeder — only seeds if `~/.hermes/cron/jobs.json` is empty |

## Required Fly secrets

| Secret | Source |
|---|---|
| `SLACK_BOT_TOKEN` | Slack app → OAuth & Permissions |
| `SLACK_APP_TOKEN` | Slack app → Basic Information → App-Level Tokens |
| `SLACK_SIGNING_SECRET` | Slack app → Basic Information |
| `ANTHROPIC_API_KEY` | Anthropic console |
| `MCP_SERVICE_TOKEN` | matches Vercel env on `amcollective` project |
| `AM_COLLECTIVE_MCP_URL` | `https://app.amcollectivecapital.com/api/mcp` |
| `GATEWAY_ALLOW_ALL_USERS` | `true` for now (small team); tighten later |

### Routing cron output to a channel

Hermes' upstream cron API doesn't accept a per-job channel parameter.
Instead, **cron output goes to the channel set as Hermes' "home"**.

To set the home channel:

1. Open the Slack channel or DM where you want cron output to land
   (e.g., your DM with Hermes, or `#heremes`)
2. Type `/hermes sethome`
3. Confirm

All scheduled crons (morning briefing, EOD checkin, week wrap, etc.)
will now deliver there.

To change the home channel later, run `/hermes sethome` in the new channel.

## Deploy

```bash
cd services/hermes
fly deploy --app hermes-am-collective --remote-only
```

After deploy, the new SOUL.md persona + cron jobs are picked up
automatically (entrypoint.sh regenerates them on every boot, and
seed_crons.py upserts each job by name so editing this file +
redeploying is the source of truth).

## Active cron jobs

After deploy, check the live cron list:

```bash
fly ssh console --app hermes-am-collective -C "hermes cron list"
```

Should show 6 jobs:

| Job | Schedule | Purpose |
|---|---|---|
| `morning-briefing` | Mon-Fri 8am | MRR + roadmap + reply queue + alerts → Slack |
| `reply-queue-check` | Every 2h, 9am-6pm Mon-Fri | Posts only if 3+ drafts pending |
| `eod-checkin` | Mon-Fri 5pm | Blockers + at-risk rocks + draft backlog |
| `week-wrap` | Fri 4pm | Strategic week summary + next-week priority |
| `roadmap-drift` | Mon + Thu 7am | Drift alert when roadmap items slip |
| `client-blocker-sweep` | Mon 9am | Auto-drafts nudges for waiting-on-client engagements |

To edit: change `seed_crons.py`, redeploy. The seeder upserts by name,
so existing cron history is preserved while prompt/schedule updates
take effect.

## Watch logs

```bash
fly logs --app hermes-am-collective
```

## SSH into the running container

```bash
fly ssh console --app hermes-am-collective
```

Once inside, you can use the full `hermes` CLI:

```bash
hermes cron list
hermes cron status
hermes status
```

## Cost guardrails baked in

`entrypoint.sh` generates `~/.hermes/cli-config.yaml` on first boot with:

- **Default model: `claude-haiku-4-5`** (10× cheaper than Sonnet)
- **`max_tokens: 2048`** per response cap
- **`memory.nudge_interval: 0`** — disables periodic LLM-driven memory updates
- **`skills.creation_nudge_interval: 0`** — disables autonomous skill creation
- **`agent.gateway_timeout: 900`** — kills 15-min-idle sessions
- **Tight Slack toolset** — no terminal, browser, or image gen exposed to the bot

Re-generate by deleting `~/.hermes/cli-config.yaml` (via `fly ssh`) and redeploying.

## When something breaks

See `../../docs/HANDOFF-2026-04-30.md` § "Critical TODO" and the
"Conventions I should AVOID" section.
