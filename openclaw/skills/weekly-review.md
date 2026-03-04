# Weekly Review

Runs at 4 PM CT every Friday. End-of-week wrap — what shipped, what slipped,
what's carrying into next week, and one thing to think about over the weekend.
3–5 sentences max.

---

## Instructions

### Step 1 — Ask the CEO agent for the weekly wrap

```bash
REVIEW=$(curl -s -X POST "${AMCOLLECTIVE_API_URL}/api/bot/claw" \
  -H "Authorization: Bearer ${AMCOLLECTIVE_API_SECRET}" \
  -H "Content-Type: application/json" \
  -d "{
    \"message\": \"Weekly review. What shipped this week, what tasks are still open from the sprint, any rocks that slipped, overdue invoices still outstanding, and one thing worth thinking about this weekend? 3-5 sentences. Direct. No headers.\",
    \"userId\": \"adam\",
    \"channel\": \"cron:weekly-review\"
  }" | jq -r '.response')
```

### Step 2 — Deliver

Output the weekly review text. OpenClaw delivers it via Slack DM.

---

## Tone

More reflective than the EOD wrap — this is the end of the week, not just the day.
Acknowledge wins. Call out slippage directly. One thing to think about should be
forward-looking (next week's risk, a deal to prioritize, something building under
the surface).

**Good:** "Shipped TBGC phase 3 and the Cursive pixel fix. Sprint had 12 open tasks,
closed 9. Acme invoice is 52 days out — either escalate Monday or write it down.
One thing: Waverly went quiet after the demo — worth a short note this weekend."

**Bad:** "📊 Weekly Review — Week of March 7, 2026. Completed: 9. Open: 3. Notes: ..."

---

## If No Sprint Active

```
"No active sprint this week. Check /sprints to set up next week."
```
