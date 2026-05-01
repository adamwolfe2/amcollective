"""
Seed AM Collective cron jobs for the Hermes deployment.

Runs on every container boot from entrypoint.sh. Idempotent — upserts
each job by name, so editing this file and redeploying takes effect
without manual volume edits.

Each job is a Hermes "scheduled prompt" — a natural-language instruction
Hermes will execute on its cron, with full MCP access to AM Collective.

Channels are referenced by Slack channel ID via env vars (set as Fly
secrets) so we don't hardcode channel IDs in the repo:

  SLACK_CHANNEL_AM_COLLECTIVE  — main AM Collective channel
  SLACK_CHANNEL_HEREMES        — heremes channel (proactive updates)
  SLACK_CHANNEL_OPS_ALERTS     — ops alerts channel
  SLACK_CHANNEL_SALES          — sales channel
  SLACK_DM_ADAM                — Adam's user DM (for private updates)

If a channel env var is unset, the job falls back to the default Slack
delivery (whatever channel Hermes was DMed in last; less reliable).
"""

import sys
import os
from pathlib import Path

# Hermes is installed at /opt/hermes-agent
sys.path.insert(0, "/opt/hermes-agent")

os.environ.setdefault("HOME", "/root")

from cron.jobs import load_jobs, save_jobs, create_job  # type: ignore

JOBS_FILE = Path(os.environ.get("HOME", "/root")) / ".hermes" / "cron" / "jobs.json"


def channel(env_name: str) -> str | None:
    """Return a Slack channel id from env, or None if unset."""
    val = os.environ.get(env_name)
    return val.strip() if val and val.strip() else None


def desired_jobs() -> list:
    """Return the canonical list of jobs we want present.

    Each job is upserted by name. Jobs not in this list are left alone
    (so manually-created jobs survive redeploys).
    """
    am_collective_channel = channel("SLACK_CHANNEL_AM_COLLECTIVE")
    heremes_channel = channel("SLACK_CHANNEL_HEREMES")
    ops_alerts_channel = channel("SLACK_CHANNEL_OPS_ALERTS")
    sales_channel = channel("SLACK_CHANNEL_SALES")
    adam_dm = channel("SLACK_DM_ADAM")

    jobs = []

    # ── 1. Morning briefing — weekdays at 8am ──────────────────────────────
    jobs.append(
        create_job(
            name="morning-briefing",
            schedule="0 8 * * 1-5",
            prompt=(
                "Daily morning briefing for AM Collective. Run these MCP calls "
                "in parallel: roadmap.list (wave=top10, limit=5), "
                "email.reply-queue (limit=10), pipeline.next-actions (days=3, "
                "limit=5), invoices.list (status=open or overdue, limit=5), "
                "alerts.open (severity=critical), finance.mrr.\n\n"
                "Synthesize into a single tight digest:\n"
                "1) MRR snapshot\n"
                "2) Top 3 strategic roadmap items active today\n"
                "3) Reply queue: count + intent breakdown ('3 awaiting: 1 interested, 1 question, 1 objection')\n"
                "4) Top 3 client/lead actions due in next 3 days\n"
                "5) Outstanding invoices over $1K\n"
                "6) Critical alerts (skip if none)\n"
                "7) One hard question pushing on the highest-leverage thing Adam might be avoiding\n\n"
                "Format: Slack markdown (*bold*, _italic_), no emojis, under 300 words."
            ),
            deliver="slack",
            slack_channel=adam_dm or heremes_channel,
            enabled_toolsets=["web"],
        )
    )

    # ── 2. Reply queue check — every 2 hours during work hours ────────────
    jobs.append(
        create_job(
            name="reply-queue-check",
            schedule="0 9-18/2 * * 1-5",
            prompt=(
                "Quick reply queue check. Call email.reply-queue (limit=20). "
                "If queue is empty: do not post. If 1-2 drafts: brief mention. "
                "If 3+ drafts: post a summary with intent breakdown and a "
                "link reminder to /email for approval.\n\n"
                "Format: one line per draft, max 4 lines total.\n"
                "Example: 'Reply queue: 4 drafts. *interested*: David (Olander). "
                "*question*: Norman (Trig). *objection*: Brett (POD). *referral*: 1.'\n\n"
                "Only post if there's something actionable. Stay quiet otherwise."
            ),
            deliver="slack",
            slack_channel=adam_dm or heremes_channel,
            enabled_toolsets=["web"],
        )
    )

    # ── 3. EOD checkin — weekdays at 5pm ──────────────────────────────────
    jobs.append(
        create_job(
            name="eod-checkin",
            schedule="0 17 * * 1-5",
            prompt=(
                "End-of-day checkin for AM Collective. Run in parallel: "
                "eos.open-blockers, eos.rocks (status=at_risk), "
                "tasks.next (limit=3, priority=urgent), email.reply-queue (limit=5).\n\n"
                "Format a brief EOD:\n"
                "1) Blockers needing attention (skip if none)\n"
                "2) Rocks moved to at-risk today (skip if none)\n"
                "3) Urgent tasks still open\n"
                "4) Drafts still pending review at end of day\n"
                "5) One sentence on whether tomorrow's calendar covers the top "
                "roadmap items, or a flag if it doesn't\n\n"
                "Under 150 words. Slack markdown, no emojis."
            ),
            deliver="slack",
            slack_channel=adam_dm or heremes_channel,
            enabled_toolsets=["web"],
        )
    )

    # ── 4. Friday week wrap — Friday at 4pm ───────────────────────────────
    jobs.append(
        create_job(
            name="week-wrap",
            schedule="0 16 * * 5",
            prompt=(
                "Friday week wrap for AM Collective. Run: finance.mrr, "
                "finance.revenue-trend, intelligence.weekly-insights, "
                "roadmap.list (wave=top10), invoices.list (status=overdue), "
                "eos.rocks.\n\n"
                "Compose a strategic week-end summary:\n"
                "1) MRR change this week (if available)\n"
                "2) Roadmap progress: which Top 10 tasks shipped, which slipped\n"
                "3) Receivables update: collected this week vs still outstanding\n"
                "4) Rocks status across the portfolio\n"
                "5) The single highest-leverage move for next week\n\n"
                "Format: under 400 words, Slack markdown, no emojis. "
                "End with: 'Bias to action.'"
            ),
            deliver="slack",
            slack_channel=adam_dm or heremes_channel,
            enabled_toolsets=["web"],
        )
    )

    # ── 5. Roadmap drift detector — Monday + Thursday at 7am ───────────────
    jobs.append(
        create_job(
            name="roadmap-drift",
            schedule="0 7 * * 1,4",
            prompt=(
                "Twice-weekly roadmap drift check. Call roadmap.list "
                "(wave=top10, status=open) and tasks.next (priority=urgent).\n\n"
                "Identify roadmap items where:\n"
                "- The due date has passed and the task is still open\n"
                "- The task has slipped 3+ days from any earlier mention in your memory\n"
                "- The task has the same dependency blocker for 2+ weeks\n\n"
                "Post ONLY if drift exists. Format: 'Drift alert: <task> "
                "is N days overdue. Blocker: <dependency or counterparty>. "
                "Suggested action: delegate / kill / nudge <person>.'\n\n"
                "Stay silent if everything is on-track. Adam shouldn't get "
                "noise — only signal."
            ),
            deliver="slack",
            slack_channel=adam_dm or heremes_channel,
            enabled_toolsets=["web"],
        )
    )

    # ── 6. Client blocker sweep — Mondays at 9am ──────────────────────────
    jobs.append(
        create_job(
            name="client-blocker-sweep",
            schedule="0 9 * * 1",
            prompt=(
                "Monday client blocker sweep. Call clients.list and "
                "pipeline.next-actions (days=14). For each client/lead with "
                "a follow-up due in the next 14 days OR with status="
                "'waiting on client', do this:\n\n"
                "1. Skim what we know (last contact, what they owe us, what "
                "we owe them)\n"
                "2. Draft a 2-3 sentence nudge in Adam's voice (short, "
                "lowercase greetings ok, no 'circling back', single direct "
                "ask, end with Cal link if appropriate)\n"
                "3. Call email.create-draft with status=ready and "
                "generated_by='hermes-blocker-sweep'\n\n"
                "Then post a summary to Slack: 'Drafted N nudges this morning. "
                "Review at /email.' Do NOT auto-send. Adam approves.\n\n"
                "Skip clients where contact happened in the last 5 days."
            ),
            deliver="slack",
            slack_channel=adam_dm or heremes_channel,
            enabled_toolsets=["web"],
        )
    )

    return jobs


def main():
    desired = desired_jobs()
    desired_by_name = {j["name"]: j for j in desired}

    existing = load_jobs() or []
    existing_by_name = {j.get("name"): j for j in existing}

    final = []
    upserted = 0
    preserved = 0

    # Upsert all desired jobs (overwrites any existing job with the same name)
    for name, job in desired_by_name.items():
        if name in existing_by_name:
            # Preserve fields the cron engine adds (last_run_at, next_run_at, etc.)
            # but overwrite our authoritative fields (prompt, schedule, channel).
            merged = dict(existing_by_name[name])
            for key in ("prompt", "schedule", "deliver", "slack_channel", "enabled_toolsets"):
                if key in job:
                    merged[key] = job[key]
            final.append(merged)
            upserted += 1
        else:
            final.append(job)
            upserted += 1

    # Preserve any existing jobs we didn't overwrite (manual additions)
    for name, job in existing_by_name.items():
        if name not in desired_by_name:
            final.append(job)
            preserved += 1

    save_jobs(final)

    print(
        f"[seed_crons] Upserted {upserted} canonical job(s); "
        f"preserved {preserved} manually-created job(s); "
        f"total now = {len(final)}."
    )
    for j in final:
        name = j.get("name", "?")
        sched = j.get("schedule_display", j.get("schedule", "?"))
        chan = j.get("slack_channel") or "(default)"
        print(f"  - {name} | schedule: {sched} | channel: {chan}")


if __name__ == "__main__":
    main()
