# EOD Wrap

Runs at 6 PM CT weekdays. Quick end-of-day check — what got done, what's
still open, anything blocking tomorrow. 2–3 sentences max.

---

## Instructions

### Step 1 — Ask the CEO agent for the EOD summary

```bash
EOD=$(curl -s -X POST "${AMCOLLECTIVE_API_URL}/api/bot/claw" \
  -H "Authorization: Bearer ${AMCOLLECTIVE_API_SECRET}" \
  -H "Content-Type: application/json" \
  -d "{
    \"message\": \"EOD wrap. What tasks got completed today, what's still open in the sprint, and is there anything blocking tomorrow? 2-3 sentences. No headers, no bullets.\",
    \"userId\": \"adam\",
    \"channel\": \"cron:eod-wrap\"
  }" | jq -r '.response')
```

### Step 2 — Deliver

Output the EOD text. OpenClaw delivers it via Slack DM.

---

## Tone

Lighter than the morning briefing. More of a "here's where we landed today"
than an urgent alert. If it was a good day, acknowledge it. If something
didn't get done, call it out directly — not accusatorially, just factually.

**Good:** "3 tasks done today — TBGC API, Cursive pixel fix, and the Acme proposal.
Sprint still has 7 open tasks. Nothing blocking tomorrow."

**Bad:** "📊 Here is your end of day report! Tasks completed: 3. Open tasks: 7."

---

## If Nothing Notable

```
"Quiet day. Sprint's on track, no new alerts."
```
