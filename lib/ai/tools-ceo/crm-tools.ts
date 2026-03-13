/**
 * CRM domain tools — create_client, update_client, create_meeting,
 * add_meeting_note, search_leads, update_lead, archive_lead
 */

import type Anthropic from "@anthropic-ai/sdk";
import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { eq, desc, and, ilike, or } from "drizzle-orm";
import { sql } from "drizzle-orm";

export const definitions: Anthropic.Tool[] = [
  {
    name: "create_client",
    description:
      "Create a new client in the system. Use when Adam mentions a company or person that doesn't exist yet and needs to be tracked. Also call this before create_invoice if the client might not exist yet. Returns the new client ID.",
    input_schema: {
      type: "object" as const,
      properties: {
        name: { type: "string", description: "Client's full name or primary contact name" },
        companyName: { type: "string", description: "Company or business name (e.g. 'TBGC', 'Truffles Boys Club')" },
        email: { type: "string", description: "Primary email address (optional)" },
        notes: { type: "string", description: "Any context worth remembering about this client" },
      },
      required: ["name"],
    },
  },
  {
    name: "update_client",
    description:
      "Update an existing client's details: email, phone, company name, or notes. Use when Adam provides new contact info or wants to add context to a client record.",
    input_schema: {
      type: "object" as const,
      properties: {
        clientName: { type: "string", description: "Fuzzy-match to find the client" },
        clientId: { type: "string", description: "Exact client UUID (use if you have it)" },
        email: { type: "string", description: "New primary email" },
        phone: { type: "string", description: "New phone number" },
        companyName: { type: "string", description: "Company name to set/update" },
        notes: { type: "string", description: "Note to append (not replace) to the client's notes field" },
        website: { type: "string", description: "Client website URL" },
      },
      required: [],
    },
  },
  {
    name: "create_meeting",
    description:
      "Schedule a meeting and create the record. Use when Adam says 'schedule a meeting with [client/team] on [date] at [time]' or 'block time for an L10 on [day]'. Returns the meeting ID for future note-taking.",
    input_schema: {
      type: "object" as const,
      properties: {
        title: { type: "string", description: "Meeting title (e.g. 'TBGC Kickoff Call', 'L10 Weekly Meeting')" },
        scheduledDate: { type: "string", description: "Date in YYYY-MM-DD format" },
        scheduledTime: { type: "string", description: "Time in HH:MM 24h format (e.g. '14:00'). Optional — defaults to 09:00." },
        attendees: { type: "string", description: "Comma-separated attendee names (e.g. 'Adam, Maggie, TBGC Client')" },
        notes: { type: "string", description: "Pre-meeting agenda or notes. Optional." },
      },
      required: ["title"],
    },
  },
  {
    name: "add_meeting_note",
    description:
      "Append a quick note to a meeting record by meeting title or client name. Use when Adam wants to capture something from a call.",
    input_schema: {
      type: "object" as const,
      properties: {
        meetingTitle: {
          type: "string",
          description: "Partial meeting title to search for",
        },
        note: { type: "string", description: "Note content to append" },
      },
      required: ["note"],
    },
  },
  {
    name: "search_leads",
    description:
      "Search and list CRM leads by stage, company name, or contact name. Use to answer questions like 'who are our hot leads?' or 'what's the pipeline look like?'",
    input_schema: {
      type: "object" as const,
      properties: {
        stage: {
          type: "string",
          enum: ["awareness", "interest", "consideration", "intent", "closed_won", "closed_lost", "nurture"],
          description: "Filter by pipeline stage",
        },
        search: { type: "string", description: "Search by company or contact name" },
        limit: { type: "number", description: "Max results (default 10)" },
      },
      required: [],
    },
  },
  {
    name: "update_lead",
    description:
      "Move a lead to a new pipeline stage and/or schedule the next follow-up. Use when Adam says a lead moved forward or needs a follow-up.",
    input_schema: {
      type: "object" as const,
      properties: {
        leadId: { type: "string", description: "Exact lead UUID (use if you have it)" },
        companyName: {
          type: "string",
          description: "Company name to search for (case-insensitive). Ignored if leadId provided.",
        },
        stage: {
          type: "string",
          enum: ["awareness", "interest", "consideration", "intent", "closed_won", "closed_lost", "nurture"],
          description: "New pipeline stage",
        },
        nextFollowUpDays: {
          type: "number",
          description: "Set next follow-up N days from now (e.g. 3 = 3 days)",
        },
        notes: {
          type: "string",
          description: "Optional note to append to the lead's notes field",
        },
      },
      required: [],
    },
  },
  {
    name: "archive_lead",
    description:
      "Archive / close a lead. Use when Adam says 'that lead is dead', 'remove [company] from pipeline', or 'lost [lead], archive it'. Sets isArchived to true and optionally moves to closed_lost.",
    input_schema: {
      type: "object" as const,
      properties: {
        companyName: { type: "string", description: "Company or contact name to find the lead" },
        leadId: { type: "string", description: "Exact lead UUID if you have it" },
        reason: { type: "string", description: "Optional reason for archiving (appended to notes)" },
      },
      required: [],
    },
  },
];

export async function handler(
  name: string,
  input: Record<string, unknown>
): Promise<string | undefined> {
  switch (name) {
    case "create_client": {
      // Check for duplicate by name first
      const existing = await db
        .select({ id: schema.clients.id, name: schema.clients.name, companyName: schema.clients.companyName })
        .from(schema.clients)
        .where(
          or(
            ilike(schema.clients.name, `%${input.name}%`),
            input.companyName ? ilike(schema.clients.companyName, `%${input.companyName}%`) : sql`false`,
          )
        )
        .limit(1);

      if (existing.length > 0) {
        return JSON.stringify({
          alreadyExists: true,
          clientId: existing[0].id,
          name: existing[0].name,
          companyName: existing[0].companyName,
          message: `Client already exists — use this ID for invoice creation.`,
        });
      }

      const [client] = await db
        .insert(schema.clients)
        .values({
          name: input.name as string,
          companyName: (input.companyName as string) ?? null,
          email: (input.email as string) ?? null,
          notes: (input.notes as string) ?? null,
        })
        .returning();

      return JSON.stringify({
        created: true,
        clientId: client.id,
        name: client.name,
        companyName: client.companyName,
      });
    }

    case "update_client": {
      let client: { id: string; name: string; notes: string | null } | undefined;
      if (input.clientId) {
        const [c] = await db.select({ id: schema.clients.id, name: schema.clients.name, notes: schema.clients.notes }).from(schema.clients).where(eq(schema.clients.id, input.clientId as string)).limit(1);
        client = c ?? undefined;
      } else if (input.clientName) {
        const [c] = await db
          .select({ id: schema.clients.id, name: schema.clients.name, notes: schema.clients.notes })
          .from(schema.clients)
          .where(or(ilike(schema.clients.name, `%${input.clientName}%`), ilike(schema.clients.companyName, `%${input.clientName}%`)))
          .limit(1);
        client = c ?? undefined;
      }
      if (!client) return JSON.stringify({ error: "Client not found." });

      const updates: Record<string, unknown> = {};
      if (input.email) updates.email = input.email;
      if (input.phone) updates.phone = input.phone;
      if (input.companyName) updates.companyName = input.companyName;
      if (input.website) updates.website = input.website;
      if (input.notes) {
        const ts = new Date().toISOString().split("T")[0];
        updates.notes = client.notes ? `${client.notes}\n[${ts}] ${input.notes}` : `[${ts}] ${input.notes}`;
      }

      if (Object.keys(updates).length === 0) return JSON.stringify({ error: "Nothing to update — provide at least one field." });

      await db.update(schema.clients).set(updates).where(eq(schema.clients.id, client.id));
      return JSON.stringify({ updated: true, clientId: client.id, name: client.name, changes: Object.keys(updates) });
    }

    case "create_meeting": {
      let scheduledAt: Date | null = null;
      if (input.scheduledDate) {
        const timeStr = (input.scheduledTime as string) || "09:00";
        scheduledAt = new Date(`${input.scheduledDate}T${timeStr}:00`);
      }

      const attendeeList = input.attendees
        ? (input.attendees as string).split(",").map((a: string) => ({ name: a.trim() }))
        : [];

      const [meeting] = await db.insert(schema.meetings).values({
        title: input.title as string,
        status: "scheduled",
        scheduledAt,
        attendees: attendeeList.length > 0 ? attendeeList : null,
        notes: (input.notes as string) ?? null,
      }).returning();

      return JSON.stringify({
        created: true,
        meetingId: meeting.id,
        title: meeting.title,
        scheduledAt: scheduledAt?.toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) ?? "TBD",
        attendees: attendeeList.map((a: { name: string }) => a.name),
      });
    }

    case "add_meeting_note": {
      const [meeting] = await db
        .select({ id: schema.meetings.id, title: schema.meetings.title, notes: schema.meetings.notes })
        .from(schema.meetings)
        .where(
          input.meetingTitle
            ? ilike(schema.meetings.title, `%${input.meetingTitle}%`)
            : undefined
        )
        .orderBy(desc(schema.meetings.scheduledAt))
        .limit(1);
      if (!meeting) return JSON.stringify({ error: "Meeting not found." });

      const existing = meeting.notes as string | null;
      const ts = new Date().toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
      const newNotes = existing ? `${existing}\n\n[${ts}] ${input.note}` : `[${ts}] ${input.note}`;
      await db.update(schema.meetings).set({ notes: newNotes }).where(eq(schema.meetings.id, meeting.id));
      return JSON.stringify({ updated: true, meetingId: meeting.id, title: meeting.title });
    }

    case "search_leads": {
      const conditions = [eq(schema.leads.isArchived, false)];
      if (input.stage) {
        conditions.push(eq(schema.leads.stage, input.stage as "awareness" | "interest" | "consideration" | "intent" | "closed_won" | "closed_lost" | "nurture"));
      }

      const baseQuery = db
        .select({
          id: schema.leads.id,
          contactName: schema.leads.contactName,
          companyName: schema.leads.companyName,
          stage: schema.leads.stage,
          nextFollowUpAt: schema.leads.nextFollowUpAt,
        })
        .from(schema.leads)
        .where(and(...conditions))
        .orderBy(desc(schema.leads.updatedAt))
        .limit((input.limit as number) || 10);

      const leads = input.search
        ? await db
            .select({
              id: schema.leads.id,
              contactName: schema.leads.contactName,
              companyName: schema.leads.companyName,
              stage: schema.leads.stage,
              nextFollowUpAt: schema.leads.nextFollowUpAt,
            })
            .from(schema.leads)
            .where(
              and(
                eq(schema.leads.isArchived, false),
                or(
                  ilike(schema.leads.companyName, `%${input.search}%`),
                  ilike(schema.leads.contactName, `%${input.search}%`)
                )
              )
            )
            .orderBy(desc(schema.leads.updatedAt))
            .limit((input.limit as number) || 10)
        : await baseQuery;

      return JSON.stringify({ count: leads.length, leads });
    }

    case "update_lead": {
      let lead;
      if (input.leadId) {
        const [row] = await db
          .select({ id: schema.leads.id, contactName: schema.leads.contactName, companyName: schema.leads.companyName, notes: schema.leads.notes })
          .from(schema.leads)
          .where(eq(schema.leads.id, input.leadId as string))
          .limit(1);
        lead = row;
      } else if (input.companyName) {
        const [row] = await db
          .select({ id: schema.leads.id, contactName: schema.leads.contactName, companyName: schema.leads.companyName, notes: schema.leads.notes })
          .from(schema.leads)
          .where(
            or(
              ilike(schema.leads.companyName, `%${input.companyName}%`),
              ilike(schema.leads.contactName, `%${input.companyName}%`)
            )
          )
          .orderBy(desc(schema.leads.updatedAt))
          .limit(1);
        lead = row;
      }
      if (!lead) return JSON.stringify({ error: "Lead not found." });

      const updates: Record<string, unknown> = {};
      if (input.stage) updates.stage = input.stage;
      if (input.nextFollowUpDays) {
        const d = new Date();
        d.setDate(d.getDate() + (input.nextFollowUpDays as number));
        updates.nextFollowUpAt = d;
      }
      if (input.notes) {
        const existing = lead.notes as string | null;
        const ts = new Date().toISOString().split("T")[0];
        updates.notes = existing ? `${existing}\n[${ts}] ${input.notes}` : `[${ts}] ${input.notes}`;
      }

      if (Object.keys(updates).length === 0) return JSON.stringify({ error: "Nothing to update — provide stage, nextFollowUpDays, or notes." });

      await db.update(schema.leads).set(updates).where(eq(schema.leads.id, lead.id));
      return JSON.stringify({ updated: true, leadId: lead.id, contact: lead.contactName, company: lead.companyName, changes: Object.keys(updates) });
    }

    case "archive_lead": {
      let lead: { id: string; contactName: string; companyName: string | null; notes: string | null } | undefined;
      if (input.leadId) {
        const [l] = await db.select({ id: schema.leads.id, contactName: schema.leads.contactName, companyName: schema.leads.companyName, notes: schema.leads.notes }).from(schema.leads).where(eq(schema.leads.id, input.leadId as string)).limit(1);
        lead = l ?? undefined;
      } else if (input.companyName) {
        const [l] = await db
          .select({ id: schema.leads.id, contactName: schema.leads.contactName, companyName: schema.leads.companyName, notes: schema.leads.notes })
          .from(schema.leads)
          .where(or(ilike(schema.leads.companyName, `%${input.companyName}%`), ilike(schema.leads.contactName, `%${input.companyName}%`)))
          .orderBy(desc(schema.leads.updatedAt))
          .limit(1);
        lead = l ?? undefined;
      }
      if (!lead) return JSON.stringify({ error: "Lead not found." });

      const updates: Record<string, unknown> = { isArchived: true, stage: "closed_lost" };
      if (input.reason) {
        const ts = new Date().toISOString().split("T")[0];
        updates.notes = lead.notes ? `${lead.notes}\n[${ts}] Archived: ${input.reason}` : `[${ts}] Archived: ${input.reason}`;
      }

      await db.update(schema.leads).set(updates).where(eq(schema.leads.id, lead.id));
      return JSON.stringify({ archived: true, leadId: lead.id, contact: lead.contactName, company: lead.companyName });
    }

    default:
      return undefined;
  }
}
