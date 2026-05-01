"""
Seed / upsert AM Collective cron jobs for Hermes.

Run from entrypoint.sh on every boot. Idempotent — upserts by job name:
  - Job exists with same name → update schedule/prompt/deliver in place,
    preserving job_id and run history.
  - Job missing → create fresh.
  - Jobs in the live DB but not in JOBS below are LEFT ALONE (so a user
    who creates ad-hoc jobs via /cron command keeps them).

To add or modify jobs: edit JOBS, redeploy. The seeder rewrites the
matching entries on next boot.

Schedules are in UTC (Hermes' default). Pacific times below assume PDT
(UTC-7) which is in effect mid-March → early-November. After DST ends,
all schedules will be one hour earlier in Pacific until DST returns.
Manageable trade-off for a 6-job set.
"""

import os
import sys

sys.path.insert(0, "/opt/hermes-agent")
os.environ.setdefault("HOME", "/root")

from cron.jobs import (  # noqa: E402
    create_job,
    list_jobs,
    update_job,
)


# ─── Job definitions ──────────────────────────────────────────────────────

# All cron jobs MUST pin a model. Without this, hermes' upstream cron
# scheduler passes model="" to the Anthropic API which errors with
# "model: String should have at least 1 character". Default to Haiku
# (10× cheaper than Sonnet/Opus) — these are recurring jobs, cost matters.
JOB_MODEL = "claude-haiku-4-5"
JOB_PROVIDER = "anthropic"


JOBS = [
    {
        "name": "morning-briefing",
        # 8am PDT Mon-Fri = 15:00 UTC Mon-Fri
        "schedule": "0 15 * * 1-5",
        "deliver": "slack",
        "enabled_toolsets": ["web"],
        "prompt": (
            "Daily briefing for AM Collective. Pull live data via the MCP server.\n\n"
            "1. Call finance.mrr — current total MRR.\n"
            "2. Call alerts.open with severity=critical — list any critical alerts.\n"
            "3. Call eos.rocks with status=at_risk — at-risk quarterly goals.\n"
            "4. Call briefing.get-latest — yesterday's briefing for delta context.\n\n"
            "Format the Slack post as:\n"
            "  *AM Collective — <today's date>*\n"
            "  MRR: $X (delta vs yesterday if known)\n"
            "  Critical alerts: <count + 1-line each, or 'none'>\n"
            "  At-risk rocks: <count + names, or 'none'>\n"
            "  Today's priority: <one-liner you derive from above>\n\n"
            "Hard cap: 200 words. No fluff. No restating what tools you called."
        ),
    },
    {
        "name": "reply-queue-check",
        # 9am, 11am, 1pm, 3pm PDT Mon-Fri = 16,18,20,22 UTC Mon-Fri
        "schedule": "0 16-22/2 * * 1-5",
        "deliver": "slack",
        "enabled_toolsets": ["web"],
        "prompt": (
            "Check the reply queue (drafts waiting for Adam or Maggie to send).\n\n"
            "1. Call alerts.open and filter to type='draft_pending' or 'reply_queue' if those types exist.\n"
            "2. If fewer than 3 drafts pending, post nothing — exit silently.\n"
            "3. If 3 or more, post a single Slack message:\n"
            "   *Reply queue: N drafts waiting*\n"
            "   - <client>: <subject> (Xd old)\n"
            "   - ...\n\n"
            "Hard cap: 100 words. Skip the post entirely if the queue is short."
        ),
    },
    {
        "name": "eod-checkin",
        # 5pm PDT Mon-Fri = 00:00 UTC Tue-Sat
        "schedule": "0 0 * * 2-6",
        "deliver": "slack",
        "enabled_toolsets": ["web"],
        "prompt": (
            "End-of-day check-in for AM Collective.\n\n"
            "1. Call eos.open-blockers — unresolved blockers from today's EODs.\n"
            "2. Call eos.rocks with status=at_risk — anything moved to at-risk today.\n"
            "3. Call alerts.open — any new alerts from the day.\n\n"
            "Format:\n"
            "  *EOD <today's date>*\n"
            "  Blockers: <list, or 'none'>\n"
            "  At-risk rocks: <list, or 'none'>\n"
            "  New alerts: <count, or 'none'>\n\n"
            "If everything is clean, post one line: 'EOD: all clear.'\n"
            "Hard cap: 150 words."
        ),
    },
    {
        "name": "week-wrap",
        # 4pm PDT Fri = 23:00 UTC Fri
        "schedule": "0 23 * * 5",
        "deliver": "slack",
        "enabled_toolsets": ["web"],
        "prompt": (
            "Weekly wrap for AM Collective.\n\n"
            "1. Call finance.revenue-trend with days=7 — week's revenue movement.\n"
            "2. Call intelligence.weekly-insights with limit=5 — top weekly insights.\n"
            "3. Call eos.rocks — full quarterly status snapshot.\n\n"
            "Format:\n"
            "  *Week wrap — week of <Monday's date>*\n"
            "  Revenue: <delta + one-line interpretation>\n"
            "  Top 3 insights: <bulleted, derived from weekly-insights>\n"
            "  Rocks status: <X on track, Y at risk, Z done>\n"
            "  *Next week's #1 priority:* <one-liner you derive>\n\n"
            "Hard cap: 250 words. This is the only longer-form weekly post."
        ),
    },
    {
        "name": "roadmap-drift",
        # 7am PDT Mon, Thu = 14:00 UTC Mon, Thu
        "schedule": "0 14 * * 1,4",
        "deliver": "slack",
        "enabled_toolsets": ["web"],
        "prompt": (
            "Roadmap drift check.\n\n"
            "1. Call eos.rocks — get all rocks for the current quarter.\n"
            "2. For each rock with progress < expected (where expected = "
            "weeks_elapsed_in_quarter / 13 * 100):\n"
            "   note the rock name, current progress, expected progress, owner.\n"
            "3. If no rocks are drifting, post nothing — exit silently.\n"
            "4. If any are drifting, post:\n"
            "   *Roadmap drift alert*\n"
            "   - <rock name> (<owner>): <progress>% actual vs <expected>% expected\n"
            "   - ...\n\n"
            "Hard cap: 120 words. Skip post entirely if no drift."
        ),
    },
    {
        "name": "client-blocker-sweep",
        # 9am PDT Mon = 16:00 UTC Mon
        "schedule": "0 16 * * 1",
        "deliver": "slack",
        "enabled_toolsets": ["web"],
        "prompt": (
            "Weekly client blocker sweep.\n\n"
            "1. Call clients.list with active_only=true.\n"
            "2. For each client, call clients.health and look for "
            "summaries containing 'waiting on client' / 'no response' / "
            "'blocked' / 'awaiting feedback'.\n"
            "3. For each match, draft a one-line nudge: which client, "
            "what they're blocking, suggested next action.\n"
            "4. Post:\n"
            "   *Client blocker sweep — <Monday's date>*\n"
            "   - <client>: <one-line nudge> → <action>\n"
            "   - ...\n"
            "If nothing is blocked, post one line: 'All clients responsive.'\n\n"
            "Hard cap: 180 words."
        ),
    },
]


# ─── Upsert ───────────────────────────────────────────────────────────────


def main():
    existing = list_jobs(include_disabled=True)
    by_name = {j.get("name"): j for j in existing if j.get("name")}

    created, updated, kept = 0, 0, 0
    for spec in JOBS:
        name = spec["name"]
        live = by_name.get(name)
        if live is None:
            create_job(
                name=name,
                schedule=spec["schedule"],
                prompt=spec["prompt"],
                deliver=spec["deliver"],
                enabled_toolsets=spec.get("enabled_toolsets"),
                model=JOB_MODEL,
                provider=JOB_PROVIDER,
            )
            created += 1
            print(f"[seed_crons] +created {name}  ({spec['schedule']})")
        else:
            # Build update payload — only include fields we actually want to
            # overwrite so we don't clobber run history or per-job overrides.
            updates = {
                "schedule": spec["schedule"],
                "prompt": spec["prompt"],
                "deliver": spec["deliver"],
                "model": JOB_MODEL,
                "provider": JOB_PROVIDER,
            }
            if spec.get("enabled_toolsets") is not None:
                updates["enabled_toolsets"] = spec["enabled_toolsets"]
            update_job(live["id"], updates)
            updated += 1
            print(f"[seed_crons] ↻updated {name}  ({spec['schedule']})")

    # Don't delete jobs the user added by hand — leave any unrecognized jobs
    # in place. List them so we know they exist.
    spec_names = {s["name"] for s in JOBS}
    other = [j.get("name") for j in existing if j.get("name") not in spec_names]
    for name in other:
        kept += 1
        print(f"[seed_crons] ·preserved (user-added) {name}")

    print(
        f"[seed_crons] done — {created} created, {updated} updated, "
        f"{kept} preserved (total {len(JOBS) + kept})"
    )


if __name__ == "__main__":
    main()
