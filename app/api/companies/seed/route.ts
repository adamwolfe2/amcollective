/**
 * POST /api/companies/seed -- seeds the companies table from the existing companyTag enum values.
 * Idempotent: uses onConflictDoNothing.
 */

import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { checkAdmin } from "@/lib/auth";
import { captureError } from "@/lib/errors";

const SEED_COMPANIES = [
  { slug: "am-collective", name: "AM Collective", companyTag: "am_collective" as const, domain: "amcollectivecapital.com" },
  { slug: "trackr", name: "Trackr", companyTag: "trackr" as const, domain: "trytrackr.com" },
  { slug: "wholesail", name: "Wholesail", companyTag: "wholesail" as const, domain: "wholesailhub.com" },
  { slug: "taskspace", name: "TaskSpace", companyTag: "taskspace" as const, domain: "trytaskspace.com" },
  { slug: "cursive", name: "Cursive", companyTag: "cursive" as const, domain: "meetcursive.com" },
  { slug: "tbgc", name: "TBGC", companyTag: "tbgc" as const, domain: null },
  { slug: "hook", name: "Hook", companyTag: "hook" as const, domain: "hookugc.com" },
  { slug: "personal", name: "Personal", companyTag: "personal" as const, domain: null },
  { slug: "untagged", name: "Untagged", companyTag: "untagged" as const, domain: null },
];

export async function POST() {
  try {
    const userId = await checkAdmin();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const results = await db
      .insert(schema.companies)
      .values(SEED_COMPANIES)
      .onConflictDoNothing({ target: schema.companies.companyTag })
      .returning();

    return NextResponse.json({
      seeded: results.length,
      total: SEED_COMPANIES.length,
      companies: results.map((c) => ({ id: c.id, name: c.name, companyTag: c.companyTag })),
    });
  } catch (error) {
    captureError(error);
    return NextResponse.json(
      { error: "Failed to seed companies" },
      { status: 500 }
    );
  }
}
