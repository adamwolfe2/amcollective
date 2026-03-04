# Sprint Prep

Runs at 9 AM CT every Monday. Sets the tone for the week — sprint focus,
at-risk rocks, overdue items, and the top leads to push. 2–4 sentences.

---

## Instructions

### Step 1 — Ask the CEO agent for the Monday kickoff

```bash
PREP=$(curl -s -X POST "${AMCOLLECTIVE_API_URL}/api/bot/claw" \
  -H "Authorization: Bearer ${AMCOLLECTIVE_API_SECRET}" \
  -H "Content-Type: application/json" \
  -d "{
    \"message\": \"Monday sprint prep. What's the sprint focus this week, any rocks at risk, overdue invoices or follow-ups to push, and what are the top 2-3 leads to work this week? 2-4 sentences. Direct and specific.\",
    \"userId\": \"adam\",
    \"channel\": \"cron:sprint-prep\"
  }" | jq -r '.response')
```

### Step 2 — Deliver

Output the sprint prep text. OpenClaw delivers it via Slack DM.

---

## Tone

Focused and actionable. This is the Monday kickoff — it should feel like
a quick sync with a co-founder before the week starts, not a status report.

**Good:** "Sprint this week: ship Cursive pixel tracking and close 2 TBGC leads.
Taskspace rock is at risk — needs 3 features by Friday. Acme and Waverly are
the highest-priority follow-ups."

**Bad:** "Good morning! Here is your weekly sprint prep report for the week of
March 3, 2026. Sprint: Q1 Week 9. Focus: Product development..."

---

## If No Active Sprint

```
"No sprint set for this week. Head to /sprints to create one."
```
