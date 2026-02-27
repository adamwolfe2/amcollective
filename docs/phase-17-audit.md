# Phase 17 Audit — Webhook Infrastructure + Invoice Builder

**Date**: 2026-02-26
**Auditor**: Claude Opus 4.6 (Phase 17 Step 0)

---

## Audit Question 1: Does any Stripe webhook handler exist?

**YES — Fully production-grade.** `app/api/webhooks/stripe/route.ts` (1,176 lines)

Handles 14 event types with:
- HMAC signature verification via `parseWebhookEvent()` from `lib/stripe/config.ts`
- ArcJet rate limiting
- Full idempotency via `webhookEvents` table (deduplication by event ID)
- Automatic MRR/LTV recalculation on subscription/payment events
- Alert creation on failures, overdue invoices, subscription cancellations
- AuditLog entries for every event

Events: invoice.created, invoice.finalized, invoice.paid, invoice.payment_failed,
invoice.overdue, invoice.voided, customer.subscription.created/updated/deleted,
charge.succeeded/failed/refunded, customer.created/updated

**Verdict**: Do NOT rebuild. Already complete.

---

## Audit Question 2: What is Mercury's current cron schedule?

`"0 11 * * *"` — Daily at 11:00 UTC (3 AM PT)

Updates to `*/15 * * * *` (every 15 min) per spec.

---

## Audit Question 3: What columns exist on the activity log table?

Table: `audit_logs` in `lib/db/schema/system.ts`

| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | defaultRandom |
| actorId | varchar(255) | NOT NULL |
| actorType | enum(user/system/agent) | NOT NULL |
| action | varchar(255) | NOT NULL |
| entityType | varchar(100) | NOT NULL |
| entityId | varchar(255) | NOT NULL |
| metadata | jsonb | nullable |
| ipAddress | varchar(45) | nullable |
| createdAt | timestamp | defaultNow, NOT NULL |

**No separate `activityLog` table exists.** All activity is logged in `audit_logs`.
The spec references `activityLog` — we use `auditLogs` + `createAuditLog()`.

---

## Audit Question 4: What does the invoice schema look like?

Table: `invoices` in `lib/db/schema/billing.ts`

| Column | Type | Exists |
|--------|------|--------|
| id | uuid PK | YES |
| clientId | uuid FK | YES |
| engagementId | uuid FK | YES |
| stripeInvoiceId | varchar(255) | YES |
| stripeHostedUrl | varchar(1000) | YES |
| number | varchar(100) | YES |
| status | enum (8 values) | YES |
| amount | integer (cents) | YES |
| currency | varchar(10) | YES |
| dueDate | date | YES |
| paidAt | timestamp | YES |
| pdfUrl | varchar(500) | YES |
| lineItems | jsonb | YES |
| reminderCount | integer | YES |
| notes | text | YES |
| createdAt | timestamp | YES |
| updatedAt | timestamp | YES |

**Missing from spec wish-list**:
- `sentAt` — NOT present
- `viewedAt` — NOT present
- `stripePaymentLinkId` / `stripePaymentLinkUrl` — NOT present
- `taxRate` / `taxAmount` / `subtotal` — NOT present
- `paymentTerms` — NOT present
- `issueDate` — NOT present (createdAt serves this purpose)
- `createdById` — NOT present
- `paidAmount` — NOT present

**Decision**: Add `sentAt`, `stripePaymentLinkUrl`, `subtotal`, `taxRate`, `taxAmount` columns.
Skip `viewedAt`, `issueDate`, `paymentTerms`, `paidAmount` (not critical, can add later).

---

## Audit Question 5: Is Resend configured?

**YES.** `lib/email/notifications.ts`:
```typescript
const resend = new Resend(process.env.RESEND_API_KEY);
const FROM = process.env.RESEND_FROM_EMAIL || "AM Collective <team@amcollectivecapital.com>";
```

`RESEND_API_KEY` is in `.env.example`. Four notification functions exist.

---

## Audit Question 6: Does an invoices UI page exist?

**YES — Fully built.** `app/(admin)/invoices/page.tsx` is a polished Server Component with:
- 5-col KPI row (MRR, Revenue, Outstanding, Overdue, Active Clients)
- CreateInvoiceDialog (full line item builder in dialog)
- SyncStripeButton, ExportCsvButton
- InvoiceStatusFilter (URL-based filtering)
- Status-colored badges for all 8 states
- Row-level links to `[id]` detail pages

**`app/(admin)/invoices/[id]/page.tsx`** exists with:
- Status badge, amount, client info, dates
- Line items table with footer totals
- InvoiceActions component (Send/Mark Paid buttons)

**`lib/actions/invoices.ts`** exists with:
- createInvoice (with Stripe integration)
- updateInvoice
- sendInvoiceAction
- markPaid

**No API routes exist** — all mutations via Server Actions.

---

## What Already Exists (DO NOT REBUILD)

1. Stripe webhook handler (14 events, idempotent, rate-limited)
2. Vercel webhook handler (deployment lifecycle, HMAC-SHA1 verified)
3. Clerk webhook handler (user lifecycle, Svix verified)
4. Projects webhook handler (per-project hub)
5. Invoice list page with KPI row, filters, CSV export
6. Invoice detail page with status badges, line items table
7. Invoice create dialog with line item builder
8. Server actions: create, update, send, mark-paid
9. check-overdue-invoices Inngest job (escalation + at-risk flagging)
10. Resend email infrastructure

---

## What Needs to Be Built for Phase 17

### Block 1: Webhook Infrastructure (REDUCED SCOPE)
1. ~~Stripe webhook~~ — ALREADY EXISTS
2. ~~Vercel webhook~~ — ALREADY EXISTS
3. Create `lib/webhooks/verify.ts` — shared utility (consolidate pattern)
4. Update Mercury cron to `*/15 * * * *`
5. Add Slack notifications to Stripe webhook for payment events
6. Create `docs/webhook-setup.md`
7. Add `VERCEL_WEBHOOK_SECRET`, `SLACK_WEBHOOK_URL` to `.env.example`

### Block 2: Invoice Builder (REDUCED SCOPE — much already exists)
1. Add missing schema columns: `sentAt`, `stripePaymentLinkUrl`, `subtotal`, `taxRate`, `taxAmount`
2. Create `lib/invoices/number.ts` — auto-generate INV-YYYY-NNN
3. Create `lib/invoices/email.ts` — invoice email HTML builder
4. Add send flow: Stripe payment link generation + Resend email
5. Enhance `InvoiceActions` with: Copy Payment Link, Resend buttons
6. Add Slack notification on newly overdue invoices in check-overdue job
