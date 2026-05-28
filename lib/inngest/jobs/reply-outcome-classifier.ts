/**
 * Inngest Job — Reply Outcome Classifier
 *
 * Runs daily at 14:00 UTC (~7am Pacific). For every pending training example
 * that's been in flight ≥3 days, classify the downstream outcome:
 *
 *   - WON         → lead booked a meeting OR converted to opportunity in CRM
 *   - PROGRESSED  → lead replied again with positive/neutral sentiment
 *   - DEAD        → no reply within window, conversation stalled
 *   - NEGATIVE    → lead unsubscribed / sent a hostile reply after ours
 *
 * Resolved examples that produced positive outcomes are marked isExemplar=true
 * so they enter the few-shot retrieval pool for future drafts.
 *
 * Also recomputes per-brand voice stats so the voice-locked flag stays fresh.
 */

import { inngest } from "../client";
import { captureError } from "@/lib/errors";
import { db } from "@/lib/db";
import {
  replyTrainingExamples,
  replyOutcomeSignals,
  emailbisonReplies,
} from "@/lib/db/schema";
import { recomputeBrandVoiceStats } from "@/lib/ai/agents/reply-learning";
import { and, eq, gte, isNotNull, lte, sql } from "drizzle-orm";

const OUTCOME_WINDOW_DAYS = 7;        // wait this long after send before deciding
const MAX_PENDING_AGE_DAYS = 21;      // give up after this; mark dead
const DAY_MS = 24 * 60 * 60 * 1000;

export const replyOutcomeClassifier = inngest.createFunction(
  {
    id: "reply-outcome-classifier",
    name: "Reply Outcome Classifier",
    retries: 1,
    onFailure: async ({ error }) => {
      captureError(error, {
        tags: { source: "inngest", job: "reply-outcome-classifier" },
        level: "warning",
      });
    },
  },
  [
    { cron: "0 14 * * *" },                          // daily ~7am Pacific
    { event: "reply-learning/outcome.classify" },
  ],
  async ({ step }) => {
    const now = new Date();
    const windowStart = new Date(now.getTime() - OUTCOME_WINDOW_DAYS * DAY_MS);
    const giveUpBefore = new Date(now.getTime() - MAX_PENDING_AGE_DAYS * DAY_MS);

    const summary = {
      examined: 0,
      won: 0,
      progressed: 0,
      dead: 0,
      negative: 0,
      stillPending: 0,
      exemplarsAdded: 0,
      brandsUpdated: 0,
    };

    // 1. Pull pending examples that have been in flight ≥ OUTCOME_WINDOW_DAYS
    const pending = await step.run("fetch-pending", async () =>
      db
        .select()
        .from(replyTrainingExamples)
        .where(
          and(
            eq(replyTrainingExamples.outcome, "pending"),
            lte(replyTrainingExamples.createdAt, windowStart)
          )
        )
    );

    summary.examined = pending.length;

    // 2. For each, look for downstream signals on the same lead/campaign
    for (const ex of pending) {
      const result = await step.run(`classify-${ex.id}`, async () => {
        // Signal A: did the lead reply AGAIN after we sent?
        // step.run JSON-roundtrips → Date becomes string. Re-hydrate.
        const sentTime = new Date(ex.createdAt as unknown as string);
        const followups = await db
          .select({
            id: emailbisonReplies.id,
            body: emailbisonReplies.body,
            receivedAt: emailbisonReplies.receivedAt,
            isInterested: emailbisonReplies.isInterested,
          })
          .from(emailbisonReplies)
          .where(
            and(
              eq(emailbisonReplies.leadEmail, ex.leadEmail),
              gte(emailbisonReplies.createdAt, sentTime)
            )
          )
          .orderBy(emailbisonReplies.createdAt);

        // Skip the seed reply we already responded to
        const newSignals = followups.filter((f) => f.id !== null);

        // Signal B: was the lead flagged "interested" downstream?
        const anyInterested = newSignals.some((f) => f.isInterested);

        // Signal C: did the conversation continue at all?
        const hasFollowupReply = newSignals.length > 0;

        // Heuristic outcome
        let outcome: "won" | "progressed" | "dead" | "negative";
        let notes: string;

        if (anyInterested) {
          outcome = "won";
          notes = "Lead flagged as interested in EmailBison after our reply.";
        } else if (hasFollowupReply) {
          // Crude sentiment proxy: if the body contains an unsubscribe phrase,
          // negative; else progressed.
          const body = (newSignals[0].body ?? "").toLowerCase();
          const negativeMarkers = [
            "unsubscribe",
            "remove me",
            "stop emailing",
            "not interested",
            "no thanks",
            "we already have",
          ];
          if (negativeMarkers.some((m) => body.includes(m))) {
            outcome = "negative";
            notes = "Lead followed up with a negative or unsubscribe message.";
          } else {
            outcome = "progressed";
            notes = "Lead replied again, conversation progressing.";
          }
        } else if (sentTime < giveUpBefore) {
          outcome = "dead";
          notes = `No follow-up within ${MAX_PENDING_AGE_DAYS} days — marking dead.`;
        } else {
          // Still in the wait window
          return { outcomeSet: false as const, exemplar: false };
        }

        const timeToOutcomeDays = Math.round(
          (now.getTime() - sentTime.getTime()) / DAY_MS
        );

        const isExemplar =
          (outcome === "won" || outcome === "progressed") &&
          ex.editDistance < 0.5 &&
          ex.trainingSource !== "auto_sent";

        await db
          .update(replyTrainingExamples)
          .set({
            outcome,
            outcomeNotes: notes,
            outcomeEvaluatedAt: now,
            timeToOutcomeDays,
            isExemplar,
            updatedAt: now,
          })
          .where(eq(replyTrainingExamples.id, ex.id));

        // Persist the signal for audit
        await db.insert(replyOutcomeSignals).values({
          trainingExampleId: ex.id,
          signalType:
            outcome === "won"
              ? "interested_flag"
              : outcome === "progressed"
                ? "lead_replied"
                : outcome === "negative"
                  ? "negative_reply"
                  : "no_reply_within_window",
          polarity:
            outcome === "won"
              ? 1
              : outcome === "progressed"
                ? 1
                : outcome === "negative"
                  ? -1
                  : 0,
        });

        return { outcomeSet: true as const, outcome, exemplar: isExemplar };
      });

      if (!result.outcomeSet) {
        summary.stillPending++;
        continue;
      }
      if (result.outcome === "won") summary.won++;
      else if (result.outcome === "progressed") summary.progressed++;
      else if (result.outcome === "dead") summary.dead++;
      else if (result.outcome === "negative") summary.negative++;
      if (result.exemplar) summary.exemplarsAdded++;
    }

    // 3. Recompute brand voice stats for every workspace that has examples
    const workspaces = await step.run("list-workspaces", async () =>
      db
        .selectDistinct({ workspace: replyTrainingExamples.workspace })
        .from(replyTrainingExamples)
        .where(isNotNull(replyTrainingExamples.workspace))
    );

    for (const w of workspaces) {
      if (!w.workspace) continue;
      await step.run(`brand-stats-${w.workspace}`, async () =>
        recomputeBrandVoiceStats(w.workspace!)
      );
      summary.brandsUpdated++;
    }

    return { ok: true, ...summary };
  }
);
