# AM Collective — Business Intelligence & Actions

This skill connects OpenClaw to the AM Collective admin platform. Use it for ALL
business data queries and actions. Never make up business data — always query first.

---

## Environment Variables Required

```
AMCOLLECTIVE_API_URL      — https://app.amcollectivecapital.com
AMCOLLECTIVE_API_SECRET   — Bearer token (matches OPENCLAW_SHARED_SECRET in Vercel)
```

---

## Query the CEO Agent (Any Question or Action)

Send any message to the CEO agent — it has full access to all company data
and can take real actions (create tasks, update rocks, move leads, etc.).

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

## Get Raw Status Snapshot (for heartbeat/cron decisions)

Returns a machine-readable JSON snapshot — do NOT send this to Adam directly.
Use it to make decisions before generating a message.

```bash
curl -s "${AMCOLLECTIVE_API_URL}/api/bot/claw/status" \
  -H "Authorization: Bearer ${AMCOLLECTIVE_API_SECRET}"
```

Key fields:
- `mrr` — Monthly recurring revenue in dollars (null = Stripe not yet connected)
- `cash` — Total Mercury bank balance in dollars
- `criticalAlerts` — Unresolved critical alerts (act immediately if > 0)
- `warningAlerts` — Unresolved warning alerts
- `failedDeploys` — Failed Vercel deploys in last 24h
- `atRiskRocks` — Quarterly goals at risk
- `overdueInvoices` — Count of overdue invoices
- `overdueAmountDollars` — Total overdue in dollars
- `mrrDeltaPct` — MRR change vs prior snapshot (positive = growth)
- `anomaliesDetected` — Whether Phase 3 anomaly detection fired
- `anomalies` — Array of human-readable anomaly descriptions

---

## Common Queries

Ask the CEO agent in natural language — these are examples, not the only things
you can do:

**Business state:**
- "What's our MRR and how does it compare to last week?"
- "Give me a company snapshot"
- "How much cash do we have and what's the runway?"

**Operations:**
- "What tasks are due this sprint?"
- "Which rocks are at risk?"
- "What leads need follow-up?"

**Actions:**
- "Mark the TBGC API task as done"
- "Move the Acme lead to proposal stage"
- "Create a rock: Launch Cursive paid tier, Q2 2026"
- "Close this sprint and create next week's"

**Alerts & issues:**
- "What are the unresolved alerts?"
- "Summarize what happened today"

---

## Health Check

Verify connectivity before use:
```bash
curl -s "${AMCOLLECTIVE_API_URL}/api/bot/claw" \
  -H "Authorization: Bearer ${AMCOLLECTIVE_API_SECRET}"
# Should return: {"ok":true,"service":"am-collective-ceo","timestamp":"..."}
```

---

## Error Handling

- `401 Unauthorized` — AMCOLLECTIVE_API_SECRET is wrong or not set
- `500 Internal Server Error` — CEO agent failed; try once more, then report
- Network timeout — The Vercel deployment may be cold-starting; wait 10s and retry once
- Empty response — Check `jq -r '.error // .response'` for the actual error message
