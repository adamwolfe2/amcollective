/**
 * GET  /api/companies  -- list all companies
 * POST /api/companies  -- create a new company (seeds or custom)
 */

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { asc } from "drizzle-orm";
import { checkAdmin } from "@/lib/auth";
import { captureError } from "@/lib/errors";
import { createAuditLog } from "@/lib/db/repositories/audit";

export async function GET() {
  try {
    const userId = await checkAdmin();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const companies = await db
      .select()
      .from(schema.companies)
      .orderBy(asc(schema.companies.name))
      .limit(200);

    return NextResponse.json(companies);
  } catch (error) {
    captureError(error);
    return NextResponse.json(
      { error: "Failed to list companies" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const userId = await checkAdmin();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();

    const [company] = await db
      .insert(schema.companies)
      .values({
        slug: body.slug,
        name: body.name,
        companyTag: body.companyTag,
        description: body.description ?? null,
        domain: body.domain ?? null,
        logoUrl: body.logoUrl ?? null,
        primaryColor: body.primaryColor ?? null,
      })
      .returning();

    await createAuditLog({
      actorId: userId,
      actorType: "user",
      action: "company.created",
      entityType: "company",
      entityId: company.id,
      metadata: { name: company.name, companyTag: company.companyTag },
    });

    return NextResponse.json(company, { status: 201 });
  } catch (error) {
    captureError(error);
    return NextResponse.json(
      { error: "Failed to create company" },
      { status: 500 }
    );
  }
}
