/**
 * Setup Checklist API — GET /api/admin/setup-checklist
 *
 * Returns the completion status of each onboarding step.
 * Used by the SetupChecklist component on the dashboard.
 */

import { NextResponse } from "next/server";
import { checkAdmin } from "@/lib/auth";
import { captureError } from "@/lib/errors";
import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { count } from "drizzle-orm";

export const runtime = "nodejs";

export interface ChecklistItem {
  key: string;
  label: string;
  complete: boolean;
  href: string;
}

export interface SetupChecklistResponse {
  items: ChecklistItem[];
  completedCount: number;
  totalCount: number;
  allComplete: boolean;
}

export async function GET() {
  const userId = await checkAdmin();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const [clientCountResult, teamCountResult, sprintCountResult] =
      await Promise.allSettled([
        db.select({ value: count() }).from(schema.clients),
        db.select({ value: count() }).from(schema.teamMembers),
        db.select({ value: count() }).from(schema.weeklySprints),
      ]);

    const clientCount =
      clientCountResult.status === "fulfilled"
        ? (clientCountResult.value[0]?.value ?? 0)
        : 0;

    const teamCount =
      teamCountResult.status === "fulfilled"
        ? (teamCountResult.value[0]?.value ?? 0)
        : 0;

    const sprintCount =
      sprintCountResult.status === "fulfilled"
        ? (sprintCountResult.value[0]?.value ?? 0)
        : 0;

    const stripeConnected = !!(process.env.STRIPE_SECRET_KEY);
    const mercuryConnected = !!(process.env.MERCURY_API_KEY);
    const resendConnected = !!(process.env.RESEND_API_KEY);
    const clientCreated = clientCount > 0;
    const teamMemberInvited = teamCount > 0;
    const sprintCreated = sprintCount > 0;

    const items: ChecklistItem[] = [
      {
        key: "stripe",
        label: "Connect Stripe",
        complete: stripeConnected,
        href: "/settings/integrations",
      },
      {
        key: "mercury",
        label: "Connect Mercury",
        complete: mercuryConnected,
        href: "/settings/integrations",
      },
      {
        key: "resend",
        label: "Configure Resend email",
        complete: resendConnected,
        href: "/settings/integrations",
      },
      {
        key: "client",
        label: "Create first client",
        complete: clientCreated,
        href: "/clients",
      },
      {
        key: "team",
        label: "Add a team member",
        complete: teamMemberInvited,
        href: "/settings/team",
      },
      {
        key: "sprint",
        label: "Create first sprint",
        complete: sprintCreated,
        href: "/sprints",
      },
    ];

    const completedCount = items.filter((i) => i.complete).length;
    const totalCount = items.length;
    const allComplete = completedCount === totalCount;

    return NextResponse.json({
      items,
      completedCount,
      totalCount,
      allComplete,
    } satisfies SetupChecklistResponse);
  } catch (err) {
    captureError(err, { tags: { route: "GET /api/admin/setup-checklist" } });
    return NextResponse.json(
      { error: "Failed to fetch setup checklist" },
      { status: 500 }
    );
  }
}
