/**
 * Inngest Job — Pipeline Hygiene Agent (2026-07 CRM refresh)
 *
 * Monday 4 PM UTC. Enforces: every Active/Proposal/Prospect row must have
 * next_step + a recent last_step_date + an owner. Flags violations and stale
 * high-value rows to Slack. Nothing active is allowed to have no next step.
 *
 * Spec: .claude/specs/2026-07-02-crm-refresh.md §3.4
 */

import { inngest } from "../client";
import { captureError } from "@/lib/errors";
import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { and, eq, inArray } from "drizzle-orm";
import { notifySlack } from "@/lib/webhooks/slack";

const HIGH_VALUE_CENTS = 10_000_00; // $10K+

export const pipelineHygiene = inngest.createFunction(
  {
    id: "pipeline-hygiene",
    name: "Pipeline Hygiene Agent",
    retries: 1,
    onFailure: async ({ error }) => {
      captureError(error, {
        tags: { source: "inngest", job: "pipeline-hygiene" },
        level: "error",
      });
    },
  },
  { cron: "0 16 * * 1" }, // Monday 4 PM UTC = 11 AM CT
  async ({ step }) => {
    const rows = await step.run("load-open-rows", async () => {
      return db
        .select({
          id: schema.leads.id,
          contactName: schema.leads.contactName,
          companyName: schema.leads.companyName,
          stage: schema.leads.stage,
          priority: schema.leads.priority,
          assignedTo: schema.leads.assignedTo,
          nextStep: schema.leads.nextStep,
          nextFollowUpAt: schema.leads.nextFollowUpAt,
          lastStepDate: schema.leads.lastStepDate,
          totalValue: schema.leads.totalValue,
          estimatedValue: schema.leads.estimatedValue,
          dataConfidence: schema.leads.dataConfidence,
          tags: schema.leads.tags,
        })
        .from(schema.leads)
        .where(
          and(
            eq(schema.leads.isArchived, false),
            inArray(schema.leads.stage, ["active", "proposal", "prospect"])
          )
        );
    });

    const real = rows.filter(
      (r) =>
        !(Array.isArray(r.tags) && (r.tags.includes("backlog") || r.tags.includes("placeholder")))
    );

    const missingNextStep = real.filter((r) => !r.nextStep);
    const missingOwner = real.filter((r) => !r.assignedTo);
    const missingDate = real.filter((r) => !r.nextFollowUpAt && !r.lastStepDate);
    const staleHighValue = real.filter((r) => {
      const value = r.totalValue ?? r.estimatedValue ?? 0;
      if (value < HIGH_VALUE_CENTS) return false;
      if (!r.lastStepDate) return true;
      const days = Math.floor(
        (Date.now() - new Date(r.lastStepDate).getTime()) / 86_400_000
      );
      return days > 14;
    });

    const violations =
      missingNextStep.length + missingOwner.length + missingDate.length;

    if (violations === 0 && staleHighValue.length === 0) {
      return { violations: 0, staleHighValue: 0 };
    }

    await step.run("post-slack-hygiene", async () => {
      const name = (r: (typeof real)[number]) => r.companyName ?? r.contactName;
      const sections: string[] = [];

      if (missingNextStep.length > 0) {
        sections.push(
          `*No next step (${missingNextStep.length}):* ${missingNextStep.map(name).join(", ")}`
        );
      }
      if (missingDate.length > 0) {
        sections.push(
          `*No follow-up date (${missingDate.length}):* ${missingDate.map(name).join(", ")}`
        );
      }
      if (missingOwner.length > 0) {
        sections.push(
          `*No owner (${missingOwner.length}):* ${missingOwner.map(name).join(", ")}`
        );
      }
      if (staleHighValue.length > 0) {
        sections.push(
          `*Stale high-value ($10K+, >14d):* ${staleHighValue
            .map(
              (r) =>
                `${name(r)} ($${(((r.totalValue ?? r.estimatedValue) ?? 0) / 100).toLocaleString()})`
            )
            .join(", ")}`
        );
      }

      await notifySlack(
        `*Pipeline hygiene — ${violations} violation(s), ${staleHighValue.length} stale high-value row(s).*\n${sections.join("\n")}\n\n<https://amcollective.vercel.app/leads|Fix in tracker →>`
      );
    });

    return { violations, staleHighValue: staleHighValue.length };
  }
);
