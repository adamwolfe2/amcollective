# AM Collective — Business Intelligence & Actions

This skill connects OpenClaw to the AM Collective admin platform. Use it for ALL
business data queries and actions. Never make up business data — always query first.

**IMPORTANT**: The CEO agent at POST /api/bot/claw is the ONLY interface you need.
Do NOT probe or call other API endpoints directly. The CEO agent has 73 tools
covering everything: clients, tasks, leads, invoices, rocks, sprints, cash, MRR,
Vercel deployments, PostHog analytics, Linear issues, Gmail, and more.

---

## Environment Variables Required

```
AMCOLLECTIVE_API_URL      — https://app.amcollectivecapital.com
AMCOLLECTIVE_API_SECRET   — Bearer token (matches OPENCLAW_SHARED_SECRET in Vercel)
```

---

## Query the CEO Agent (Any Question or Action)

Send any message in natural language. The CEO agent handles everything — no need
to call other endpoints. Just ask what you need.

```bash
response=$(curl -s -X POST "${AMCOLLECTIVE_API_URL}/api/bot/claw" \
  -H "Authorization: Bearer ${AMCOLLECTIVE_API_SECRET}" \
  -H "Content-Type: application/json" \
  -d "{
    \"message\": \"$QUERY\",
    \"userId\": \"${USER_ID:-adam}\",
    \"channel\": \"${CHANNEL:-openclaw}\",
    \"sessionId\": \"${SESSION_ID:-}\"
  }")

echo "$response" | jq -r '.response // "No response"'
```

Save the `conversationId` to continue the thread:
```bash
CONV_ID=$(echo "$response" | jq -r '.conversationId // empty')
```

To resume a conversation:
```bash
curl -s -X POST "${AMCOLLECTIVE_API_URL}/api/bot/claw" \
  -H "Authorization: Bearer ${AMCOLLECTIVE_API_SECRET}" \
  -H "Content-Type: application/json" \
  -d "{
    \"message\": \"$FOLLOW_UP\",
    \"userId\": \"adam\",
    \"conversationId\": \"$CONV_ID\"
  }" | jq -r '.response'
```

---

## What the CEO Agent Can Do (73 Tools)

Ask in plain English — examples of what works:

**Financial:**
- "What's our MRR and cash position?"
- "How much runway do we have?"
- "Show me overdue invoices"
- "What did we spend on Vercel last month?"

**Operations:**
- "What tasks are in this sprint?"
- "Which rocks are at risk?"
- "What leads need follow-up this week?"
- "Show me all open proposals"

**Actions (it can take real actions):**
- "Mark the [task name] task as done"
- "Move the Acme lead to proposal stage"
- "Create a rock: Launch Cursive paid tier, Q2 2026"
- "Create a task: Fix auth bug, assign to Adam"

**Infrastructure:**
- "Any failed Vercel deploys today?"
- "What's the build status for TBGC?"

**Analytics:**
- "How many active users does Trackr have?"
- "Show me the lead funnel this month"

**Alerts:**
- "What are the unresolved critical alerts?"
- "Summarize what happened today"

---

## Get Raw Status Snapshot (lightweight — use for decisions, not to send directly)

Returns machine-readable JSON. Do NOT forward raw JSON to Adam. Use it to
decide whether anything is worth a message, then summarize in plain language.

```bash
curl -s "${AMCOLLECTIVE_API_URL}/api/bot/claw/status" \
  -H "Authorization: Bearer ${AMCOLLECTIVE_API_SECRET}"
```

Key fields:
- `mrr` — Monthly recurring revenue in dollars
- `cash` — Total Mercury bank balance
- `criticalAlerts` — Act immediately if > 0
- `warningAlerts` — Flag in next update
- `failedDeploys` — Failed Vercel deploys in last 24h
- `atRiskRocks` — Quarterly goals at risk
- `overdueInvoices` — Count of overdue invoices
- `overdueAmountDollars` — Total overdue in dollars

---

## Health Check

```bash
curl -s "${AMCOLLECTIVE_API_URL}/api/bot/claw" \
  -H "Authorization: Bearer ${AMCOLLECTIVE_API_SECRET}"
# Returns: {"ok":true,"service":"am-collective-ceo","timestamp":"..."}
```

---

## Error Handling

- `401 Unauthorized` — AMCOLLECTIVE_API_SECRET is wrong or not set
- `500 Internal Server Error` — CEO agent failed; try once more, then report to Adam
- Network timeout — Vercel may be cold-starting; wait 10s and retry once
- Empty response — Run: `jq -r '.error // .response'` on the raw response
