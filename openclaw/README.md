# ClaudeBot — OpenClaw Setup Guide

ClaudeBot is the AI CEO of AM Collective Capital. It runs as a persistent daemon
on the AM Collective Mac mini, connected to the AM Collective admin platform via
the `/api/bot/claw` API bridge.

---

## Architecture

```
You (Slack / WhatsApp / Voice / Watch)
          ↓
    OpenClaw Mac Mini
    (channels, memory, cron, heartbeat)
          ↓  HTTPS + shared API key
    AM Collective Portal (Vercel)
    /api/bot/claw — CEO Agent (Claude Sonnet 4.6)
    /api/bot/claw/status — Live metrics snapshot
          ↓
    Stripe / Mercury / Vercel / Neon / all connectors
```

**OpenClaw is the body** — channels, persistence, OS access, browser control.
**AM Collective is the brain** — data, tools, business logic, audit trail.

---

## Prerequisites

- Mac mini running macOS 14+ (Sonoma or Sequoia)
- Node.js 22+ installed (`brew install node`)
- Anthropic API key
- Slack app with Socket Mode enabled
- `OPENCLAW_SHARED_SECRET` set in Vercel (AM Collective environment)
- `OPENCLAW_WEBHOOK_URL` set in Vercel if you want instant alert webhooks

---

## Step 1 — Install OpenClaw

```bash
npm install -g openclaw@latest
openclaw --version
```

---

## Step 2 — Run the onboarding wizard

```bash
openclaw onboard --install-daemon
```

The wizard will:
- Ask for your LLM provider + API key (choose Anthropic)
- Create `~/.openclaw/openclaw.json`
- Install a macOS LaunchAgent so the gateway starts on login

---

## Step 3 — Set up the workspace

```bash
# Create the workspace directory
mkdir -p ~/.openclaw/workspaces/am-collective-ceo/skills

# Copy config files from this repo
cp openclaw/openclaw.json ~/.openclaw/openclaw.json
cp openclaw/AGENTS.md ~/.openclaw/workspaces/am-collective-ceo/AGENTS.md
cp openclaw/SOUL.md ~/.openclaw/workspaces/am-collective-ceo/SOUL.md
cp openclaw/HEARTBEAT.md ~/.openclaw/workspaces/am-collective-ceo/HEARTBEAT.md
cp openclaw/USER.md ~/.openclaw/workspaces/am-collective-ceo/USER.md
cp openclaw/MEMORY.md ~/.openclaw/workspaces/am-collective-ceo/MEMORY.md
cp openclaw/skills/*.md ~/.openclaw/workspaces/am-collective-ceo/skills/
```

---

## Step 4 — Fill in secrets

Edit `~/.openclaw/openclaw.json` and replace all PLACEHOLDER values:

| Placeholder | Where to find it |
|-------------|-----------------|
| `PLACEHOLDER_SLACK_APP_TOKEN` | Slack app → Socket Mode → App-Level Token |
| `PLACEHOLDER_SLACK_BOT_TOKEN` | Slack app → OAuth & Permissions → Bot Token |
| `PLACEHOLDER_ANTHROPIC_API_KEY` | console.anthropic.com |
| `PLACEHOLDER_OPENCLAW_SHARED_SECRET` | Generate a random secret, then set the same value as `OPENCLAW_SHARED_SECRET` in Vercel |

**Never commit secrets.** Use 1Password CLI or macOS Keychain for production.

---

## Step 5 — Set environment variables in AM Collective (Vercel)

```bash
# Generate a strong shared secret
openssl rand -hex 32

# Set in Vercel
vercel env add OPENCLAW_SHARED_SECRET production
# Paste the secret when prompted

# Set the webhook URL (your Mac mini's local or Tailscale address)
vercel env add OPENCLAW_WEBHOOK_URL production
# Example: http://192.168.1.50:18789/hooks/agent
# Or with Tailscale: https://mac-mini.your-tailnet.ts.net/hooks/agent
```

---

## Step 6 — Start the gateway

```bash
# Start manually (for testing)
openclaw gateway

# Check status
openclaw doctor

# Verify Slack connection
openclaw channels status --probe
```

---

## Step 7 — Connect Slack channels

1. Pair Adam's Slack DM: message ClaudeBot on Slack → `/openclaw pair`
2. Pair Maggie's Slack DM: same process

---

## Step 8 — Test the bridge

```bash
# Health check
curl -s https://app.amcollectivecapital.com/api/bot/claw \
  -H "Authorization: Bearer YOUR_SECRET"
# Expected: {"ok":true,"service":"am-collective-ceo","timestamp":"..."}

# Full test query
curl -s -X POST https://app.amcollectivecapital.com/api/bot/claw \
  -H "Authorization: Bearer YOUR_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"message": "What is our current MRR?", "userId": "adam"}'
# Expected: {"response":"MRR is currently...", "conversationId":"..."}
```

---

## Step 9 — Enable Tailscale (optional but recommended)

Tailscale lets AM Collective send webhook alerts to your Mac mini from Vercel:

```bash
brew install tailscale
sudo tailscale up
tailscale serve 18789  # Exposes the OpenClaw gateway via Tailscale
```

Then set `OPENCLAW_WEBHOOK_URL` in Vercel to your Tailscale address.

---

## Updating Skills

When you edit skill files in this repo, copy them to the workspace:

```bash
cp openclaw/skills/*.md ~/.openclaw/workspaces/am-collective-ceo/skills/
cp openclaw/AGENTS.md ~/.openclaw/workspaces/am-collective-ceo/
cp openclaw/SOUL.md ~/.openclaw/workspaces/am-collective-ceo/
cp openclaw/HEARTBEAT.md ~/.openclaw/workspaces/am-collective-ceo/
```

No gateway restart needed — skills are loaded on each invocation.

---

## Managing the Inngest Backup

AM Collective's Vercel deployment also runs morning/EOD/sprint-prep crons via Inngest.
Once OpenClaw is confirmed running reliably, you can disable the duplicate Inngest
jobs to avoid double messages:

1. Go to the Inngest dashboard
2. Pause: `morning-briefing`, `eod-wrap`, `sprint-prep`
3. Keep running: all sync jobs, alert-triage, and all other background jobs

The alert-triage Inngest job is a good backup for when the Mac mini is offline.

---

## File Reference

| File | Purpose |
|------|---------|
| `AGENTS.md` | Operating contract — what ClaudeBot owns and how it works |
| `SOUL.md` | Personality, tone, ethics, what it protects |
| `HEARTBEAT.md` | What to check every 30 min and when to alert |
| `USER.md` | Adam and Maggie's profiles and preferences |
| `MEMORY.md` | Persistent facts — seed memory for new installations |
| `openclaw.json` | Config template (copy to ~/.openclaw/) |
| `skills/am-collective.md` | Core skill — how to call the AM Collective API |
| `skills/morning-briefing.md` | 7 AM CT daily briefing |
| `skills/eod-wrap.md` | 6 PM CT EOD check-in |
| `skills/sprint-prep.md` | 9 AM CT Monday kickoff |
