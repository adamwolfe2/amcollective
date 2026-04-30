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

Set with `fly secrets set KEY=VALUE --app hermes-am-collective` from this directory.

## Deploy

```bash
cd services/hermes
fly deploy --app hermes-am-collective --remote-only
```

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
