"""
Seed initial cron jobs for AM Collective Hermes deployment.
Run once on first boot from entrypoint.sh before the gateway starts.
Uses the same cron.jobs API the gateway itself uses.
"""

import sys
import os
from pathlib import Path

# Hermes is installed at /opt/hermes-agent
sys.path.insert(0, "/opt/hermes-agent")

os.environ.setdefault("HOME", "/root")

from cron.jobs import load_jobs, save_jobs, create_job

JOBS_FILE = Path(os.environ.get("HOME", "/root")) / ".hermes" / "cron" / "jobs.json"


def main():
    # Only seed if no jobs exist yet
    existing = load_jobs()
    if existing:
        print(f"[seed_crons] {len(existing)} job(s) already exist — skipping seed.")
        return

    print("[seed_crons] No jobs found — seeding initial cron jobs...")

    # ── Morning briefing: weekdays at 8am ──────────────────────────────────
    morning = create_job(
        name="morning-briefing",
        schedule="0 8 * * 1-5",
        prompt=(
            "You are the daily briefing agent for AM Collective. "
            "Call the MCP tool briefing.get-latest to fetch today's briefing. "
            "Then call alerts.open with severity=critical to check for critical alerts. "
            "Then call finance.mrr to get current MRR. "
            "Format a clean digest with: "
            "1) Today's date as a header. "
            "2) MRR with a delta note if available. "
            "3) Any critical alerts (skip if none). "
            "4) The briefing content (summarize if long). "
            "5) One actionable priority for the day. "
            "Keep it under 300 words. Use Slack markdown (*bold*, _italic_)."
        ),
        deliver="slack",
        enabled_toolsets=["web"],  # plus MCP tools are always available
    )

    # ── EOD check-in: weekdays at 6pm ─────────────────────────────────────
    eod = create_job(
        name="eod-checkin",
        schedule="0 18 * * 1-5",
        prompt=(
            "It's end of day for AM Collective. "
            "Call eos.open-blockers to check for any unresolved blockers from today's EOD reports. "
            "Call eos.rocks with status=at_risk to surface any at-risk quarterly goals. "
            "Format a brief EOD summary: "
            "1) Any blockers that need attention (skip if none). "
            "2) Any rocks that have moved to at-risk today (skip if none). "
            "3) If everything looks good, say so in one line. "
            "Keep it under 150 words. Use Slack markdown."
        ),
        deliver="slack",
        enabled_toolsets=["web"],
    )

    jobs = [morning, eod]
    save_jobs(jobs)

    print(f"[seed_crons] Created {len(jobs)} cron jobs:")
    for j in jobs:
        print(f"  - {j['name']} | schedule: {j.get('schedule_display', j['schedule'])} | next: {j.get('next_run_at', '?')}")


if __name__ == "__main__":
    main()
