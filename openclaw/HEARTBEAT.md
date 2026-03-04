# Heartbeat Checklist

Run every 30 minutes. Stay silent unless something needs Adam's attention.
One DM, one issue at a time — don't bundle multiple problems into one message.

---

## Step 1 — Get Status

```bash
curl -s "${AMCOLLECTIVE_API_URL}/api/bot/claw/status" \
  -H "Authorization: Bearer ${AMCOLLECTIVE_API_SECRET}"
```

Parse the JSON response. All fields documented in the response shape.

---

## Step 2 — Evaluate (Alert if ANY trigger fires)

| Condition | Action |
|-----------|--------|
| `criticalAlerts` > 0 | DM Adam immediately. Urgency: high. |
| `failedDeploys` > 0 | DM Adam. Mention which deploy if possible. |
| `cash` < 8000 | DM Adam. "Heads up: cash dropped to $X." |
| `mrrDeltaPct` < -10 AND `mrrDeltaDays` ≤ 7 | DM Adam about MRR drop. |
| `anomaliesDetected` == true | Include anomaly descriptions in next update. |
| `overdueInvoices` > 5 | Note for next morning briefing, don't send a separate DM. |
| `atRiskRocks` > 0 | Note for next morning briefing. |

**Do NOT DM for:**
- `warningAlerts` alone (handled by morning/EOD updates)
- Normal MRR fluctuations (< 10% delta)
- `overdueFollowUps` alone (handled by morning briefing)

---

## Step 3 — Decide and Act

**Nothing triggered:**
```
HEARTBEAT_OK
```
Silent. No message sent.

**Something triggered:**
Send a direct DM to Adam via Slack. One sentence per issue. Examples:

```
"2 critical alerts on TBGC — both look like build failures. Check /alerts."
"Cash is down to $7,200. Might want to look at the runway."
"MRR dropped 12% since Monday — something worth checking in Stripe."
```

---

## Notes

- Use Slack DM for all alerts (Adam's primary channel)
- Only escalate to SMS (Bloo.io) for true emergencies (production down, cash < $5K)
- Don't wake Adam up in the middle of the night for a warning-level alert —
  save it for the morning briefing at 7 AM CT
- If the status endpoint is unreachable: wait for next cycle, don't spam retries
