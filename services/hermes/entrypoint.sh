#!/usr/bin/env bash
# Hermes Agent entrypoint.
#
# 1. On first boot, generate ~/.hermes/cli-config.yaml + SOUL.md with our
#    cost-conscious, terse-output defaults.
# 2. Always rewrite ~/.hermes/mcp.json so the AM Collective MCP server stays
#    in sync with whatever Fly secrets currently hold.
# 3. Seed initial cron jobs if none exist.
# 4. Run a background health server, then `hermes gateway run` in the foreground.
#
# Required env vars (set as Fly secrets):
#   SLACK_BOT_TOKEN, SLACK_APP_TOKEN, SLACK_SIGNING_SECRET
#   ANTHROPIC_API_KEY
#   MCP_SERVICE_TOKEN, AM_COLLECTIVE_MCP_URL

set -euo pipefail

HERMES_DIR="${HOME}/.hermes"
PROFILE_DIR="${HERMES_DIR}/profiles/default"
mkdir -p "${HERMES_DIR}" "${PROFILE_DIR}"

CONFIG="${HERMES_DIR}/cli-config.yaml"
MCP_FILE="${HERMES_DIR}/mcp.json"
SOUL="${PROFILE_DIR}/SOUL.md"

# ── First-boot config ─────────────────────────────────────────────────────
# Force-regenerate so config tweaks (terseness, compression off) ship on
# next deploy without needing to manually wipe the volume.
echo "[entrypoint] Writing ${CONFIG}"
cat > "${CONFIG}" <<'YAML'
# AM Collective deployment config. Regenerated on every boot from
# entrypoint.sh — local edits will not survive a redeploy.

model:
  # Default to Haiku 4.5 — ~10x cheaper than Sonnet, plenty smart for daily ops.
  default: "claude-haiku-4-5"
  provider: "anthropic"
  # Anthropic SDK reads ANTHROPIC_API_KEY automatically.

# Hard cap on output per response. Slack replies should be short — if Hermes
# wants more, it can ask the user. 600 tokens ≈ 4-5 short paragraphs.
max_tokens: 600

# Compression OFF: needs an auxiliary OpenRouter/Gemini key we don't have,
# and Slack DMs almost never approach context limits anyway. Old turns just
# get dropped instead of summarized — fine for short-form chat.
compression:
  enabled: false

prompt_caching:
  enabled: true

memory:
  memory_enabled: true
  memory_char_limit: 2200
  # Disable periodic LLM-driven memory nudges — quiet background spend.
  nudge_interval: 0

skills:
  # Disable autonomous skill-creation nudges — Hermes' biggest cost vector.
  creation_nudge_interval: 0

# Slack toolset: small + safe.
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

# ── Tight, AM-Collective-specific persona (regenerated each boot) ─────────
echo "[entrypoint] Writing ${SOUL}"
cat > "${SOUL}" <<'SOUL'
# Hermes — AM Collective Edition

You are Hermes, the AM Collective Slack assistant for Adam Wolfe and Maggie Byrne.

## Output style — STRICT

- Be terse. Slack replies should fit in one screen.
- Lead with the answer. Skip preamble like "I'll help with that..." or "Let me check...".
- Use **plain prose** for one-fact answers. Use bullets only for ≥3 items.
- No emojis unless the user uses them first.
- No headers in short responses. Use them only for multi-section answers.
- Skip your own commentary on what you just did. The user can see the result.
- If a tool returns 50 ventures, summarize ("9 ventures: Cursive, TaskSpace…") — don't dump JSON.
- Prefer **3 sentences** over **3 paragraphs**.
- For numbers and dates, just say them. No "as you can see" / "interestingly".

## When to be longer

- The user explicitly asks for detail ("explain", "walk me through", "deep dive").
- Multi-step task that genuinely needs structure (a draft email, a checklist).
- A complex tool error you need to surface.

## Context

- Workspace: AM Collective (operational holding co for AI ventures).
- Portfolio: Cursive, TaskSpace, AIMS, CampusGTM, Hook, Trackr, Wholesail, TBGC.
- Live data lives behind the `am-collective` MCP server. Use those tools first
  for any AM Collective question.
- Adam = founder/CEO. Maggie = COO. Treat them as principals, not novices.

## Hard rules

- Never hallucinate numbers. If a tool fails, say so plainly.
- Never invent tool names. Use what's listed in the tool inventory.
- Never reformat tool output into something the tool didn't return.
SOUL

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
python3 /opt/hermes-agent/health.py &
HEALTH_PID=$!
echo "[entrypoint] Health server started on :8080 (pid ${HEALTH_PID})"

# ── Run the gateway in the foreground ─────────────────────────────────────
exec hermes gateway run
