# Hermes — Slack User Guide

For Adam + Maggie. 3-minute read.

---

## What is Hermes?

Hermes is **AM Collective's Slack-native AI assistant**. Think of it as a teammate who:

- Lives in Slack (DMs and channels)
- Has read access to all AM Collective data (MRR, ventures, clients, alerts, EOS rocks, invoices, briefings)
- Can search the web, run research, draft documents
- Remembers context across conversations
- Posts a morning briefing every weekday at 8am PT

It runs autonomously — no laptop, no logging into the dashboard. You just talk to it.

---

## How to talk to it

### In a DM (private, just you)

Find **Hermes** in your Slack DM list. Type a message normally. No special syntax:

```
what's our MRR right now?
```

```
show me any critical alerts
```

```
research what Anthropic announced last week
```

It replies inline with citations (when applicable) and pulls live data from AM Collective.

### In a channel (visible to everyone in that channel)

Mention it: `@Hermes <your question>`. Same as DM but everyone sees the conversation. Use this when you want to share the answer with the team.

### ⚠️ What NOT to do

**Don't use slash commands like `/hermes ...`** — Slack will reject them. Slack reserves anything starting with `/` for its own system. Just type the message normally.

---

## What it can do today

| Thing you can ask | What happens behind the scenes |
|---|---|
| "What's our MRR?" | Pulls live from Stripe via the AM Collective MCP server |
| "List active ventures" | Queries the Neon DB |
| "What rocks are at risk for Q2?" | Filters EOS rocks table |
| "Show recent Vercel deployments" | Calls the Vercel API |
| "Any open critical alerts?" | Reads the alerts table |
| "Research [any topic]" | Uses Tavily + Claude Sonnet, returns sources |
| "What was in this week's briefing?" | Pulls the most recent daily briefing |
| "Score Cursive's client health" | Runs the existing health-scoring agent |
| "Log my EOD: [tasks done]" | Writes to the EOD reports table |
| "Mark rock X as done" | Updates the rocks table |

Full list of 16 tools: see `docs/HANDOFF-2026-04-30.md` § "MCP tools".

## What it can't do (yet)

- Access Gmail / Google Calendar / Notion (could add — say the word)
- Read/write to portcos' systems (Linear, GitHub, etc.)
- Generate images
- Anything destructive without explicit confirmation

---

## Daily rhythm

### Morning briefing — weekdays at 8am PT

A summary lands in your designated Slack channel:
- Today's date
- Current MRR
- Any critical alerts
- Briefing content from the dashboard
- One actionable priority

### EOD check-in — weekdays at 6pm PT

A summary of:
- Open blockers from team EOD reports
- Rocks that moved to "at risk" today
- "All good" if nothing's wrong

### One-time setup for each of you

In your DM with Hermes, type the word:

```
sethome
```

(Just the word, no slash.) This tells Hermes *which channel* to deliver the daily briefing and EOD to. You can sethome to your DM, or to a shared `#daily` channel — your call.

---

## Cost awareness

This was a real concern, so we built guardrails:

- **Default model: Claude Haiku** — fast and cheap (~$0.0002 per typical reply)
- **Max output per response: 2,048 tokens** (about 4 paragraphs)
- **Anthropic spend cap: $25/day hard limit** — calls fail before exceeding, no surprise bills
- **Fly.io hosting: ~$2/month** — fixed cost, doesn't scale with usage

Sending 100 messages/day to Hermes = roughly **$0.50/month in API costs**. Use it freely.

If you ever see a cost alert, ping Adam — it likely means a runaway loop and we want to know.

---

## What it remembers

Hermes maintains:
- **Persistent memory** of facts you've told it ("Maggie's title is COO", "Cursive launched Oct 2025") — built up over time
- **Session context** within an ongoing conversation
- **Skill library** that grows as we explicitly add capabilities

Memory is private to AM Collective — stored on our Fly.io volume, not shared with Anthropic for training.

---

## Common workflows

### "Catch me up on today"

```
@Hermes summarize: latest briefing + any new alerts + anything I missed since this morning
```

### "Quick check before a call"

```
@Hermes give me the 30-second summary on [client name] — health, recent activity, open issues
```

### "Help me draft something"

```
@Hermes draft a follow-up email to [client] about [topic]
```

### "Tell me what changed"

```
@Hermes what shipped to production in the last 24 hours?
```

### "Schedule something recurring"

```
@Hermes every Friday at 4pm, post a weekly cost summary to #am-collective
```

(Hermes has a built-in scheduler for these.)

---

## When something goes wrong

### Hermes doesn't reply

1. Check it's online: in Slack, look at the bot's profile — should say "Active"
2. Try DMing: "ping" — should reply within ~3 seconds
3. If nothing, Adam runs `fly status --app hermes-am-collective` to check the machine

### Hermes gives a weird/wrong answer

1. Reply with `/retry` (this is one of Hermes' OWN slash commands, not Slack's)
2. Or: rephrase and re-ask
3. If consistently wrong: tell Adam — it's likely an MCP tool bug

### Hermes says "tool not available"

The MCP server is down. Adam: check `https://app.amcollectivecapital.com/api/mcp` returns 200.

### You want to reset the conversation

Just say "new conversation" or `/new`. Hermes wipes session context and starts fresh.

---

## Where to find more

- **Setup details / deploy / secrets**: `docs/HERMES-SETUP.md`
- **Comprehensive handoff**: `docs/HANDOFF-2026-04-30.md`
- **Hermes itself**: <https://github.com/NousResearch/hermes-agent>

---

**Bottom line for Maggie:** Just open Hermes in Slack and start chatting. Treat it like a teammate. It won't break anything, the cost is bounded, and the more you use it the more useful it gets.
