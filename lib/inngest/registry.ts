/**
 * AM Collective — Inngest Job Registry
 *
 * Static manifest of all 41 registered Inngest functions.
 * Used by the /admin/jobs dashboard to show all jobs even before any
 * have executed (so newly deployed jobs are immediately visible).
 *
 * Keep in sync with app/api/inngest/route.ts.
 */

export interface JobRegistration {
  /** Matches function_id column in inngest_run_history */
  id: string;
  name: string;
  /** Cron expression if scheduled, null if event-only */
  cron: string | null;
  /** Event name(s) that trigger this job */
  events: string[];
}

export const JOB_REGISTRY: JobRegistration[] = [
  { id: "sync-vercel-costs",       name: "Sync Vercel Costs",          cron: "0 8 * * *",       events: [] },
  { id: "backfill-mercury",        name: "Backfill Mercury",            cron: null,               events: ["mercury/backfill"] },
  { id: "sync-neon-usage",         name: "Sync Neon Usage",             cron: "30 8 * * *",      events: [] },
  { id: "send-client-reports",     name: "Send Client Reports",         cron: "0 1 * * 1,3,5",   events: [] },
  { id: "embed-documents",         name: "Embed Documents",             cron: "0 3 * * *",       events: [] },
  { id: "morning-briefing",        name: "Morning Briefing",            cron: "0 13 * * 1-5",    events: [] },
  { id: "client-health-check",     name: "Client Health Check",         cron: "0 14 * * 1",      events: [] },
  { id: "weekly-cost-analysis",    name: "Weekly Cost Analysis",        cron: "0 15 * * 1",      events: [] },
  { id: "sync-stripe-full",        name: "Sync Stripe Full",            cron: "0 10 * * *",      events: [] },
  { id: "check-overdue-invoices",  name: "Check Overdue Invoices",      cron: "0 17 * * *",      events: ["billing/check-overdue-invoices"] },
  { id: "sync-vercel-full",        name: "Sync Vercel Full",            cron: "0 9 * * 1,3,5",   events: [] },
  { id: "sync-posthog-analytics",  name: "Sync PostHog Analytics",      cron: "0 10 * * *",      events: [] },
  { id: "sync-mercury",            name: "Sync Mercury",                cron: "0 */6 * * *",     events: [] },
  { id: "snapshot-daily-metrics",  name: "Snapshot Daily Metrics",      cron: "0 4 * * *",       events: [] },
  { id: "invoice-reminders",       name: "Invoice Reminders",           cron: "0 17 * * *",      events: [] },
  { id: "weekly-report",           name: "Weekly Report",               cron: "0 22 * * 0",      events: [] },
  { id: "generate-recurring-invoices", name: "Generate Recurring Invoices", cron: "0 13 * * *", events: ["billing/generate-recurring-invoices"] },
  { id: "weekly-intelligence",     name: "Weekly Intelligence",         cron: "0 14 * * 1",      events: ["intelligence/run-weekly"] },
  { id: "deliver-webhooks",        name: "Deliver Outbound Webhooks",   cron: null,               events: ["app/webhook.fire"] },
  { id: "sync-gmail",              name: "Sync Gmail",                  cron: "0 * * * *",       events: [] },
  { id: "sync-gmail-manual",       name: "Sync Gmail (Manual)",         cron: null,               events: ["gmail/sync.requested"] },
  { id: "triage-linear-issue",     name: "Triage Linear Issue",         cron: null,               events: ["linear/issue.triage"] },
  { id: "sync-trackr",             name: "Sync Trackr",                 cron: "*/30 * * * *",    events: [] },
  { id: "sync-taskspace",          name: "Sync Taskspace",              cron: "*/30 * * * *",    events: [] },
  { id: "sync-wholesail",          name: "Sync Wholesail",              cron: "*/30 * * * *",    events: [] },
  { id: "sync-tbgc",               name: "Sync TBGC",                   cron: "*/30 * * * *",    events: [] },
  { id: "sync-hook",               name: "Sync Hook",                   cron: "*/30 * * * *",    events: [] },
  { id: "sync-cursive",            name: "Sync Cursive",                cron: "*/30 * * * *",    events: [] },
  { id: "sync-project-metrics",    name: "Sync Project Metrics",        cron: null,               events: ["sprint/task.changed", "sprint/metrics.sync"] },
  { id: "sprint-snapshot",         name: "Sprint Snapshot",             cron: "0 2 * * 1",       events: ["sprint/snapshot.requested"] },
  { id: "handle-composio-trigger", name: "Handle Composio Trigger",     cron: null,               events: ["composio/trigger.received"] },
  { id: "handle-composio-expired", name: "Handle Composio Expired",     cron: null,               events: ["composio/account.expired"] },
  { id: "sync-stripe-costs",       name: "Sync Stripe Costs",           cron: "0 6 * * 1",       events: [] },
  { id: "eod-wrap",                name: "EOD Wrap",                    cron: "0 23 * * 1-5",    events: [] },
  { id: "sprint-prep",             name: "Sprint Prep",                 cron: "0 14 * * 1",      events: [] },
  { id: "alert-triage",            name: "Alert Triage",                cron: null,               events: ["alert/created"] },
  { id: "backfill-embeddings",     name: "Backfill Embeddings",         cron: null,               events: ["system/backfill-embeddings"] },
  { id: "strategy-analysis",       name: "Strategy Analysis",           cron: "0 15 * * 1",      events: ["strategy/run-analysis"] },
  { id: "daily-digest",            name: "Daily Digest",                cron: "0 7 * * *",       events: [] },
  { id: "sync-cash-snapshot",      name: "Sync Cash Snapshot",          cron: "30 6 * * *",      events: [] },
  { id: "lead-followup-reminder",  name: "Lead Followup Reminder",      cron: "0 14 * * 1-5",    events: [] },
  { id: "sync-emailbison-inbox",   name: "Sync EmailBison Inbox",       cron: "*/15 * * * *",    events: [] },
  { id: "job-failure-watchdog",    name: "Job Failure Watchdog",        cron: "*/15 * * * *",    events: [] },
];
