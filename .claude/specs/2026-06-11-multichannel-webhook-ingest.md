# Slice: Multi-channel outreach webhook ingest (mentor126)

**Date:** 2026-06-11 · **Tier:** 1 (webhook ingest, external data)

## Goal
Unify email + LinkedIn + ads + booked-calls events into the existing `outreach_events`
stream so the mentor126 dashboard shows every channel in one board.

## Sources
| Channel | Source tool | Endpoint | Auth |
|---|---|---|---|
| email | EmailBison (live) | /api/webhooks/emailbison | X-API-Key (existing) |
| linkedin | Dream Leads (push webhooks) | /api/webhooks/dreamleads | secret token in URL path |
| ads | Google+Meta via Adstra's GoHighLevel | /api/webhooks/ghl | secret token in URL path |
| calls | Calendly + GHL appointments | /api/webhooks/calendly + GHL map | Calendly signing key / token |
| ugc | deferred | — | — |

## Schema change (additive, zero-downtime)
`outreach_events`: + `channel varchar(20) NOT NULL DEFAULT 'email'`,
`lead_identifier varchar(500)`, `lead_profile_url varchar(1000)` + index on channel.
Existing rows backfill to `email` via the default.

## Invariants
- Idempotency via `webhook_events(source, external_id)` unique index (reuse existing pattern).
- Fail-closed auth: missing/!= secret → 401. timing-safe compare.
- Handlers return 200 on internal error to prevent retry storms (match EmailBison).
- No mutation of inbound payload; store raw in `payload` jsonb.
- Every handler writes audit log on high-signal events.

## Out of scope
- UGC source wiring (channel scaffolded only).
- Direct Google/Meta API integration (ads come through GHL).
- Calendly auto-registration if GHL already books (pending Adam confirm).

## Verify
tsc --noEmit · lint · build · one live test event per source confirms payload shape.
