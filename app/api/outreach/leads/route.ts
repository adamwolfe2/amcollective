/**
 * POST /api/outreach/leads
 *
 * Upload leads to an EmailBison campaign.
 * Accepts a campaignId and a structured leads array.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { checkAdmin } from "@/lib/auth";
import { addLeadsToCampaign } from "@/lib/connectors/emailbison";
import { captureError } from "@/lib/errors";

const leadSchema = z.object({
  email: z.string().email("Invalid email address"),
  firstName: z.string().max(200).optional(),
  lastName: z.string().max(200).optional(),
  company: z.string().max(500).optional(),
  school: z.string().max(500).optional(),
  phone: z.string().max(50).optional(),
  customFields: z.record(z.string(), z.string()).optional(),
});

const bodySchema = z.object({
  campaignId: z.number().int().positive("campaignId must be a positive integer"),
  leads: z.array(leadSchema).min(1, "At least one lead is required").max(1000, "Max 1000 leads per request"),
});

export async function POST(req: NextRequest) {
  const userId = await checkAdmin();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const raw = await req.json().catch(() => null);
    if (!raw) {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const parsed = bodySchema.safeParse(raw);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.flatten() },
        { status: 422 }
      );
    }

    const { campaignId, leads } = parsed.data;

    // Map to EmailBison wire format
    const bisonLeads = leads.map((l) => {
      const custom: Record<string, string> = { ...l.customFields };
      if (l.school) custom["school"] = l.school;
      if (l.phone) custom["phone"] = l.phone;

      return {
        email: l.email,
        ...(l.firstName ? { first_name: l.firstName } : {}),
        ...(l.lastName ? { last_name: l.lastName } : {}),
        ...(l.company ? { company: l.company } : {}),
        ...(Object.keys(custom).length > 0 ? { custom_fields: custom } : {}),
      };
    });

    const result = await addLeadsToCampaign(campaignId, bisonLeads);

    return NextResponse.json({
      success: true,
      added: result.added,
      duplicates: result.duplicates,
      errors: result.errors,
    });
  } catch (error) {
    captureError(error, { tags: { component: "outreach-leads-upload" } });
    const msg = error instanceof Error ? error.message : "Upload failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
