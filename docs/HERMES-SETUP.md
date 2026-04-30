# Hermes Agent ↔ AM Collective Setup

This runbook gets Hermes Agent (Nous Research) wired into AM Collective so
Adam and Maggie can talk to the dashboard from Slack. Once finished:

- **Slack** is the daily interface — DM the bot, mention it in a channel,
  or let it post the morning briefing automatically.
- **Hermes** runs serverlessly on Modal (free when idle, ~$0.05/run otherwise).
- **AM Collective MCP server** at `https://app.amcollectivecapital.com/api/mcp`
  exposes 16 tools (read + write) backed by the Drizzle schema and connector
  cache.
- **Auth**: bearer token in env, audited on every call.

This is roughly a 2-hour setup once all the accounts are created.

---

## What's already in the repo (commit `<this commit>`)

| File | Purpose |
|------|---------|
| `app/api/mcp/route.ts` | MCP HTTP endpoint, JSON-RPC over POST, stateless |
| `lib/mcp/auth.ts` | Bearer-token validation, constant-time compare |
| `lib/mcp/audit.ts` | Audit-log helper (writes `auditLogs` rows) |
| `lib/mcp/tools.ts` | 16 tools (12 read, 4 write) |

You can curl the live endpoint as a smoke test:

```bash
curl -i https://app.amcollectivecapital.com/api/mcp
# {"service":"am-collective-mcp","status":"ok",...}
```

---

## Step 1 — Generate the MCP service token

```bash
openssl rand -hex 32
```

Save the output. This becomes:

- `MCP_SERVICE_TOKEN` in **Vercel** (Production env, AM Collective project)
- `AM_COLLECTIVE_MCP_TOKEN` on **Modal** (Hermes deployment)

Rotate by changing both values and redeploying.

After setting in Vercel, redeploy main so the env propagates.

---

## Step 2 — Create the Slack app

1. Go to <https://api.slack.com/apps> → **Create New App** → **From scratch**.
2. Name: `AM Collective`. Workspace: AM Collective workspace.
3. **OAuth & Permissions** → add bot scopes:
   - `app_mentions:read`
   - `channels:history`
   - `channels:read`
   - `chat:write`
   - `chat:write.public`
   - `files:read`
   - `groups:history`
   - `groups:read`
   - `im:history`, `im:read`, `im:write`
   - `mpim:history`, `mpim:read`, `mpim:write`
   - `users:read`
   - `users:read.email`
4. **Socket Mode** → **Enable Socket Mode** → generate an **App-Level Token**
   with `connections:write` scope. Save as `SLACK_APP_TOKEN` (`xapp-…`).
5. **Event Subscriptions** → **Enable** → subscribe to bot events:
   - `app_mention`, `message.channels`, `message.groups`, `message.im`,
     `message.mpim`.
   (Socket Mode handles delivery — no public URL needed.)
6. **Install App** → install to workspace. Save the **Bot User OAuth Token**
   as `SLACK_BOT_TOKEN` (`xoxb-…`).
7. Save the **Signing Secret** from **Basic Information** as
   `SLACK_SIGNING_SECRET`.
8. Invite the bot to channels you want it in:
   `/invite @AM Collective` in `#general`, `#client-cursive`, etc.

---

## Step 3 — Provision the Hermes runtime

We're hosting on **Modal** because it hibernates when idle (free) and wakes
on demand. Alternative: any always-on VPS works too (Fly, Railway, $5
DigitalOcean droplet).

```bash
# One-time, on your laptop
pip install modal
modal token new
```

Clone Hermes:

```bash
cd ~
git clone https://github.com/NousResearch/hermes-agent.git
cd hermes-agent
./setup-hermes.sh   # creates .venv, installs hermes
```

Smoke test locally:

```bash
./hermes
# → choose model provider (Anthropic recommended), then chat
```

---

## Step 4 — Configure Hermes for AM Collective

Hermes config lives in `~/.hermes/`. Two pieces matter:

### 4a) MCP server registration

`~/.hermes/mcp.json` (create if missing):

```json
{
  "mcpServers": {
    "am-collective": {
      "type": "http",
      "url": "https://app.amcollectivecapital.com/api/mcp",
      "headers": {
        "Authorization": "Bearer ${AM_COLLECTIVE_MCP_TOKEN}",
        "X-MCP-Agent": "hermes"
      }
    }
  }
}
```

Set the env var locally to test:

```bash
export AM_COLLECTIVE_MCP_TOKEN="<token from step 1>"
./hermes
# Inside Hermes: /tools  → should now list am-collective.* tools
# Try: "what's the latest morning briefing"
```

### 4b) Slack gateway

```bash
hermes gateway setup
# Pick: Slack
# Paste: SLACK_BOT_TOKEN, SLACK_APP_TOKEN, SLACK_SIGNING_SECRET
```

Test locally:

```bash
hermes gateway start
# In Slack DM the bot: "what's the MRR"
```

---

## Step 5 — Deploy to Modal (production)

```bash
cd ~/hermes-agent
# Modal deployment ships in the repo:
modal deploy modal_app.py   # exact filename per Hermes docs
```

On the Modal dashboard, set these secrets:

| Secret | Value |
|--------|-------|
| `ANTHROPIC_API_KEY` | (your Anthropic key) |
| `SLACK_BOT_TOKEN` | `xoxb-…` |
| `SLACK_APP_TOKEN` | `xapp-…` |
| `SLACK_SIGNING_SECRET` | (from Slack) |
| `AM_COLLECTIVE_MCP_TOKEN` | (from step 1) |

Verify in Slack — DM the bot, it should respond.

---

## Step 6 — Schedule the morning briefing

Hermes has a built-in cron. From inside a Hermes conversation:

```
/cron add "0 8 * * 1-5" "post the latest am-collective briefing to #am-collective-daily, then list any open critical alerts"
```

That runs 8am weekdays, calls `briefing.get-latest` + `alerts.open` via MCP,
and posts to Slack.

(Optional) EOD ping at 6pm:

```
/cron add "0 18 * * 1-5" "DM Adam and Maggie asking for their EOD: tasks completed, blockers, tomorrow plan. When they reply, call eos.log-eod."
```

---

## Step 7 — Per-channel scoping (future)

Right now Hermes sees the whole portfolio in every channel. To scope by
client/venture (e.g. only Cursive data in `#client-cursive`), add a Hermes
context file:

`~/.hermes/contexts/slack-channel-scope.md`:

```
When invoked from a Slack channel whose name matches `#client-<slug>`,
include a `client_slug` filter on every MCP tool call and only report data
relevant to that client.
```

The MCP server already accepts an `X-MCP-Channel` header — Hermes can
forward `${slack.channel.name}` as that value, and a future tool revision
can filter by slug. (Not implemented in v1; flagged in the registry as a
follow-up.)

---

## Tool inventory (v1)

### Read tools (12)

| Tool | Description |
|------|-------------|
| `briefing.get-latest` | Latest daily briefing (markdown + metrics). |
| `clients.list` | All clients with MRR + payment status. |
| `clients.health` | 0–100 health score for one client. |
| `ventures.list` | Portfolio ventures (status + project IDs). |
| `finance.mrr` | Total MRR across Stripe accounts. |
| `finance.mrr-by-company` | MRR broken down per portco. |
| `finance.revenue-trend` | Daily revenue points, last N days. |
| `vercel.recent-deployments` | Last N deployments across the team. |
| `alerts.open` | Unresolved operational alerts. |
| `eos.rocks` | EOS rocks filtered by quarter/status. |
| `eos.open-blockers` | Recent EODs with blockers / escalations. |
| `invoices.list` | Invoices filtered by status/client. |
| `intelligence.weekly-insights` | CEO-agent weekly priorities. |
| `research.run` | On-demand Tavily + Sonnet research with citations. |

### Write tools (3)

| Tool | Description |
|------|-------------|
| `eos.log-eod` | Insert or update an EOD report. |
| `eos.update-rock` | Update progress / status on a rock. |
| `alerts.resolve` | Mark an alert resolved. |

Audit logging: every tool call writes a row to `audit_logs` with
`actorType="agent"`, `actorId="hermes"`, `action="mcp.<tool>"`, plus the
Slack channel/user that triggered it (if forwarded).

---

## Adding a tool

1. Add to `lib/mcp/tools.ts` — follow the existing pattern (Zod schema,
   handler returns `ok(data, summary)` or `err(message)`).
2. The audit-log boundary in `app/api/mcp/route.ts` picks it up
   automatically — no extra wiring needed.
3. Update the **Tool inventory** above.
4. Push to main; Vercel rebuilds; Hermes picks up the new tool on next
   `tools/list` (which it does on every conversation start).

---

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| `Unauthorized` from MCP endpoint | Token mismatch. Compare Vercel env to Modal secret. |
| Tool returns "Failed to load MRR" | Stripe connector cache empty or broken. Check `/api/health`. |
| Slack bot doesn't reply | Re-invite bot to channel; confirm `app_mention` event subscribed; check Modal logs. |
| Hermes "no tools available" | `~/.hermes/mcp.json` missing or token unset; `/mcp reload` in Hermes. |
| Audit log missing entries | DB unreachable; check `lib/db` connection logs (audit failures don't crash tools by design). |

---

## What's NOT in v1 (intentional)

- **Channel-scoped data filtering** — header is accepted but not enforced. Add when you've set up per-client channels.
- **Sending Slack messages from MCP tools directly** — Hermes itself is the Slack speaker; we don't need a `slack.send` MCP tool.
- **Triggering Inngest jobs from MCP** — out of scope for v1 (would let Hermes kick off backfills, send client reports). Easy to add when needed.
- **Reading from PostHog / Neon / Mercury connectors** — only Stripe + Vercel exposed in v1; add others as the Slack workflow makes them necessary.
