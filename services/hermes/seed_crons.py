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

JOBS = [
    {
        "name": "morning-briefing",
        # 8am PDT Mon-Fri = 15:00 UTC Mon-Fri
        "schedule": "0 15 * * 1-5",
        "deliver": "slack",
        "enabled_toolsets": ["web"],
        "prompt": (
            "Daily briefing for AM Collective. Pull live data via the MCP server.\n\n"
            "1. Call memory.list-reflections (limit=3) — what you've learned recently.\n"
            "2. In parallel: finance.mrr, alerts.open(severity=critical), "
            "eos.rocks(status=at_risk), email.reply-queue(limit=10), "
            "roadmap.list(wave=top10, limit=3), pipeline.next-actions(days=3, limit=5), "
            "invoices.list(status=overdue, limit=5).\n"
            "3. If any reflection in step 1 is relevant to today's work, factor it in.\n\n"
            "Post:\n"
            "  *AM Collective — <today's date>*\n"
            "  MRR: $X\n"
            "  Reply queue: N drafts (intent breakdown if N>0)\n"
            "  Top 3 strategic items: <from roadmap.list>\n"
            "  Critical alerts: <count + 1-liner, or 'none'>\n"
            "  At-risk rocks: <count + names, or 'none'>\n"
            "  Counterparty actions due: <top 3 with names>\n"
            "  Outstanding invoices: <total $ + count over $1K>\n"
            "  *One hard question:* <push on the highest-leverage thing Adam might be avoiding>\n\n"
            "Hard cap: 250 words. No fluff. No tool-call commentary."
        ),
    },
    {
        "name": "reply-queue-check",
        # 9am, 11am, 1pm, 3pm PDT Mon-Fri = 16,18,20,22 UTC Mon-Fri
        "schedule": "0 16-22/2 * * 1-5",
        "deliver": "slack",
        "enabled_toolsets": ["web"],
        "prompt": (
            "Check the cold-email reply queue.\n\n"
            "1. Call email.reply-queue(limit=20).\n"
            "2. If 0-2 drafts: post nothing — exit silently.\n"
            "3. If 3+ drafts, post:\n"
            "   *Reply queue: N drafts waiting*\n"
            "   <intent breakdown: 'X interested, Y question, Z objection'>\n"
            "   - <leadEmail>: <subject> (intent, conf%)\n"
            "   - ...\n"
            "   Approve at /email\n\n"
            "Hard cap: 120 words. Skip if queue is short."
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
            "1. Parallel calls: eos.open-blockers, eos.rocks(status=at_risk), "
            "alerts.open, email.reply-queue(limit=5), tasks.next(priority=urgent, limit=3).\n\n"
            "2. Post:\n"
            "   *EOD <today's date>*\n"
            "   Blockers: <list, or 'none'>\n"
            "   At-risk rocks: <list, or 'none'>\n"
            "   New alerts: <count, or 'none'>\n"
            "   Reply queue going into tomorrow: <count>\n"
            "   Urgent tasks still open: <count + 1-liner each>\n"
            "   If everything is clean: 'EOD: all clear.'\n\n"
            "3. AFTER posting: call memory.reflect with kind='what_worked' OR "
            "'what_didnt' summarizing the day, IF something notable happened. "
            "Skip the reflect call on uneventful days.\n\n"
            "Hard cap: 180 words."
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
            "1. Parallel: finance.revenue-trend(days=7), intelligence.weekly-insights(limit=5), "
            "eos.rocks, roadmap.list(wave=top10), invoices.list(status=overdue), "
            "memory.list-reflections(limit=10).\n\n"
            "2. Post:\n"
            "   *Week wrap — week of <Monday's date>*\n"
            "   Revenue: <delta + one-line interpretation>\n"
            "   Roadmap: <which Top 10 shipped vs slipped>\n"
            "   Receivables: <collected vs outstanding>\n"
            "   Rocks: <X on track, Y at risk, Z done>\n"
            "   Top 3 insights from this week's reflections: <pulled from memory>\n"
            "   *Next week's #1 priority:* <one-liner derived from above>\n\n"
            "3. AFTER posting: call memory.reflect with kind='pattern_observed' "
            "summarizing any pattern you noticed across the week's interactions.\n\n"
            "Hard cap: 300 words. Bias to action."
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
            "1. Call roadmap.list(wave=top10, status=open) AND tasks.next(priority=urgent).\n"
            "2. Identify drift: tasks past due date and still open, OR same dependency "
            "blocker repeating 2+ weeks.\n"
            "3. If no drift: post nothing — exit silently.\n"
            "4. If drift exists, post:\n"
            "   *Roadmap drift alert*\n"
            "   - <task title>: <N days overdue> · blocker: <dependency or counterparty> · "
            "suggested action: <delegate / kill / nudge person>\n"
            "   - ...\n\n"
            "Hard cap: 150 words. Pure signal — no noise."
        ),
    },
    {
        "name": "client-blocker-sweep",
        # 9am PDT Mon = 16:00 UTC Mon
        "schedule": "0 16 * * 1",
        "deliver": "slack",
        "enabled_toolsets": ["web"],
        "prompt": (
            "Weekly client blocker sweep — auto-draft nudges for waiting clients.\n\n"
            "1. Call pipeline.next-actions(days=14) AND clients.list.\n"
            "2. For each client/lead with status='waiting on client' OR follow-up "
            "due in next 14 days AND last contact >5 days ago:\n"
            "   a. Call memory.recall(category='client_context', tags_any=[<client_name>]) "
            "to load any prior context.\n"
            "   b. Draft 2-3 sentence nudge in Adam's voice: short, lowercase greeting ok, "
            "no 'circling back', single direct ask, end with cal.com/adamwolfe link if "
            "appropriate.\n"
            "   c. Call email.create-draft with status='ready', "
            "generated_by='hermes-blocker-sweep'.\n"
            "3. Post summary to Slack:\n"
            "   *Client blocker sweep — <Monday's date>*\n"
            "   Drafted N nudges for review at /email:\n"
            "   - <client>: <one-line gist of the nudge>\n"
            "   - ...\n"
            "   If nothing was blocked: 'All clients responsive.'\n\n"
            "Do NOT auto-send — Adam approves at /email. Hard cap: 200 words."
        ),
    },
    # ── NEW: proactive self-improvement loop ────────────────────────────────
    {
        "name": "self-reflection",
        # 6:30pm PDT Mon-Fri = 01:30 UTC Tue-Sat
        "schedule": "30 1 * * 2-6",
        "deliver": "slack",
        "enabled_toolsets": ["web"],
        "prompt": (
            "Daily self-reflection. You're at end of day. Look back on what "
            "happened in the last 24h.\n\n"
            "1. Call memory.list-reflections(limit=20) — your existing reflections.\n"
            "2. Skim today's interactions: was there a moment where you got "
            "something wrong, or where a pattern repeated?\n"
            "3. If yes, call memory.reflect with kind='what_worked', "
            "'what_didnt', 'pattern_observed', or 'rule_proposed'. Be specific.\n"
            "4. Post a brief 1-3 line note to Slack ONLY if you logged a "
            "rule_proposed — Adam wants to see those for weekly review:\n"
            "   *Rule proposed:* <the rule>\n"
            "   *Why:* <evidence from today>\n"
            "   *Promote to SOUL.md?* (Adam reviews weekly)\n\n"
            "If you have no notable reflections, do not post. Hard cap: 100 words."
        ),
    },
    # ── NEW: weekly group-chat post to #am-collective ───────────────────────
    {
        "name": "group-chat-update",
        # 9am PDT Tuesday + Thursday = 16:00 UTC Tue/Thu
        "schedule": "0 16 * * 2,4",
        "deliver": "slack",
        "enabled_toolsets": ["web"],
        "prompt": (
            "Twice-weekly proactive update for the team channel. This is "
            "team-wide visibility — Adam, Maggie, anyone in the channel.\n\n"
            "1. Parallel: finance.mrr, eos.rocks, roadmap.list(wave=top10, "
            "limit=3), email.reply-queue, pipeline.next-actions(days=7).\n\n"
            "2. Post a team update:\n"
            "   *AM Collective pulse — <day> <date>*\n"
            "   *MRR:* $X (last delta if known)\n"
            "   *Top 3 strategic moves this week:*\n"
            "   - <#01 from roadmap>: <status>\n"
            "   - <#02>: <status>\n"
            "   - <#03>: <status>\n"
            "   *Rocks:* <X on track / Y at risk>\n"
            "   *Reply queue:* <N awaiting + breakdown>\n"
            "   *Counterparty waits this week:* <top 3>\n"
            "   *Maggie focus:* <pull from memory.recall(tags=['maggie']) — what's on her plate>\n\n"
            "Format with Slack markdown. Hard cap: 350 words. No filler.\n\n"
            "NOTE: This deliberately goes to the home channel — make sure "
            "/hermes sethome was set to a TEAM channel for this job. If it's "
            "set to a DM, the team won't see it."
        ),
    },
    # ── NEW: weekly memory rollup → propose new SOUL.md rules ───────────────
    {
        "name": "memory-rollup",
        # 11am PDT Sunday = 18:00 UTC Sunday
        "schedule": "0 18 * * 0",
        "deliver": "slack",
        "enabled_toolsets": ["web"],
        "prompt": (
            "Weekly memory rollup. Adam reviews this Sunday morning to decide "
            "what gets baked into SOUL.md for next deploy.\n\n"
            "1. Call memory.list-reflections(unpromoted_only=true, limit=30).\n"
            "2. Call memory.recall(category='principal_preference', limit=20) "
            "AND memory.recall(category='decision_log', limit=20).\n\n"
            "3. Group reflections by theme. For each theme with 2+ supporting "
            "reflections, propose ONE candidate rule for SOUL.md.\n\n"
            "4. Post:\n"
            "   *Memory rollup — week of <Monday's date>*\n"
            "   *Rule candidates for promotion:*\n"
            "   1. <rule text> — based on N reflections\n"
            "   2. <rule text> — based on N reflections\n"
            "   ...\n"
            "   *Top new principal preferences logged this week:* <list>\n"
            "   *Strategic decisions logged:* <list>\n\n"
            "Adam, reply with 'promote 1, 3' to bake those into next deploy. "
            "Hard cap: 400 words."
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
