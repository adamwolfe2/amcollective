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

## Day 1 Checklist (in order)

When the Mac mini comes out of the box, do these in order. Everything after
this is details.

- [ ] **Before you touch the Mac mini:**
  - [ ] Create the Slack App (see "Creating the Slack App" below) — takes 5 min
  - [ ] Generate the shared secret: `openssl rand -hex 32` → save it somewhere
  - [ ] Set `OPENCLAW_SHARED_SECRET` in Vercel (AM Collective → Environment Variables)

- [ ] **On the Mac mini (takes ~15 min total):**
  - [ ] `brew install node` (Node 22+)
  - [ ] `npm install -g openclaw@latest`
  - [ ] `openclaw onboard --install-daemon` (choose Anthropic, paste API key)
  - [ ] `bash openclaw/sync.sh` (from the amcollective repo root)
  - [ ] Edit `~/.openclaw/openclaw.json` — replace all PLACEHOLDER values
  - [ ] `openclaw gateway` (start and verify it connects)
  - [ ] `openclaw doctor` (confirm everything is green)
  - [ ] Message ClaudeBot on Slack → send `/openclaw pair`
  - [ ] Test: `curl https://app.amcollectivecapital.com/api/bot/claw -H "Authorization: Bearer YOUR_SECRET"`

- [ ] **Optional but recommended:**
  - [ ] `brew install tailscale && sudo tailscale up`
  - [ ] Set `OPENCLAW_WEBHOOK_URL` in Vercel to the Tailscale address

---

## Creating the Slack App

Do this before unboxing the Mac mini.

1. Go to [api.slack.com/apps](https://api.slack.com/apps) → **Create New App → From Scratch**
2. Name it `ClaudeBot`, pick your workspace
3. **Enable Socket Mode** (Settings → Socket Mode → Enable) → generate App-Level Token
   - Token name: `openclaw-gateway`
   - Scope: `connections:write`
   - Copy the `xapp-...` token → this is `PLACEHOLDER_SLACK_APP_TOKEN`
4. **Bot Token Scopes** (OAuth & Permissions → Scopes):
   - `chat:write`, `im:history`, `im:write`, `users:read`
5. **Event Subscriptions** → Enable → Subscribe to bot events:
   - `message.im` (DMs)
   - `app_mention` (when mentioned in channels)
6. **Install App** → Install to Workspace → copy the `xoxb-...` token
   - This is `PLACEHOLDER_SLACK_BOT_TOKEN`
7. Invite ClaudeBot to `#general` or any channels you want it to read

---

## Prerequisites

- Mac mini running macOS 14+ (Sonoma or Sequoia)
- Node.js 22+ (`brew install node`)
- Anthropic API key (console.anthropic.com)
- Slack App (see above) — app token + bot token
- `OPENCLAW_SHARED_SECRET` set in Vercel (AM Collective environment)
- `OPENCLAW_WEBHOOK_URL` set in Vercel for instant alert delivery (optional but recommended)

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

From the root of the `amcollective` repo:

```bash
bash openclaw/sync.sh
```

That's it. The sync script copies everything — config, personality files, and all skills.

To sync manually:

```bash
mkdir -p ~/.openclaw/workspaces/am-collective-ceo/skills

cp openclaw/openclaw.json ~/.openclaw/openclaw.json
cp openclaw/AGENTS.md   ~/.openclaw/workspaces/am-collective-ceo/AGENTS.md
cp openclaw/SOUL.md     ~/.openclaw/workspaces/am-collective-ceo/SOUL.md
cp openclaw/HEARTBEAT.md ~/.openclaw/workspaces/am-collective-ceo/HEARTBEAT.md
cp openclaw/USER.md     ~/.openclaw/workspaces/am-collective-ceo/USER.md
cp openclaw/MEMORY.md   ~/.openclaw/workspaces/am-collective-ceo/MEMORY.md
cp openclaw/skills/*.md ~/.openclaw/workspaces/am-collective-ceo/skills/
```

---

## Step 4 — Generate and fill in secrets

First, generate the shared secret (same value goes in both places):

```bash
openssl rand -hex 32
# Copy this output — you'll use it in TWO places below
```

Edit `~/.openclaw/openclaw.json` and replace all PLACEHOLDER values:

| Placeholder | Where to find it |
|-------------|-----------------|
| `PLACEHOLDER_SLACK_APP_TOKEN` | Slack app → Socket Mode → App-Level Token (`xapp-...`) |
| `PLACEHOLDER_SLACK_BOT_TOKEN` | Slack app → OAuth & Permissions → Bot Token (`xoxb-...`) |
| `PLACEHOLDER_ANTHROPIC_API_KEY` | console.anthropic.com |
| `PLACEHOLDER_OPENCLAW_SHARED_SECRET` | The secret you generated above |

**Never commit secrets.** Use 1Password CLI or macOS Keychain for production.

---

## Step 5 — Set environment variables in AM Collective (Vercel)

```bash
# Set the shared secret in Vercel (must match PLACEHOLDER_OPENCLAW_SHARED_SECRET above)
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

Tailscale lets AM Collective send webhook alerts to your Mac mini from Vercel.
Without it, instant alert delivery won't work (Inngest handles it as fallback).

```bash
brew install tailscale
sudo tailscale up
tailscale serve 18789  # Exposes the OpenClaw gateway via Tailscale HTTPS
```

Then set `OPENCLAW_WEBHOOK_URL` in Vercel to your Tailscale address.

---

## Installing Plugins

OpenClaw plugins extend the gateway with extra channels and capabilities.
Install them with:

```bash
openclaw plugins install @openclaw/plugin-name
openclaw gateway restart
```

**Recommended plugins for AM Collective:**

| Plugin | What it adds | Install |
|--------|-------------|---------|
| `@openclaw/voice-call` | Inbound/outbound phone calls via Twilio. Talk to ClaudeBot by calling a number. | `openclaw plugins install @openclaw/voice-call` |

Configure in `~/.openclaw/openclaw.json` under `plugins.entries`:

```json5
plugins: {
  entries: {
    "voice-call": {
      enabled: true,
      config: { provider: "twilio" }
    }
  }
}
```

Check installed plugins anytime: `openclaw plugins list`

---

## Community Skills (ClawHub)

ClawHub ([clawhub.ai/skills](https://clawhub.ai/skills)) hosts 13,000+ community-built
skills. Browse and install them with:

```bash
npx clawhub@latest install <skill-slug>
# or
openclaw skills install <skill-slug>
```

**Useful skill categories to explore:**

| Category | What to look for |
|----------|-----------------|
| GitHub | Deploy monitoring, PR summaries, issue triage |
| Productivity | Calendar awareness, email drafting, task management |
| Research | Web search, PDF summarization, competitive intel |
| Automation | Airtable, Google Sheets, API integrations |
| Sales/Marketing | Lead enrichment, CRM updates, outbound drafts |

All community skills live in `~/.openclaw/workspaces/<agentId>/skills/`.
No restart needed — skills load on each invocation.

**Note:** Our custom `skills/` in this repo are purpose-built for AM Collective
and will always be the primary skills. ClawHub skills supplement those.

---

## Updating Skills

When you edit skill files in this repo, sync them to the workspace:

```bash
bash openclaw/sync.sh
```

No gateway restart needed — skills load fresh on each invocation.
If you changed `openclaw.json`, restart the gateway:

```bash
openclaw gateway restart
```

---

## Managing the Inngest Backup

AM Collective's Vercel deployment also runs morning/EOD/sprint-prep crons via Inngest.
Both systems will run until you confirm OpenClaw is reliable on the Mac mini.

Once confirmed, pause the duplicate Inngest jobs to avoid double messages:

1. Go to the Inngest dashboard
2. Pause: `morning-briefing`, `eod-wrap`, `sprint-prep`
3. Keep running: all sync jobs, `alert-triage`, and all other background jobs

The `alert-triage` Inngest job is a good permanent backup for when the Mac mini is offline.

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
| `sync.sh` | One-command sync from this repo to the workspace |
| `skills/am-collective.md` | Core skill — how to call the AM Collective API |
| `skills/morning-briefing.md` | 7 AM CT daily briefing |
| `skills/eod-wrap.md` | 6 PM CT EOD check-in |
| `skills/sprint-prep.md` | 9 AM CT Monday kickoff |
| `skills/weekly-review.md` | 4 PM CT Friday weekly wrap |
