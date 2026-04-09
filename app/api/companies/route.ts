/**
 * GET  /api/companies  -- list all companies
 * POST /api/companies  -- create a new company (seeds or custom)
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { COMPANY_TAGS } from "@/lib/db/schema/costs";
import { asc } from "drizzle-orm";
import { checkAdmin } from "@/lib/auth";
import { captureError } from "@/lib/errors";
import { createAuditLog } from "@/lib/db/repositories/audit";

const createCompanySchema = z.object({
  slug: z.string().min(1).max(100).regex(/^[a-z0-9-]+$/, "slug must be lowercase alphanumeric with hyphens"),
  name: z.string().min(1).max(300),
  companyTag: z.enum(COMPANY_TAGS),
  description: z.string().max(2000).optional().nullable(),
  domain: z.string().max(255).optional().nullable(),
  logoUrl: z.string().url().max(2000).optional().nullable(),
  primaryColor: z.string().regex(/^#[0-9a-fA-F]{6}$/, "must be a valid hex color").optional().nullable(),
});

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

    return NextResponse.json(companies, {
      headers: { "Cache-Control": "private, max-age=60, stale-while-revalidate=120" },
    });
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

    const parsed = createCompanySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const { slug, name, companyTag, description, domain, logoUrl, primaryColor } = parsed.data;

    const [company] = await db
      .insert(schema.companies)
      .values({
        slug,
        name,
        companyTag,
        description: description ?? null,
        domain: domain ?? null,
        logoUrl: logoUrl ?? null,
        primaryColor: primaryColor ?? null,
      })
      .returning();

    await createAuditLog({
      actorId: userId,
      actorType: "user",
      action: "company.created",
      entityType: "company",
      entityId: company.id,
      metadata: { name, companyTag },
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
