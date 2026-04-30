#!/usr/bin/env bash
# Hermes Agent entrypoint.
#
# 1. On first boot, generate ~/.hermes/cli-config.yaml with our cost-conscious
#    defaults (Haiku, no auto-skill creation, no memory nudges).
# 2. Always rewrite ~/.hermes/mcp.json so the AM Collective MCP server stays
#    in sync with whatever Fly secrets currently hold.
# 3. Run `hermes gateway start` in the foreground.
#
# Required env vars (set as Fly secrets):
#   SLACK_BOT_TOKEN, SLACK_APP_TOKEN, SLACK_SIGNING_SECRET
#   ANTHROPIC_API_KEY
#   MCP_SERVICE_TOKEN, AM_COLLECTIVE_MCP_URL

set -euo pipefail

HERMES_DIR="${HOME}/.hermes"
mkdir -p "${HERMES_DIR}"

CONFIG="${HERMES_DIR}/cli-config.yaml"
MCP_FILE="${HERMES_DIR}/mcp.json"

# ── First-boot config ─────────────────────────────────────────────────────
if [[ ! -f "${CONFIG}" ]]; then
  echo "[entrypoint] Generating ${CONFIG} with cost-conscious defaults"
  cat > "${CONFIG}" <<'YAML'
# AM Collective deployment config — generated on first boot.
# Edit by exec-ing into the running container; persists on Fly volume.

model:
  # Default to Haiku 4.5 — ~10x cheaper than Sonnet, plenty smart for daily ops.
  default: "claude-haiku-4-5"
  provider: "anthropic"
  # Anthropic SDK reads ANTHROPIC_API_KEY automatically.

# Cap output tokens per response so a runaway model can't drain the budget.
# Most Slack replies fit in <500 tokens. 2048 is generous headroom.
max_tokens: 2048

# Compress long sessions aggressively to keep input tokens low.
compression:
  enabled: true

prompt_caching:
  enabled: true

memory:
  memory_enabled: true
  memory_char_limit: 2200
  # Disable periodic LLM-driven memory nudges — these are background calls
  # that quietly cost money. Re-enable later if we want richer memory.
  nudge_interval: 0

skills:
  # Disable autonomous skill-creation nudges — Hermes' biggest cost vector.
  # Skills can still be created manually with `/skill new`.
  creation_nudge_interval: 0

# Slack platform: tools available to Hermes when responding in Slack.
# We start with a small safe surface; expand once we trust it.
platform_toolsets:
  slack: [web, file, todo, skills]

agent:
  # Stop a runaway gateway agent run after 15 minutes of inactivity.
  gateway_timeout: 900

session_reset:
  enabled: true

# Don't auto-spawn parallel subagents on Slack — keeps cost predictable.
delegation:
  max_iterations: 30
YAML
fi

# ── Always sync the MCP server pointer ────────────────────────────────────
# Rewriting on every boot keeps the URL/token in lockstep with Fly secrets.
if [[ -n "${AM_COLLECTIVE_MCP_URL:-}" && -n "${MCP_SERVICE_TOKEN:-}" ]]; then
  echo "[entrypoint] Writing ${MCP_FILE}"
  cat > "${MCP_FILE}" <<JSON
{
  "mcpServers": {
    "am-collective": {
      "url": "${AM_COLLECTIVE_MCP_URL}",
      "headers": {
        "Authorization": "Bearer ${MCP_SERVICE_TOKEN}",
        "X-MCP-Agent": "hermes"
      }
    }
  }
}
JSON
else
  echo "[entrypoint] WARNING: MCP env vars unset; skipping ${MCP_FILE}"
fi

# ── Sanity log (no secrets) ───────────────────────────────────────────────
echo "[entrypoint] Slack tokens present:"
echo "  SLACK_BOT_TOKEN=${SLACK_BOT_TOKEN:0:10}...$( [[ -n "${SLACK_BOT_TOKEN:-}" ]] && echo OK )"
echo "  SLACK_APP_TOKEN=${SLACK_APP_TOKEN:0:10}...$( [[ -n "${SLACK_APP_TOKEN:-}" ]] && echo OK )"
echo "  ANTHROPIC_API_KEY=${ANTHROPIC_API_KEY:0:10}...$( [[ -n "${ANTHROPIC_API_KEY:-}" ]] && echo OK )"

# ── Seed initial cron jobs (first boot only) ─────────────────────────────
echo "[entrypoint] Seeding cron jobs..."
python3 /opt/hermes-agent/seed_crons.py

# ── Health-check server (background) ─────────────────────────────────────
# Fly probes :8080/health. We run a tiny Python HTTP server as a daemon so
# the machine is visible in the Fly dashboard. It exits when hermes exits.
python3 /opt/hermes-agent/health.py &
HEALTH_PID=$!
echo "[entrypoint] Health server started on :8080 (pid ${HEALTH_PID})"

# ── Run the gateway in the foreground ─────────────────────────────────────
# `hermes gateway start` blocks indefinitely on the Slack websocket. If it
# exits non-zero, Fly will restart the machine per fly.toml restart policy.
exec hermes gateway run
