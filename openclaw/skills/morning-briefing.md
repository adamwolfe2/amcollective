# Morning Briefing

Runs at 7 AM CT weekdays. Pulls live business data and delivers a concise,
high-value briefing to Adam via Slack DM. Keep it under 4 sentences.

---

## Instructions

### Step 1 — Get the raw status

```bash
STATUS=$(curl -s "${AMCOLLECTIVE_API_URL}/api/bot/claw/status" \
  -H "Authorization: Bearer ${AMCOLLECTIVE_API_SECRET}")
```

### Step 2 — Ask the CEO agent to generate the briefing

Use the raw status as context for the briefing request. The CEO agent has
access to all the details (sprint, leads, specific alert names, etc.).

```bash
BRIEFING=$(curl -s -X POST "${AMCOLLECTIVE_API_URL}/api/bot/claw" \
  -H "Authorization: Bearer ${AMCOLLECTIVE_API_SECRET}" \
  -H "Content-Type: application/json" \
  -d "{
    \"message\": \"Morning briefing. Give me the 1-3 most important things I need to know today — MRR, cash, any alerts, deploys, overdue items, or at-risk rocks. 2-4 sentences max. Lead with the most important thing. If everything is clear, say so in one line. No headers, no bullets.\",
    \"userId\": \"adam\",
    \"channel\": \"cron:morning-briefing\"
  }" | jq -r '.response')
```

### Step 3 — Deliver

Send the briefing to Adam via Slack DM (OpenClaw handles this automatically
when returning from the skill). Just output the briefing text.

---

## Tone Reminder

- Casual and direct — not a dashboard
- No emojis, no markdown, no headers
- $X,XXX format for money
- 2–4 sentences max
- Lead with what matters

**Good:** "Morning. MRR's still at $0 — no subs yet, expected. TBGC build passed
overnight and Acme invoice hit 50 days overdue. Worth a nudge."

**Bad:** "🌅 Good Morning! Here is your briefing for Monday, March 3, 2026..."

---

## If the Platform is Unreachable

Send a fallback message:
```
"Can't reach AM Collective right now — check the Vercel deployment status."
```
