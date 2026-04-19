/**
 * One-shot CRM export — dumps leads, clients, engagements, and lead activities
 * to both JSON and a human-readable markdown summary so Adam can edit and
 * re-import a master list.
 *
 * Usage: npx tsx --env-file=.env.local scripts/export-crm-dump.ts
 */

import { writeFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { db } from "../lib/db";
import { leads, leadActivities } from "../lib/db/schema/leads";
import { clients, engagements } from "../lib/db/schema/crm";
import { desc } from "drizzle-orm";

function centsToDollars(v: number | null | undefined): string {
  if (v === null || v === undefined) return "";
  return `$${(v / 100).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

async function main() {
  const [leadRows, clientRows, engagementRows, activityRows] =
    await Promise.all([
      db.select().from(leads).orderBy(desc(leads.createdAt)),
      db.select().from(clients).orderBy(desc(clients.createdAt)),
      db.select().from(engagements).orderBy(desc(engagements.createdAt)),
      db.select().from(leadActivities).orderBy(desc(leadActivities.createdAt)),
    ]);

  const outDir = resolve(process.cwd(), "exports");
  mkdirSync(outDir, { recursive: true });

  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const jsonPath = resolve(outDir, `crm-dump-${stamp}.json`);
  const mdPath = resolve(outDir, `crm-dump-${stamp}.md`);

  const payload = {
    exportedAt: new Date().toISOString(),
    counts: {
      leads: leadRows.length,
      clients: clientRows.length,
      engagements: engagementRows.length,
      leadActivities: activityRows.length,
    },
    leads: leadRows,
    clients: clientRows,
    engagements: engagementRows,
    leadActivities: activityRows,
  };

  writeFileSync(jsonPath, JSON.stringify(payload, null, 2));

  // Activities grouped by lead
  const activitiesByLead = new Map<string, typeof activityRows>();
  for (const a of activityRows) {
    const arr = activitiesByLead.get(a.leadId) ?? [];
    arr.push(a);
    activitiesByLead.set(a.leadId, arr);
  }

  // Engagements grouped by client
  const engagementsByClient = new Map<string, typeof engagementRows>();
  for (const e of engagementRows) {
    const arr = engagementsByClient.get(e.clientId) ?? [];
    arr.push(e);
    engagementsByClient.set(e.clientId, arr);
  }

  const lines: string[] = [];
  lines.push(`# AM Collective CRM Export`);
  lines.push(`Exported: ${new Date().toISOString()}`);
  lines.push("");
  lines.push(`- Leads: ${leadRows.length}`);
  lines.push(`- Clients: ${clientRows.length}`);
  lines.push(`- Engagements: ${engagementRows.length}`);
  lines.push(`- Lead activities: ${activityRows.length}`);
  lines.push("");

  lines.push(`---`);
  lines.push(`## LEADS (pipeline prospects)`);
  lines.push("");
  if (leadRows.length === 0) lines.push("_No leads._");
  for (const l of leadRows) {
    lines.push(`### ${l.contactName}${l.companyName ? ` — ${l.companyName}` : ""}`);
    lines.push(`- id: ${l.id}`);
    lines.push(`- company_tag: ${l.companyTag}`);
    lines.push(`- stage: ${l.stage}`);
    lines.push(`- source: ${l.source ?? ""}`);
    lines.push(`- assigned_to: ${l.assignedTo ?? ""}`);
    lines.push(`- email: ${l.email ?? ""}`);
    lines.push(`- phone: ${l.phone ?? ""}`);
    lines.push(`- website: ${l.website ?? ""}`);
    lines.push(`- linkedin: ${l.linkedinUrl ?? ""}`);
    lines.push(`- industry: ${l.industry ?? ""}`);
    lines.push(`- company_size: ${l.companySize ?? ""}`);
    lines.push(`- estimated_value: ${centsToDollars(l.estimatedValue)}`);
    lines.push(`- probability: ${l.probability ?? ""}%`);
    lines.push(`- expected_close_date: ${l.expectedCloseDate ?? ""}`);
    lines.push(`- last_contacted_at: ${l.lastContactedAt?.toISOString() ?? ""}`);
    lines.push(`- next_follow_up_at: ${l.nextFollowUpAt?.toISOString() ?? ""}`);
    lines.push(`- tags: ${JSON.stringify(l.tags ?? [])}`);
    lines.push(`- converted_to_client_id: ${l.convertedToClientId ?? ""}`);
    lines.push(`- is_archived: ${l.isArchived}`);
    lines.push(`- created_at: ${l.createdAt.toISOString()}`);
    if (l.notes) {
      lines.push(`- notes: |`);
      for (const n of l.notes.split("\n")) lines.push(`    ${n}`);
    }
    const acts = activitiesByLead.get(l.id) ?? [];
    if (acts.length) {
      lines.push(`- activities:`);
      for (const a of acts) {
        lines.push(
          `  - [${a.createdAt.toISOString()}] ${a.type}${a.content ? `: ${a.content.replace(/\n/g, " ")}` : ""}`
        );
      }
    }
    lines.push("");
  }

  lines.push(`---`);
  lines.push(`## CLIENTS (converted / active)`);
  lines.push("");
  if (clientRows.length === 0) lines.push("_No clients._");
  for (const c of clientRows) {
    lines.push(`### ${c.name}${c.companyName ? ` — ${c.companyName}` : ""}`);
    lines.push(`- id: ${c.id}`);
    lines.push(`- email: ${c.email ?? ""}`);
    lines.push(`- phone: ${c.phone ?? ""}`);
    lines.push(`- website: ${c.website ?? ""}`);
    lines.push(`- portal_access: ${c.portalAccess} (${c.accessLevel})`);
    lines.push(`- clerk_user_id: ${c.clerkUserId ?? ""}`);
    lines.push(`- stripe_customer_id: ${c.stripeCustomerId ?? ""}`);
    lines.push(`- current_mrr: ${centsToDollars(c.currentMrr)}`);
    lines.push(`- lifetime_value: ${centsToDollars(c.lifetimeValue)}`);
    lines.push(`- payment_status: ${c.paymentStatus ?? ""}`);
    lines.push(`- last_payment_date: ${c.lastPaymentDate?.toISOString() ?? ""}`);
    lines.push(`- has_payment_method: ${c.hasPaymentMethod}`);
    lines.push(`- created_at: ${c.createdAt.toISOString()}`);
    if (c.notes) {
      lines.push(`- notes: |`);
      for (const n of c.notes.split("\n")) lines.push(`    ${n}`);
    }
    const engs = engagementsByClient.get(c.id) ?? [];
    if (engs.length) {
      lines.push(`- engagements:`);
      for (const e of engs) {
        lines.push(
          `  - ${e.title} [${e.type}/${e.status}] value=${centsToDollars(e.value)}${e.valuePeriod ? ` ${e.valuePeriod}` : ""} start=${e.startDate ?? ""} end=${e.endDate ?? ""}`
        );
        if (e.description)
          lines.push(`    desc: ${e.description.replace(/\n/g, " ")}`);
      }
    }
    lines.push("");
  }

  lines.push(`---`);
  lines.push(`## ENGAGEMENTS (all, including any without a matching client row above)`);
  lines.push("");
  for (const e of engagementRows) {
    lines.push(`### ${e.title}`);
    lines.push(`- id: ${e.id}`);
    lines.push(`- client_id: ${e.clientId}`);
    lines.push(`- project_id: ${e.projectId ?? ""}`);
    lines.push(`- type: ${e.type}`);
    lines.push(`- status: ${e.status}`);
    lines.push(`- value: ${centsToDollars(e.value)}${e.valuePeriod ? ` ${e.valuePeriod}` : ""}`);
    lines.push(`- start_date: ${e.startDate ?? ""}`);
    lines.push(`- end_date: ${e.endDate ?? ""}`);
    lines.push(`- created_at: ${e.createdAt.toISOString()}`);
    if (e.description) {
      lines.push(`- description: |`);
      for (const n of e.description.split("\n")) lines.push(`    ${n}`);
    }
    lines.push("");
  }

  writeFileSync(mdPath, lines.join("\n"));

  console.log(`Wrote ${jsonPath}`);
  console.log(`Wrote ${mdPath}`);
  console.log(JSON.stringify(payload.counts, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
