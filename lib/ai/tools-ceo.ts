/**
 * CEO Agent Tools — ClaudeBot-specific extensions
 *
 * Extends the base TOOL_DEFINITIONS with CEO-only capabilities:
 * memory management, proactive messaging, delegation, and company snapshots.
 *
 * Uses the Anthropic SDK tool format (not Vercel AI SDK).
 */

import type Anthropic from "@anthropic-ai/sdk";
import { readMemory, writeMemory, listMemory, searchMemory } from "./memory";
import { sendMessage as blooSendMessage } from "@/lib/integrations/blooio";
import { setMemory, getAllMemory } from "@/lib/db/repositories/bot-memory";
import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { eq, desc, and, ilike, or } from "drizzle-orm";
import { sql, count } from "drizzle-orm";

// ─── Tool Definitions ────────────────────────────────────────────────────────

export const CEO_TOOL_DEFINITIONS: Anthropic.Tool[] = [
  {
    name: "write_memory",
    description:
      "Write or update a file in the persistent knowledge base. Use this to remember important decisions, preferences, context, or facts from conversations. Good candidates: architectural decisions, user preferences, company priorities, client context, recurring patterns.",
    input_schema: {
      type: "object" as const,
      properties: {
        path: {
          type: "string",
          description:
            "File path in the knowledge repo. Use descriptive paths like 'decisions/2026-03-async-preference.md', 'notes/tbgc-renewal-context.md', 'people/adam.md'",
        },
        content: {
          type: "string",
          description: "Full markdown content to write to the file",
        },
        summary: {
          type: "string",
          description: "One-line commit message summarizing what was remembered",
        },
      },
      required: ["path", "content", "summary"],
    },
  },
  {
    name: "read_memory",
    description:
      "Read a specific file from the persistent knowledge base. Use this to recall previously stored context, decisions, or notes.",
    input_schema: {
      type: "object" as const,
      properties: {
        path: {
          type: "string",
          description: "File path to read, e.g. 'people/adam.md' or 'company/strategy.md'",
        },
      },
      required: ["path"],
    },
  },
  {
    name: "list_memories",
    description:
      "List files in the knowledge base. Use to discover what has been remembered previously.",
    input_schema: {
      type: "object" as const,
      properties: {
        prefix: {
          type: "string",
          description:
            "Optional directory prefix to list, e.g. 'decisions/', 'notes/', 'people/'",
        },
      },
      required: [],
    },
  },
  {
    name: "search_memory",
    description:
      "Semantically search the knowledge base for relevant memories. Use this at the start of complex conversations to recall relevant context.",
    input_schema: {
      type: "object" as const,
      properties: {
        query: { type: "string", description: "Search query" },
        limit: { type: "number", description: "Max results (default 5)" },
      },
      required: ["query"],
    },
  },
  {
    name: "write_bot_memory",
    description:
      "Write or update a persistent structured fact in bot_memory — injected into EVERY future prompt. Use for short, stable facts that should always be available: preferences, baselines, decisions, project status, recurring patterns. NOT for session-specific context or data that changes daily.",
    input_schema: {
      type: "object" as const,
      properties: {
        key: {
          type: "string",
          description: "Short snake_case key, e.g. 'tbgc_build_issue', 'adam_sprint_preference', 'cursive_mrr_baseline'",
        },
        value: {
          type: "string",
          description: "The fact to remember. Be specific and include dates when relevant.",
        },
        category: {
          type: "string",
          description: "Category for grouping: 'operations', 'finance', 'people', 'preferences', 'portfolio', 'general'",
        },
      },
      required: ["key", "value"],
    },
  },
  {
    name: "read_bot_memory",
    description: "Read all persistent bot_memory facts. Use to review what structured facts are currently stored.",
    input_schema: {
      type: "object" as const,
      properties: {},
      required: [],
    },
  },
  {
    name: "send_to_slack",
    description:
      "Send a proactive Slack message to a channel or user. Use for notifications, alerts, or updates that should be shared in Slack.",
    input_schema: {
      type: "object" as const,
      properties: {
        channel: {
          type: "string",
          description: "Slack channel ID (C...) or user ID (U...) for DM",
        },
        message: { type: "string", description: "Message text (markdown supported)" },
        thread_ts: {
          type: "string",
          description: "Optional thread timestamp to reply in a thread",
        },
      },
      required: ["channel", "message"],
    },
  },
  {
    name: "send_sms",
    description:
      "Send an SMS/iMessage to Adam or Maggie via Bloo.io. Use for urgent notifications or when explicitly asked to send a text message.",
    input_schema: {
      type: "object" as const,
      properties: {
        to: {
          type: "string",
          enum: ["adam", "maggie"],
          description: "Recipient: 'adam' or 'maggie'",
        },
        message: { type: "string", description: "Message text to send" },
      },
      required: ["to", "message"],
    },
  },
  {
    name: "create_delegation",
    description:
      "Create a task and assign it to a team member, with optional Slack notification. Use when asked to delegate work to someone.",
    input_schema: {
      type: "object" as const,
      properties: {
        assignee: {
          type: "string",
          description: "Name of the person to assign to (e.g. 'Maggie', 'Adam')",
        },
        title: { type: "string", description: "Task title" },
        description: { type: "string", description: "Detailed task description" },
        priority: {
          type: "string",
          enum: ["low", "medium", "high", "urgent"],
          description: "Task priority (default: medium)",
        },
        dueDate: {
          type: "string",
          description: "Due date in YYYY-MM-DD format (optional)",
        },
        notifySlack: {
          type: "boolean",
          description: "Whether to send a Slack notification (default: true)",
        },
      },
      required: ["assignee", "title"],
    },
  },
  {
    name: "get_company_snapshot",
    description:
      "Get a comprehensive real-time snapshot of the company: MRR, cash, sprint status, active leads, overdue items, alerts. Call this first when answering broad company status questions.",
    input_schema: {
      type: "object" as const,
      properties: {},
      required: [],
    },
  },
  {
    name: "get_current_sprint",
    description:
      "Get the current week's sprint in full detail — title, focus, sections, and all tasks with completion status.",
    input_schema: {
      type: "object" as const,
      properties: {},
      required: [],
    },
  },
  {
    name: "update_sprint_note",
    description:
      "Update the top-of-mind note on the current sprint. Use when asked to jot something down or update the sprint focus.",
    input_schema: {
      type: "object" as const,
      properties: {
        sprintId: { type: "string", description: "Sprint ID to update" },
        note: {
          type: "string",
          description: "New top-of-mind content (appends, does not replace)",
        },
      },
      required: ["sprintId", "note"],
    },
  },
  {
    name: "update_task_status",
    description:
      "Update the status of a task by title (fuzzy match) or by ID. Use when Adam says a task is done, blocked, or in progress.",
    input_schema: {
      type: "object" as const,
      properties: {
        taskTitle: {
          type: "string",
          description: "Partial title to search for (case-insensitive). Ignored if taskId is provided.",
        },
        taskId: { type: "string", description: "Exact task UUID (use if you have it)" },
        status: {
          type: "string",
          enum: ["backlog", "todo", "in_progress", "in_review", "done", "cancelled"],
          description: "New status",
        },
      },
      required: ["status"],
    },
  },
  {
    name: "update_rock_status",
    description:
      "Update the status of a quarterly rock (goal) by title or ID. Use when Adam says a rock is on track, at risk, or complete.",
    input_schema: {
      type: "object" as const,
      properties: {
        rockTitle: {
          type: "string",
          description: "Partial rock title to search for (case-insensitive). Ignored if rockId is provided.",
        },
        rockId: { type: "string", description: "Exact rock UUID (use if you have it)" },
        status: {
          type: "string",
          enum: ["on_track", "at_risk", "off_track"],
          description: "New status",
        },
      },
      required: ["status"],
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
    name: "create_rock",
    description:
      "Create a new quarterly rock (90-day goal). Use when Adam sets a new quarterly objective. Quarter format: 'Q1 2026', 'Q2 2026', etc.",
    input_schema: {
      type: "object" as const,
      properties: {
        title: { type: "string", description: "Rock title / goal statement" },
        description: { type: "string", description: "Optional detail on what success looks like" },
        quarter: { type: "string", description: "Quarter string, e.g. 'Q2 2026'. Default to current quarter if not specified." },
        projectName: { type: "string", description: "Optional portfolio project name to link (TBGC, Trackr, Cursive, TaskSpace, Wholesail, Hook)" },
        dueDateDays: { type: "number", description: "Days from now for the due date (default: end of quarter)" },
      },
      required: ["title"],
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
    name: "close_sprint",
    description:
      "Mark the current sprint as complete and take a snapshot for velocity tracking. Call this at end of week before creating a new sprint. This enables Phase 3 sprint velocity intelligence.",
    input_schema: {
      type: "object" as const,
      properties: {
        sprintId: { type: "string", description: "Sprint ID to close. If not provided, closes the most recent sprint." },
        retrospective: { type: "string", description: "Optional brief retro note to store on the sprint" },
      },
      required: [],
    },
  },
  {
    name: "create_sprint",
    description:
      "Create a new weekly sprint. Call after closing the previous one. Focus should be 1 sentence max — what is this week actually about?",
    input_schema: {
      type: "object" as const,
      properties: {
        title: { type: "string", description: "Sprint title, e.g. '3/10 Week Sprint'" },
        weeklyFocus: { type: "string", description: "1-sentence focus for the week" },
        weekOf: { type: "string", description: "Monday's date in YYYY-MM-DD format" },
      },
      required: ["title"],
    },
  },
  {
    name: "get_portfolio_snapshot",
    description:
      "Get a unified snapshot across all 6 portfolio products: Wholesail, Trackr, Cursive, TaskSpace, TBGC, Hook. Returns MRR, user counts, pipeline, and health per product in one call. Use when asked about 'all products', 'portfolio', 'across platforms', or any multi-product question.",
    input_schema: {
      type: "object" as const,
      properties: {
        platform: {
          type: "string",
          enum: ["all", "wholesail", "trackr", "cursive", "taskspace"],
          description: "Which platform to fetch. 'all' returns all 4 connected platforms in parallel.",
        },
      },
      required: [],
    },
  },
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
    name: "create_invoice",
    description:
      "Create an invoice for a client and add it to pending revenue. Use when Adam says a client owes money, has a pending invoice, or needs to be billed. Automatically finds or creates the client by name. Status defaults to 'open' (pending payment). Returns the invoice ID and a portal link.",
    input_schema: {
      type: "object" as const,
      properties: {
        clientName: {
          type: "string",
          description: "Client or company name — will fuzzy-match against existing clients or create a new one",
        },
        amountDollars: {
          type: "number",
          description: "Invoice amount in dollars (e.g. 30000 for $30,000)",
        },
        description: {
          type: "string",
          description: "What this invoice is for (e.g. 'TBGC portal build — Phase 1')",
        },
        status: {
          type: "string",
          enum: ["draft", "open", "sent"],
          description: "Invoice status. 'open' = pending payment (default). 'draft' = not yet sent. 'sent' = sent to client.",
        },
        dueDateDays: {
          type: "number",
          description: "Days from today until payment is due (e.g. 30). Defaults to 30.",
        },
        notes: {
          type: "string",
          description: "Optional internal notes to attach to the invoice",
        },
      },
      required: ["clientName", "amountDollars"],
    },
  },
  // ─── Tasks & Sprint ────────────────────────────────────────────────────────
  {
    name: "create_task",
    description:
      "Create a new task and optionally add it to the current sprint. Use when Adam says 'add a task', 'create a ticket', or 'put X on the list'. Can link to a portfolio project by name. Set addToCurrentSprint: true to immediately drop it into this week's sprint.",
    input_schema: {
      type: "object" as const,
      properties: {
        title: { type: "string", description: "Task title" },
        description: { type: "string", description: "Optional detail" },
        priority: { type: "string", enum: ["low", "medium", "high", "urgent"], description: "Default: medium" },
        projectName: { type: "string", description: "Portfolio project to link (TBGC, Trackr, Cursive, TaskSpace, Wholesail, Hook). Fuzzy matched." },
        assigneeName: { type: "string", description: "Team member to assign to (Adam, Maggie). Optional." },
        dueDateDays: { type: "number", description: "Days from today until due. Optional." },
        addToCurrentSprint: { type: "boolean", description: "If true, adds the task to the current week's sprint. Default: false." },
      },
      required: ["title"],
    },
  },
  {
    name: "add_task_to_sprint",
    description:
      "Add an existing task to the current sprint by title (fuzzy match) or ID. Also use this to move a task from backlog into this week's sprint. Optionally creates a sprint section for the project if it doesn't exist.",
    input_schema: {
      type: "object" as const,
      properties: {
        taskTitle: { type: "string", description: "Partial task title to search for" },
        taskId: { type: "string", description: "Exact task UUID (use if you have it)" },
        sectionProjectName: { type: "string", description: "Which project section to add it under. If omitted, adds to first section or creates a General section." },
      },
      required: [],
    },
  },
  {
    name: "create_sprint_section",
    description:
      "Add a new project section to the current sprint. Use when Adam says 'add a [ProjectName] section to the sprint' or 'start tracking [project] in this sprint'.",
    input_schema: {
      type: "object" as const,
      properties: {
        projectName: { type: "string", description: "Portfolio project name (TBGC, Trackr, Cursive, etc.) or any free-text section name" },
        goal: { type: "string", description: "Optional goal / focus sentence for this section" },
        assigneeName: { type: "string", description: "Assignee for this section (Adam or Maggie). Optional." },
      },
      required: ["projectName"],
    },
  },
  // ─── Alerts ────────────────────────────────────────────────────────────────
  {
    name: "resolve_alert",
    description:
      "Mark an alert as resolved. Use when Adam says 'that's fixed', 'close that alert', or 'mark [issue] resolved'. Searches by partial title. Can also snooze instead of resolving.",
    input_schema: {
      type: "object" as const,
      properties: {
        alertTitle: { type: "string", description: "Partial alert title to search for" },
        alertId: { type: "string", description: "Exact alert UUID (use if you have it)" },
        snoozeHours: { type: "number", description: "If set, snooze the alert for this many hours instead of resolving it" },
        resolvedBy: { type: "string", description: "Who resolved it. Defaults to 'adam'." },
      },
      required: [],
    },
  },
  {
    name: "create_alert",
    description:
      "Create a new alert or flag for the team. Use when Adam says 'flag this', 'add an alert about X', or 'remind me about Y'. Good for surfacing things that need attention without a specific due date.",
    input_schema: {
      type: "object" as const,
      properties: {
        title: { type: "string", description: "Short alert title" },
        message: { type: "string", description: "Detail / context" },
        severity: { type: "string", enum: ["info", "warning", "critical"], description: "Default: info" },
        projectName: { type: "string", description: "Optional: link to a portfolio project" },
      },
      required: ["title"],
    },
  },
  // ─── EOS Scorecard ─────────────────────────────────────────────────────────
  {
    name: "update_scorecard_entry",
    description:
      "Log a weekly scorecard metric value. Use when Adam reports numbers like 'TaskSpace had 4 new signups this week' or 'Cursive reply rate was 12%'. Fuzzy-matches the metric name and upserts the entry for the current week.",
    input_schema: {
      type: "object" as const,
      properties: {
        metricName: { type: "string", description: "Partial metric name to search for (e.g. 'new signups', 'reply rate', 'MRR')" },
        value: { type: "number", description: "The numeric value to record" },
        notes: { type: "string", description: "Optional context note" },
        weekOffset: { type: "number", description: "Weeks back from current Monday (0 = this week, 1 = last week). Default: 0." },
      },
      required: ["metricName", "value"],
    },
  },
  // ─── Proposals ─────────────────────────────────────────────────────────────
  {
    name: "create_proposal",
    description:
      "Draft a new proposal for a client. Use when Adam says 'create a proposal for [client] at $X' or 'draft a proposal for [project]'. Finds or creates the client, generates a proposal number, and sets status to draft.",
    input_schema: {
      type: "object" as const,
      properties: {
        clientName: { type: "string", description: "Client or company name — fuzzy matched or auto-created" },
        title: { type: "string", description: "Proposal title (e.g. 'TBGC Phase 2 — Portal Build')" },
        totalDollars: { type: "number", description: "Total proposal value in dollars" },
        summary: { type: "string", description: "Brief description of scope / what's included" },
        paymentTerms: { type: "string", description: "E.g. '50% upfront, 50% on delivery'. Default: '50% upfront, 50% on delivery'." },
        validDays: { type: "number", description: "Days until proposal expires. Default: 30." },
      },
      required: ["clientName", "title", "totalDollars"],
    },
  },
  {
    name: "update_proposal_status",
    description:
      "Update a proposal's status. Use when Adam says 'they accepted', 'lost that deal', 'send the proposal', or 'that proposal expired'. Searches by client name or proposal number.",
    input_schema: {
      type: "object" as const,
      properties: {
        clientName: { type: "string", description: "Client name to find their most recent proposal" },
        proposalId: { type: "string", description: "Exact proposal UUID (use if you have it)" },
        status: {
          type: "string",
          enum: ["draft", "sent", "viewed", "approved", "rejected", "expired"],
          description: "New status",
        },
        rejectionReason: { type: "string", description: "Only for rejected status — why it was rejected" },
        notes: { type: "string", description: "Internal note to append" },
      },
      required: ["status"],
    },
  },
  // ─── Recurring Billing ─────────────────────────────────────────────────────
  {
    name: "create_recurring_invoice",
    description:
      "Set up a recurring invoice / retainer for a client. Use when Adam says 'put [client] on a $X/mo retainer' or 'set up monthly billing for [client]'. Finds or creates the client, then creates the recurring template.",
    input_schema: {
      type: "object" as const,
      properties: {
        clientName: { type: "string", description: "Client or company name" },
        amountDollars: { type: "number", description: "Amount per billing cycle in dollars" },
        description: { type: "string", description: "What the recurring charge is for (e.g. 'Monthly retainer — TBGC portal maintenance')" },
        interval: { type: "string", enum: ["weekly", "biweekly", "monthly", "quarterly", "annual"], description: "Billing frequency. Default: monthly." },
        startDays: { type: "number", description: "Days from today for first billing date. Default: 0 (starts today)." },
      },
      required: ["clientName", "amountDollars"],
    },
  },
  {
    name: "send_invoice_reminder",
    description:
      "Log that a payment reminder was sent and increment the invoice's reminder counter. Use when Adam says 'send a reminder to [client]' or 'follow up on the [client] invoice'. Returns the draft reminder message you can send via send_gmail or send_sms.",
    input_schema: {
      type: "object" as const,
      properties: {
        clientName: { type: "string", description: "Client name — finds their most recent unpaid invoice" },
        invoiceId: { type: "string", description: "Exact invoice UUID if you have it" },
        channel: { type: "string", enum: ["email", "sms", "slack"], description: "How the reminder will be sent. Default: email." },
      },
      required: [],
    },
  },
  // ─── Clients / CRM ─────────────────────────────────────────────────────────
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
  // ─── Meetings ──────────────────────────────────────────────────────────────
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
  // ─── Outreach ──────────────────────────────────────────────────────────────
  {
    name: "get_outreach_snapshot",
    description:
      "Get current EmailBison campaign stats: active campaigns, emails sent, open rate, reply rate, bounce rate, connected senders. Use when asked about outreach, cold email, campaigns, or email performance.",
    input_schema: {
      type: "object" as const,
      properties: {},
      required: [],
    },
  },
  {
    name: "toggle_campaign",
    description:
      "Pause or resume an EmailBison campaign by name or ID. Use when Adam says 'pause the [campaign] campaign' or 'resume outreach for [campaign]'.",
    input_schema: {
      type: "object" as const,
      properties: {
        campaignName: { type: "string", description: "Partial campaign name to search for" },
        campaignId: { type: "number", description: "Exact EmailBison campaign ID if known" },
        action: { type: "string", enum: ["pause", "resume"], description: "Whether to pause or resume the campaign" },
      },
      required: ["action"],
    },
  },
  {
    name: "draft_cold_email",
    description:
      "Write a cold email (or full sequence) for a specific campaign using that campaign's knowledge base (ICP, value prop, proof, tone). Use when asked to 'write a cold email', 'draft outreach for [campaign]', 'write an email to [prospect]', or 'generate a follow-up'. Loads campaign knowledge automatically.",
    input_schema: {
      type: "object" as const,
      properties: {
        campaignName: { type: "string", description: "Campaign name or partial match to look up knowledge base" },
        campaignId: { type: "number", description: "Exact EmailBison campaign ID if known" },
        prospectName: { type: "string", description: "Prospect's full name" },
        prospectRole: { type: "string", description: "Prospect's job title/role" },
        prospectCompany: { type: "string", description: "Prospect's company name" },
        signals: {
          type: "array",
          items: { type: "string" },
          description: "Research signals: funding rounds, hiring patterns, LinkedIn posts, news, tech stack. Each as a short string.",
        },
        customAngle: { type: "string", description: "Custom observation or angle to lead with for this specific prospect" },
        emailType: {
          type: "string",
          enum: ["initial", "followup-1", "followup-2", "followup-3", "breakup"],
          description: "Which email in the sequence. Default: initial.",
        },
        instruction: { type: "string", description: "Optional extra instruction — 'make it shorter', 'focus on the ROI angle', etc." },
        fullSequence: { type: "boolean", description: "If true, draft all 5 emails in the sequence at once (initial + 4 follow-ups)" },
        useHighQuality: { type: "boolean", description: "Use Sonnet for higher quality drafts (slower). Default: false (Haiku)." },
      },
      required: [],
    },
  },
  {
    name: "set_campaign_knowledge",
    description:
      "Set or update the knowledge base for an outreach campaign — ICP, value prop, proof points, tone profile, copy guidelines, and email templates. Use when Adam says 'update the knowledge base for [campaign]', 'add proof points to [campaign]', 'set the ICP for [campaign]', or 'store these templates'. This powers the AI email drafting for that campaign.",
    input_schema: {
      type: "object" as const,
      properties: {
        campaignName: { type: "string", description: "Campaign name (partial match OK)" },
        campaignId: { type: "number", description: "Exact EmailBison campaign ID if known" },
        productName: { type: "string", description: "Product or service being promoted in this campaign" },
        valueProp: { type: "string", description: "One-sentence value proposition for this campaign" },
        toneProfile: {
          type: "string",
          enum: ["c-suite", "mid-level", "technical", "founder"],
          description: "Tone calibration based on audience seniority",
        },
        icp: {
          type: "object",
          description: "Ideal Customer Profile",
          properties: {
            roles: { type: "array", items: { type: "string" }, description: "Target job titles" },
            industries: { type: "array", items: { type: "string" }, description: "Target industries" },
            companySizes: { type: "array", items: { type: "string" }, description: "Target company sizes" },
            painPoints: { type: "array", items: { type: "string" }, description: "Core pain points this campaign addresses" },
          },
        },
        proof: {
          type: "array",
          description: "Case studies and social proof",
          items: {
            type: "object",
            properties: {
              company: { type: "string" },
              result: { type: "string" },
              metric: { type: "string" },
            },
          },
        },
        copyGuidelines: {
          type: "object",
          description: "Approved angles and banned phrases",
          properties: {
            use: { type: "array", items: { type: "string" } },
            avoid: { type: "array", items: { type: "string" } },
          },
        },
        notes: { type: "string", description: "Free-form notes — competitor positioning, objections, context" },
      },
      required: [],
    },
  },
  // ─── Strategy ──────────────────────────────────────────────────────────────
  {
    name: "dismiss_recommendation",
    description:
      "Dismiss or update the status of an AI strategy recommendation. Use when Adam says 'dismiss that', 'we already handled that recommendation', 'mark that in progress', or 'that one is done'. Searches by partial title.",
    input_schema: {
      type: "object" as const,
      properties: {
        title: { type: "string", description: "Partial recommendation title to search for" },
        recommendationId: { type: "string", description: "Exact recommendation UUID if you have it" },
        status: {
          type: "string",
          enum: ["in_progress", "done", "dismissed"],
          description: "New status. Default: dismissed.",
        },
        note: { type: "string", description: "Optional note explaining the action taken" },
      },
      required: [],
    },
  },
  {
    name: "mark_invoice_paid",
    description:
      "Mark an invoice as paid. Use when Adam confirms a payment was received. Searches by client name or invoice ID. Updates invoice status to 'paid' and records the payment date.",
    input_schema: {
      type: "object" as const,
      properties: {
        clientName: {
          type: "string",
          description: "Client or company name to find the most recent open/sent invoice",
        },
        invoiceId: { type: "string", description: "Exact invoice UUID (use if you have it from a previous tool call)" },
        amountDollars: {
          type: "number",
          description: "Amount paid in dollars — used to confirm the right invoice is being marked paid when multiple exist",
        },
        notes: { type: "string", description: "Optional note (e.g. 'Wire received', 'Stripe payment cleared')" },
      },
      required: [],
    },
  },
];

// ─── Tool Executor ────────────────────────────────────────────────────────────

export async function executeCeoTool(
  name: string,
  input: Record<string, unknown>
): Promise<string> {
  try {
    switch (name) {
      case "write_memory": {
        const success = await writeMemory(
          input.path as string,
          input.content as string,
          (input.summary as string) || "ClaudeBot memory update"
        );
        return JSON.stringify({ success, path: input.path });
      }

      case "read_memory": {
        const content = await readMemory(input.path as string);
        if (!content) return JSON.stringify({ error: "File not found", path: input.path });
        return JSON.stringify({ path: input.path, content });
      }

      case "list_memories": {
        const files = await listMemory((input.prefix as string) || "");
        return JSON.stringify({ files });
      }

      case "search_memory": {
        const results = await searchMemory(
          input.query as string,
          (input.limit as number) || 5
        );
        return JSON.stringify({ results });
      }

      case "write_bot_memory": {
        await setMemory(
          input.key as string,
          input.value as string,
          (input.category as string) || "general",
          "ai"
        );
        return JSON.stringify({ success: true, key: input.key });
      }

      case "read_bot_memory": {
        const rows = await getAllMemory();
        return JSON.stringify({ count: rows.length, memory: rows });
      }

      case "send_to_slack": {
        const token = process.env.SLACK_BOT_TOKEN;
        if (!token) return JSON.stringify({ error: "SLACK_BOT_TOKEN not configured" });

        const body: Record<string, unknown> = {
          channel: input.channel as string,
          text: input.message as string,
        };
        if (input.thread_ts) body.thread_ts = input.thread_ts;

        const res = await fetch("https://slack.com/api/chat.postMessage", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(body),
        });
        const data = await res.json();
        return JSON.stringify({ ok: data.ok, ts: data.ts, error: data.error });
      }

      case "send_sms": {
        const recipient = input.to as "adam" | "maggie";
        const phoneEnv =
          recipient === "adam" ? process.env.ADAM_PHONE : process.env.MAGGIE_PHONE;
        if (!phoneEnv)
          return JSON.stringify({ error: `Phone not configured for ${recipient}` });

        const result = await blooSendMessage({
          to: phoneEnv,
          message: input.message as string,
        });
        return JSON.stringify(result);
      }

      case "create_delegation": {
        // Find team member by name
        const allMembers = await db
          .select({ id: schema.teamMembers.id, name: schema.teamMembers.name })
          .from(schema.teamMembers)
          .where(eq(schema.teamMembers.isActive, true));

        const assigneeName = (input.assignee as string).toLowerCase();
        const member = allMembers.find((m) =>
          m.name.toLowerCase().includes(assigneeName)
        );

        const dueDate = input.dueDate
          ? new Date(input.dueDate as string)
          : null;

        const [task] = await db
          .insert(schema.tasks)
          .values({
            title: input.title as string,
            description: (input.description as string) || null,
            status: "todo",
            priority: ((input.priority as string) || "medium") as
              | "low"
              | "medium"
              | "high"
              | "urgent",
            assigneeId: member?.id || null,
            dueDate,
          })
          .returning();

        // Optionally notify Slack
        if (input.notifySlack !== false && member && process.env.SLACK_BOT_TOKEN) {
          const slackId =
            member.name.toLowerCase().includes("maggie")
              ? process.env.MAGGIE_SLACK_ID
              : process.env.ADAM_SLACK_ID;

          if (slackId) {
            await fetch("https://slack.com/api/chat.postMessage", {
              method: "POST",
              headers: {
                Authorization: `Bearer ${process.env.SLACK_BOT_TOKEN}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                channel: slackId,
                text: `*New task delegated to you:*\n*${task.title}*${task.description ? `\n${task.description}` : ""}${dueDate ? `\n_Due: ${dueDate.toLocaleDateString()}_` : ""}`,
              }),
            }).catch(() => {});
          }
        }

        return JSON.stringify({
          created: true,
          taskId: task.id,
          title: task.title,
          assignee: member?.name || "Unassigned",
        });
      }

      case "get_company_snapshot": {
        const [mrrResult, cashResult, sprintResult, leadResult, alertResult, taskResult] =
          await Promise.all([
            db
              .select({
                total: sql<number>`COALESCE(SUM(${schema.subscriptions.amount}), 0)`,
              })
              .from(schema.subscriptions)
              .where(eq(schema.subscriptions.status, "active")),

            db.select().from(schema.mercuryAccounts),

            db
              .select({
                id: schema.weeklySprints.id,
                title: schema.weeklySprints.title,
                weekOf: schema.weeklySprints.weekOf,
                weeklyFocus: schema.weeklySprints.weeklyFocus,
              })
              .from(schema.weeklySprints)
              .orderBy(desc(schema.weeklySprints.weekOf))
              .limit(1),

            db
              .select({ count: count() })
              .from(schema.leads)
              .where(
                and(
                  eq(schema.leads.isArchived, false),
                  sql`${schema.leads.stage} NOT IN ('closed_won', 'closed_lost')`
                )
              ),

            db
              .select({ count: count() })
              .from(schema.alerts)
              .where(eq(schema.alerts.isResolved, false)),

            db
              .select({ count: count() })
              .from(schema.tasks)
              .where(
                and(
                  eq(schema.tasks.isArchived, false),
                  sql`${schema.tasks.status} NOT IN ('done', 'cancelled')`
                )
              ),
          ]);

        const mrr = Number(mrrResult[0]?.total ?? 0) / 100;
        const cash = cashResult.reduce((s, a) => s + Number(a.balance), 0) / 100;
        const currentSprint = sprintResult[0] || null;

        return JSON.stringify({
          mrr: `$${mrr.toLocaleString()}`,
          cash: `$${cash.toLocaleString()}`,
          activeLeads: leadResult[0]?.count ?? 0,
          unresolvedAlerts: alertResult[0]?.count ?? 0,
          openTasks: taskResult[0]?.count ?? 0,
          currentSprint: currentSprint
            ? {
                id: currentSprint.id,
                title: currentSprint.title,
                weekOf: currentSprint.weekOf,
                focus: currentSprint.weeklyFocus,
              }
            : null,
        });
      }

      case "get_current_sprint": {
        const [sprint] = await db
          .select()
          .from(schema.weeklySprints)
          .orderBy(desc(schema.weeklySprints.weekOf))
          .limit(1);

        if (!sprint) return JSON.stringify({ error: "No sprints found" });

        const sections = await db
          .select({
            id: schema.sprintSections.id,
            projectName: schema.sprintSections.projectName,
            assigneeName: schema.sprintSections.assigneeName,
            goal: schema.sprintSections.goal,
          })
          .from(schema.sprintSections)
          .where(eq(schema.sprintSections.sprintId, sprint.id));

        const tasks = await db
          .select({
            id: schema.tasks.id,
            title: schema.tasks.title,
            status: schema.tasks.status,
            priority: schema.tasks.priority,
            sectionId: schema.taskSprintAssignments.sectionId,
          })
          .from(schema.taskSprintAssignments)
          .innerJoin(
            schema.tasks,
            eq(schema.taskSprintAssignments.taskId, schema.tasks.id)
          )
          .where(eq(schema.taskSprintAssignments.sprintId, sprint.id));

        return JSON.stringify({
          id: sprint.id,
          title: sprint.title,
          weekOf: sprint.weekOf,
          weeklyFocus: sprint.weeklyFocus,
          topOfMind: sprint.topOfMind,
          sections: sections.map((s) => ({
            ...s,
            tasks: tasks.filter((t) => t.sectionId === s.id),
          })),
        });
      }

      case "update_sprint_note": {
        const existing = await db
          .select({ topOfMind: schema.weeklySprints.topOfMind })
          .from(schema.weeklySprints)
          .where(eq(schema.weeklySprints.id, input.sprintId as string))
          .limit(1);

        const current = existing[0]?.topOfMind || "";
        const timestamp = new Date().toLocaleString("en-US", {
          month: "short",
          day: "numeric",
          hour: "numeric",
          minute: "2-digit",
        });
        const newNote = current
          ? `${current}\n\n[${timestamp}] ${input.note}`
          : `[${timestamp}] ${input.note}`;

        await db
          .update(schema.weeklySprints)
          .set({ topOfMind: newNote })
          .where(eq(schema.weeklySprints.id, input.sprintId as string));

        return JSON.stringify({ updated: true, sprintId: input.sprintId });
      }

      case "update_task_status": {
        let task;
        if (input.taskId) {
          const [row] = await db
            .select({ id: schema.tasks.id, title: schema.tasks.title })
            .from(schema.tasks)
            .where(eq(schema.tasks.id, input.taskId as string))
            .limit(1);
          task = row;
        } else if (input.taskTitle) {
          const [row] = await db
            .select({ id: schema.tasks.id, title: schema.tasks.title })
            .from(schema.tasks)
            .where(ilike(schema.tasks.title, `%${input.taskTitle}%`))
            .orderBy(desc(schema.tasks.updatedAt))
            .limit(1);
          task = row;
        }
        if (!task) return JSON.stringify({ error: "Task not found. Try a different title." });
        await db
          .update(schema.tasks)
          .set({ status: input.status as "backlog" | "todo" | "in_progress" | "in_review" | "done" | "cancelled" })
          .where(eq(schema.tasks.id, task.id));
        return JSON.stringify({ updated: true, taskId: task.id, title: task.title, newStatus: input.status });
      }

      case "update_rock_status": {
        let rock;
        if (input.rockId) {
          const [row] = await db
            .select({ id: schema.rocks.id, title: schema.rocks.title })
            .from(schema.rocks)
            .where(eq(schema.rocks.id, input.rockId as string))
            .limit(1);
          rock = row;
        } else if (input.rockTitle) {
          const [row] = await db
            .select({ id: schema.rocks.id, title: schema.rocks.title })
            .from(schema.rocks)
            .where(ilike(schema.rocks.title, `%${input.rockTitle}%`))
            .orderBy(desc(schema.rocks.updatedAt))
            .limit(1);
          rock = row;
        }
        if (!rock) return JSON.stringify({ error: "Rock not found. Try a different title." });
        await db
          .update(schema.rocks)
          .set({ status: input.status as "on_track" | "at_risk" | "off_track" })
          .where(eq(schema.rocks.id, rock.id));
        return JSON.stringify({ updated: true, rockId: rock.id, title: rock.title, newStatus: input.status });
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

      case "create_rock": {
        // Determine quarter: current if not specified
        const now = new Date();
        const qNum = Math.ceil((now.getMonth() + 1) / 3);
        const defaultQuarter = `Q${qNum} ${now.getFullYear()}`;

        // Resolve project ID from name if provided
        let projectId: string | null = null;
        if (input.projectName) {
          const [proj] = await db
            .select({ id: schema.portfolioProjects.id })
            .from(schema.portfolioProjects)
            .where(ilike(schema.portfolioProjects.name, `%${input.projectName}%`))
            .limit(1);
          projectId = proj?.id ?? null;
        }

        // Compute due date
        let dueDate: Date | null = null;
        if (input.dueDateDays) {
          dueDate = new Date();
          dueDate.setDate(dueDate.getDate() + (input.dueDateDays as number));
        } else {
          // Default: end of specified quarter
          const qStr = (input.quarter as string) || defaultQuarter;
          const qMatch = qStr.match(/Q(\d)\s+(\d{4})/);
          if (qMatch) {
            const q = parseInt(qMatch[1]);
            const y = parseInt(qMatch[2]);
            dueDate = new Date(y, q * 3, 0); // last day of quarter
          }
        }

        const [rock] = await db
          .insert(schema.rocks)
          .values({
            title: input.title as string,
            description: (input.description as string) ?? null,
            quarter: (input.quarter as string) || defaultQuarter,
            projectId,
            status: "on_track",
            dueDate,
          })
          .returning();

        return JSON.stringify({ created: true, rockId: rock.id, title: rock.title, quarter: rock.quarter });
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

      case "close_sprint": {
        // Find the sprint to close
        const [sprint] = input.sprintId
          ? await db.select().from(schema.weeklySprints).where(eq(schema.weeklySprints.id, input.sprintId as string)).limit(1)
          : await db.select().from(schema.weeklySprints).orderBy(desc(schema.weeklySprints.weekOf)).limit(1);

        if (!sprint) return JSON.stringify({ error: "No sprint found to close." });

        // Get task stats for this sprint
        const assignedTasks = await db
          .select({ taskId: schema.taskSprintAssignments.taskId })
          .from(schema.taskSprintAssignments)
          .where(eq(schema.taskSprintAssignments.sprintId, sprint.id));

        let doneCount = 0;
        if (assignedTasks.length > 0) {
          const taskIds = assignedTasks.map((t) => t.taskId);
          const doneTasks = await db
            .select({ id: schema.tasks.id })
            .from(schema.tasks)
            .where(and(eq(schema.tasks.status, "done"), sql`${schema.tasks.id} = ANY(ARRAY[${sql.raw(taskIds.map(id => `'${id}'::uuid`).join(","))}])`));
          doneCount = doneTasks.length;
        }

        // Store retrospective note if provided
        if (input.retrospective) {
          const ts = new Date().toLocaleString("en-US", { month: "short", day: "numeric" });
          const existingNote = sprint.topOfMind as string | null;
          const newNote = existingNote
            ? `${existingNote}\n\n[Retro ${ts}] ${input.retrospective}`
            : `[Retro ${ts}] ${input.retrospective}`;
          await db.update(schema.weeklySprints).set({ topOfMind: newNote }).where(eq(schema.weeklySprints.id, sprint.id));
        }

        // Write sprint snapshot for velocity tracking
        const completionRate = assignedTasks.length > 0 ? Math.round((doneCount / assignedTasks.length) * 100) : 0;
        await db.insert(schema.sprintSnapshots).values({
          sprintId: sprint.id,
          totalTasks: assignedTasks.length,
          completedTasks: doneCount,
          completionRate,
          velocityLabel: completionRate >= 80 ? "high" : completionRate >= 50 ? "medium" : "low",
        }).onConflictDoNothing();

        return JSON.stringify({
          closed: true,
          sprintId: sprint.id,
          title: sprint.title,
          totalTasks: assignedTasks.length,
          completedTasks: doneCount,
          completionRate: assignedTasks.length > 0 ? `${Math.round((doneCount / assignedTasks.length) * 100)}%` : "no tasks tracked",
        });
      }

      case "create_sprint": {
        // Determine week_of: next Monday if not provided
        const weekOfStr = input.weekOf as string | undefined;
        let weekOf: Date;
        if (weekOfStr) {
          weekOf = new Date(weekOfStr + "T12:00:00Z");
        } else {
          weekOf = new Date();
          const day = weekOf.getDay();
          const daysToMonday = day === 0 ? 1 : 8 - day;
          weekOf.setDate(weekOf.getDate() + daysToMonday);
          weekOf.setHours(12, 0, 0, 0);
        }

        const [sprint] = await db
          .insert(schema.weeklySprints)
          .values({
            title: input.title as string,
            weeklyFocus: (input.weeklyFocus as string) ?? null,
            weekOf,
          })
          .returning();

        return JSON.stringify({ created: true, sprintId: sprint.id, title: sprint.title, weekOf: sprint.weekOf });
      }

      case "get_portfolio_snapshot": {
        const platform = (input.platform as string) || "all";
        const results: Record<string, unknown> = {};

        const fetchAll = platform === "all";

        await Promise.all([
          // Wholesail
          (fetchAll || platform === "wholesail") ? (async () => {
            const { getSnapshot: wsSnap, isConfigured: wsOk } = await import("@/lib/connectors/wholesail");
            if (!wsOk()) { results.wholesail = { error: "Not configured" }; return; }
            const r = await wsSnap();
            if (!r.success) { results.wholesail = { error: r.error }; return; }
            const d = r.data!;
            results.wholesail = {
              liveClients: d.liveClients,
              activeBuilds: d.activeBuilds,
              mrrFromRetainers: d.mrrFromRetainers,
              pipelineValue: d.pipelineValue,
              buildsByStatus: d.buildsByStatus,
              intake: d.intake,
              stuckProjects: d.stuckProjects,
              overdueProjects: d.overdueProjects,
              buildCostsMtdCents: d.buildCostsMtdCents,
            };
          })() : Promise.resolve(),

          // Trackr
          (fetchAll || platform === "trackr") ? (async () => {
            const { getSnapshot: trSnap, isConfigured: trOk } = await import("@/lib/connectors/trackr");
            if (!trOk()) { results.trackr = { error: "Not configured" }; return; }
            const r = await trSnap();
            if (!r.success) { results.trackr = { error: r.error }; return; }
            const d = r.data!;
            results.trackr = {
              totalWorkspaces: d.totalWorkspaces,
              newWorkspacesWeek: d.newWorkspacesWeek,
              activeSubscriptions: d.activeSubscriptions,
              trialingSubscriptions: d.trialingSubscriptions,
              mrrCents: d.mrrCents,
              planBreakdown: d.planBreakdown,
              auditPipelinePending: d.auditPipelinePending,
              auditSubmissionsLastWeek: d.auditSubmissionsLastWeek,
              apiCostsMtdCents: d.apiCostsMtdCents,
              activeArchitects: d.activeArchitects,
              pendingArchitectApplications: d.pendingArchitectApplications,
              pendingCommissionsCents: d.pendingCommissionsCents,
            };
          })() : Promise.resolve(),

          // Cursive
          (fetchAll || platform === "cursive") ? (async () => {
            const { getSnapshot: cuSnap, isConfigured: cuOk } = await import("@/lib/connectors/cursive");
            if (!cuOk()) { results.cursive = { error: "Not configured" }; return; }
            const r = await cuSnap();
            if (!r.success) { results.cursive = { error: r.error }; return; }
            const d = r.data!;
            results.cursive = {
              totalWorkspaces: d.totalWorkspaces,
              managedByOps: d.managedByOps,
              pipeline: d.pipeline,
              bookings: d.bookings,
              pixels: d.pixels,
              leads: d.leads,
              affiliates: d.affiliates,
            };
          })() : Promise.resolve(),

          // TaskSpace
          (fetchAll || platform === "taskspace") ? (async () => {
            const { getSnapshot: tsSnap, isConfigured: tsOk } = await import("@/lib/connectors/taskspace");
            if (!tsOk()) { results.taskspace = { error: "Not configured" }; return; }
            const r = await tsSnap();
            if (!r.success) { results.taskspace = { error: r.error }; return; }
            const d = r.data!;
            results.taskspace = {
              totalOrgs: d.totalOrgs,
              totalMembers: d.totalMembers,
              eodRate7Day: d.eodRate7Day,
              eodsToday: d.eodsToday,
              activeTasks: d.activeTasks,
              openEscalations: d.openEscalations,
              rocksOnTrack: d.rocksOnTrack,
              rocksAtRisk: d.rocksAtRisk,
              planBreakdown: d.planBreakdown,
              payingOrgs: d.payingOrgs,
              mrrCents: d.mrrCents,
              criticalOrgs: d.orgs.filter((o) => o.riskLevel === "critical").map((o) => o.name),
            };
          })() : Promise.resolve(),
        ]);

        return JSON.stringify({ platform, snapshot: results, fetchedAt: new Date().toISOString() });
      }

      // ─── Tasks & Sprint ──────────────────────────────────────────────────────

      case "create_task": {
        // Resolve project if named
        let projectId: string | null = null;
        if (input.projectName) {
          const [proj] = await db
            .select({ id: schema.portfolioProjects.id })
            .from(schema.portfolioProjects)
            .where(ilike(schema.portfolioProjects.name, `%${input.projectName}%`))
            .limit(1);
          projectId = proj?.id ?? null;
        }

        // Resolve assignee if named
        let assigneeId: string | null = null;
        if (input.assigneeName) {
          const [member] = await db
            .select({ id: schema.teamMembers.id })
            .from(schema.teamMembers)
            .where(ilike(schema.teamMembers.name, `%${input.assigneeName}%`))
            .limit(1);
          assigneeId = member?.id ?? null;
        }

        const dueDate = input.dueDateDays
          ? (() => { const d = new Date(); d.setDate(d.getDate() + (input.dueDateDays as number)); return d; })()
          : null;

        const [task] = await db
          .insert(schema.tasks)
          .values({
            title: input.title as string,
            description: (input.description as string) ?? null,
            status: "todo",
            priority: ((input.priority as string) || "medium") as "low" | "medium" | "high" | "urgent",
            projectId,
            assigneeId,
            dueDate,
            source: "manual",
          })
          .returning();

        // Optionally add to current sprint
        let addedToSprint = false;
        if (input.addToCurrentSprint) {
          const [sprint] = await db
            .select({ id: schema.weeklySprints.id })
            .from(schema.weeklySprints)
            .orderBy(desc(schema.weeklySprints.weekOf))
            .limit(1);

          if (sprint) {
            // Find or use the first section
            const sections = await db
              .select({ id: schema.sprintSections.id })
              .from(schema.sprintSections)
              .where(eq(schema.sprintSections.sprintId, sprint.id))
              .limit(1);

            const sectionId = sections[0]?.id ?? null;
            await db.insert(schema.taskSprintAssignments).values({
              taskId: task.id,
              sprintId: sprint.id,
              sectionId,
            }).onConflictDoNothing();
            addedToSprint = true;
          }
        }

        return JSON.stringify({
          created: true,
          taskId: task.id,
          title: task.title,
          priority: task.priority,
          projectId,
          assigneeId,
          addedToSprint,
        });
      }

      case "add_task_to_sprint": {
        // Find task
        let taskId: string | undefined;
        let taskTitle = "Unknown";
        if (input.taskId) {
          taskId = input.taskId as string;
          const [t] = await db.select({ title: schema.tasks.title }).from(schema.tasks).where(eq(schema.tasks.id, taskId)).limit(1);
          taskTitle = t?.title ?? taskId;
        } else if (input.taskTitle) {
          const [t] = await db
            .select({ id: schema.tasks.id, title: schema.tasks.title })
            .from(schema.tasks)
            .where(ilike(schema.tasks.title, `%${input.taskTitle}%`))
            .orderBy(desc(schema.tasks.updatedAt))
            .limit(1);
          if (!t) return JSON.stringify({ error: `No task matching "${input.taskTitle}"` });
          taskId = t.id;
          taskTitle = t.title;
        } else {
          return JSON.stringify({ error: "Provide taskTitle or taskId." });
        }

        const [sprint] = await db
          .select({ id: schema.weeklySprints.id, title: schema.weeklySprints.title })
          .from(schema.weeklySprints)
          .orderBy(desc(schema.weeklySprints.weekOf))
          .limit(1);
        if (!sprint) return JSON.stringify({ error: "No sprint found." });

        // Find matching section
        let sectionId: string | null = null;
        if (input.sectionProjectName) {
          const [sec] = await db
            .select({ id: schema.sprintSections.id })
            .from(schema.sprintSections)
            .where(and(
              eq(schema.sprintSections.sprintId, sprint.id),
              ilike(schema.sprintSections.projectName, `%${input.sectionProjectName}%`)
            ))
            .limit(1);
          sectionId = sec?.id ?? null;
        }
        if (!sectionId) {
          const [first] = await db
            .select({ id: schema.sprintSections.id })
            .from(schema.sprintSections)
            .where(eq(schema.sprintSections.sprintId, sprint.id))
            .limit(1);
          sectionId = first?.id ?? null;
        }

        await db.insert(schema.taskSprintAssignments).values({
          taskId: taskId!,
          sprintId: sprint.id,
          sectionId,
        }).onConflictDoNothing();

        return JSON.stringify({ added: true, taskTitle, sprintTitle: sprint.title, sectionId });
      }

      case "create_sprint_section": {
        const [sprint] = await db
          .select({ id: schema.weeklySprints.id, title: schema.weeklySprints.title })
          .from(schema.weeklySprints)
          .orderBy(desc(schema.weeklySprints.weekOf))
          .limit(1);
        if (!sprint) return JSON.stringify({ error: "No current sprint found." });

        // Resolve project ID if a known portfolio project
        let projectId: string | null = null;
        const [proj] = await db
          .select({ id: schema.portfolioProjects.id })
          .from(schema.portfolioProjects)
          .where(ilike(schema.portfolioProjects.name, `%${input.projectName}%`))
          .limit(1);
        projectId = proj?.id ?? null;

        // Resolve assignee
        let assigneeId: string | null = null;
        let assigneeName: string | null = null;
        if (input.assigneeName) {
          const [member] = await db
            .select({ id: schema.teamMembers.id, name: schema.teamMembers.name })
            .from(schema.teamMembers)
            .where(ilike(schema.teamMembers.name, `%${input.assigneeName}%`))
            .limit(1);
          assigneeId = member?.id ?? null;
          assigneeName = member?.name ?? (input.assigneeName as string);
        }

        // Get current max sortOrder
        const [maxSort] = await db
          .select({ max: sql<number>`COALESCE(MAX(${schema.sprintSections.sortOrder}), 0)` })
          .from(schema.sprintSections)
          .where(eq(schema.sprintSections.sprintId, sprint.id));

        const [section] = await db
          .insert(schema.sprintSections)
          .values({
            sprintId: sprint.id,
            projectId,
            projectName: input.projectName as string,
            assigneeId,
            assigneeName,
            goal: (input.goal as string) ?? null,
            sortOrder: (maxSort?.max ?? 0) + 1,
          })
          .returning();

        return JSON.stringify({
          created: true,
          sectionId: section.id,
          projectName: section.projectName,
          sprintTitle: sprint.title,
          goal: section.goal,
        });
      }

      // ─── Alerts ──────────────────────────────────────────────────────────────

      case "resolve_alert": {
        let alert: { id: string; title: string } | undefined;
        if (input.alertId) {
          const [a] = await db.select({ id: schema.alerts.id, title: schema.alerts.title }).from(schema.alerts).where(eq(schema.alerts.id, input.alertId as string)).limit(1);
          alert = a;
        } else if (input.alertTitle) {
          const [a] = await db
            .select({ id: schema.alerts.id, title: schema.alerts.title })
            .from(schema.alerts)
            .where(and(ilike(schema.alerts.title, `%${input.alertTitle}%`), eq(schema.alerts.isResolved, false)))
            .orderBy(desc(schema.alerts.createdAt))
            .limit(1);
          alert = a;
        }
        if (!alert) return JSON.stringify({ error: "Alert not found. Try a different title." });

        if (input.snoozeHours) {
          const snoozeUntil = new Date();
          snoozeUntil.setHours(snoozeUntil.getHours() + (input.snoozeHours as number));
          await db.update(schema.alerts).set({ snoozedUntil: snoozeUntil }).where(eq(schema.alerts.id, alert.id));
          return JSON.stringify({ snoozed: true, alertId: alert.id, title: alert.title, until: snoozeUntil.toISOString() });
        }

        await db.update(schema.alerts).set({
          isResolved: true,
          resolvedAt: new Date(),
          resolvedBy: (input.resolvedBy as string) || "adam",
        }).where(eq(schema.alerts.id, alert.id));

        return JSON.stringify({ resolved: true, alertId: alert.id, title: alert.title });
      }

      case "create_alert": {
        let projectId: string | null = null;
        if (input.projectName) {
          const [proj] = await db
            .select({ id: schema.portfolioProjects.id })
            .from(schema.portfolioProjects)
            .where(ilike(schema.portfolioProjects.name, `%${input.projectName}%`))
            .limit(1);
          projectId = proj?.id ?? null;
        }

        const [alert] = await db.insert(schema.alerts).values({
          title: input.title as string,
          message: (input.message as string) ?? null,
          severity: ((input.severity as string) || "info") as "info" | "warning" | "critical",
          type: "health_drop", // manual flags use this type
          projectId,
          isResolved: false,
        }).returning();

        return JSON.stringify({ created: true, alertId: alert.id, title: alert.title, severity: alert.severity });
      }

      // ─── Scorecard ───────────────────────────────────────────────────────────

      case "update_scorecard_entry": {
        // Find metric by name
        const [metric] = await db
          .select({ id: schema.scorecardMetrics.id, name: schema.scorecardMetrics.name, unit: schema.scorecardMetrics.unit })
          .from(schema.scorecardMetrics)
          .where(and(ilike(schema.scorecardMetrics.name, `%${input.metricName}%`), eq(schema.scorecardMetrics.isActive, true)))
          .limit(1);

        if (!metric) return JSON.stringify({ error: `No active scorecard metric matching "${input.metricName}". Check /scorecard for metric names.` });

        // Compute week start (Monday)
        const now = new Date();
        const dayOfWeek = now.getDay(); // 0=Sun, 1=Mon...
        const daysToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
        const weekStart = new Date(now);
        weekStart.setDate(now.getDate() + daysToMonday - ((input.weekOffset as number || 0) * 7));
        weekStart.setHours(0, 0, 0, 0);

        await db
          .insert(schema.scorecardEntries)
          .values({
            metricId: metric.id,
            weekStart,
            value: String(input.value),
            notes: (input.notes as string) ?? null,
          })
          .onConflictDoUpdate({
            target: [schema.scorecardEntries.metricId, schema.scorecardEntries.weekStart],
            set: {
              value: String(input.value),
              notes: (input.notes as string) ?? null,
            },
          });

        return JSON.stringify({
          updated: true,
          metric: metric.name,
          value: input.value,
          unit: metric.unit,
          weekOf: weekStart.toISOString().split("T")[0],
        });
      }

      // ─── Proposals ───────────────────────────────────────────────────────────

      case "create_proposal": {
        const clientNameSearch = input.clientName as string;
        const totalCents = Math.round((input.totalDollars as number) * 100);

        // Find or create client
        let clientId: string;
        let clientDisplayName: string;
        const [foundClient] = await db
          .select({ id: schema.clients.id, name: schema.clients.name, companyName: schema.clients.companyName })
          .from(schema.clients)
          .where(or(ilike(schema.clients.name, `%${clientNameSearch}%`), ilike(schema.clients.companyName, `%${clientNameSearch}%`)))
          .limit(1);

        if (foundClient) {
          clientId = foundClient.id;
          clientDisplayName = foundClient.companyName || foundClient.name;
        } else {
          const [newClient] = await db.insert(schema.clients).values({ name: clientNameSearch, companyName: clientNameSearch }).returning();
          clientId = newClient.id;
          clientDisplayName = newClient.name;
        }

        // Generate proposal number
        const propCount = await db.select({ count: count() }).from(schema.proposals);
        const propNum = `PROP-${String((propCount[0]?.count ?? 0) + 1).padStart(4, "0")}`;

        const validUntilDate = new Date();
        validUntilDate.setDate(validUntilDate.getDate() + ((input.validDays as number) || 30));
        const validUntil = validUntilDate.toISOString().split("T")[0]; // date column needs string

        const [proposal] = await db.insert(schema.proposals).values({
          clientId,
          title: input.title as string,
          proposalNumber: propNum,
          status: "draft",
          summary: (input.summary as string) ?? null,
          total: totalCents,
          subtotal: totalCents,
          paymentTerms: (input.paymentTerms as string) || "50% upfront, 50% on delivery",
          validUntil,
          lineItems: input.summary
            ? [{ description: input.summary as string, quantity: 1, unitPrice: totalCents }]
            : null,
        }).returning();

        return JSON.stringify({
          created: true,
          proposalId: proposal.id,
          proposalNumber: proposal.proposalNumber,
          clientId,
          clientName: clientDisplayName,
          clientCreated: !foundClient,
          total: `$${(totalCents / 100).toLocaleString()}`,
          status: "draft",
          validUntil: validUntilDate.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }),
          portalUrl: `/proposals/${proposal.id}`,
        });
      }

      case "update_proposal_status": {
        let proposal: { id: string; proposalNumber: string | null; status: string; clientId: string } | undefined;

        if (input.proposalId) {
          const [p] = await db
            .select({ id: schema.proposals.id, proposalNumber: schema.proposals.proposalNumber, status: schema.proposals.status, clientId: schema.proposals.clientId })
            .from(schema.proposals)
            .where(eq(schema.proposals.id, input.proposalId as string))
            .limit(1);
          proposal = p ? { ...p, status: p.status as string } : undefined;
        } else if (input.clientName) {
          const [client] = await db
            .select({ id: schema.clients.id })
            .from(schema.clients)
            .where(or(ilike(schema.clients.name, `%${input.clientName}%`), ilike(schema.clients.companyName, `%${input.clientName}%`)))
            .limit(1);
          if (!client) return JSON.stringify({ error: `No client matching "${input.clientName}"` });

          const [p] = await db
            .select({ id: schema.proposals.id, proposalNumber: schema.proposals.proposalNumber, status: schema.proposals.status, clientId: schema.proposals.clientId })
            .from(schema.proposals)
            .where(eq(schema.proposals.clientId, client.id))
            .orderBy(desc(schema.proposals.createdAt))
            .limit(1);
          proposal = p ? { ...p, status: p.status as string } : undefined;
        }
        if (!proposal) return JSON.stringify({ error: "Proposal not found." });

        const newStatus = input.status as "draft" | "sent" | "viewed" | "approved" | "rejected" | "expired";
        const updates: Record<string, unknown> = { status: newStatus };
        const now = new Date();
        if (newStatus === "sent") updates.sentAt = now;
        if (newStatus === "approved") updates.approvedAt = now;
        if (newStatus === "rejected") { updates.rejectedAt = now; if (input.rejectionReason) updates.rejectionReason = input.rejectionReason; }
        if (input.notes) updates.internalNotes = input.notes;

        await db.update(schema.proposals).set(updates).where(eq(schema.proposals.id, proposal.id));

        return JSON.stringify({ updated: true, proposalId: proposal.id, proposalNumber: proposal.proposalNumber, newStatus });
      }

      // ─── Recurring Billing ───────────────────────────────────────────────────

      case "create_recurring_invoice": {
        const clientNameSearch = input.clientName as string;
        const totalCents = Math.round((input.amountDollars as number) * 100);
        const interval = (input.interval as string) || "monthly";

        // Find or create client
        let clientId: string;
        let clientDisplayName: string;
        const [foundClient] = await db
          .select({ id: schema.clients.id, name: schema.clients.name, companyName: schema.clients.companyName })
          .from(schema.clients)
          .where(or(ilike(schema.clients.name, `%${clientNameSearch}%`), ilike(schema.clients.companyName, `%${clientNameSearch}%`)))
          .limit(1);

        if (foundClient) {
          clientId = foundClient.id;
          clientDisplayName = foundClient.companyName || foundClient.name;
        } else {
          const [nc] = await db.insert(schema.clients).values({ name: clientNameSearch, companyName: clientNameSearch }).returning();
          clientId = nc.id;
          clientDisplayName = nc.name;
        }

        const startDate = new Date();
        startDate.setDate(startDate.getDate() + ((input.startDays as number) || 0));
        const startStr = startDate.toISOString().split("T")[0];

        const [rec] = await db.insert(schema.recurringInvoices).values({
          clientId,
          interval: interval as "weekly" | "biweekly" | "monthly" | "quarterly" | "annual",
          subtotal: totalCents,
          total: totalCents,
          startDate: startStr,
          nextBillingDate: startStr,
          autoSend: true,
          lineItems: [{ description: (input.description as string) || `${interval} retainer`, quantity: 1, unitPrice: totalCents }],
        }).returning();

        return JSON.stringify({
          created: true,
          recurringId: rec.id,
          clientName: clientDisplayName,
          clientCreated: !foundClient,
          amount: `$${(totalCents / 100).toLocaleString()}`,
          interval,
          firstBillingDate: startStr,
        });
      }

      case "send_invoice_reminder": {
        // Find invoice
        let invoice: { id: string; number: string | null; amount: number; clientId: string; reminderCount: number; dueDate: Date | null } | undefined;

        if (input.invoiceId) {
          const [row] = await db
            .select({ id: schema.invoices.id, number: schema.invoices.number, amount: schema.invoices.amount, clientId: schema.invoices.clientId, reminderCount: schema.invoices.reminderCount, dueDate: schema.invoices.dueDate })
            .from(schema.invoices)
            .where(eq(schema.invoices.id, input.invoiceId as string))
            .limit(1);
          invoice = row ?? undefined;
        } else if (input.clientName) {
          const [client] = await db
            .select({ id: schema.clients.id, name: schema.clients.name, email: schema.clients.email, companyName: schema.clients.companyName })
            .from(schema.clients)
            .where(or(ilike(schema.clients.name, `%${input.clientName}%`), ilike(schema.clients.companyName, `%${input.clientName}%`)))
            .limit(1);
          if (!client) return JSON.stringify({ error: `No client matching "${input.clientName}"` });

          const [row] = await db
            .select({ id: schema.invoices.id, number: schema.invoices.number, amount: schema.invoices.amount, clientId: schema.invoices.clientId, reminderCount: schema.invoices.reminderCount, dueDate: schema.invoices.dueDate })
            .from(schema.invoices)
            .where(and(eq(schema.invoices.clientId, client.id), sql`${schema.invoices.status} IN ('open','sent','overdue')`))
            .orderBy(desc(schema.invoices.createdAt))
            .limit(1);
          invoice = row ?? undefined;
        }

        if (!invoice) return JSON.stringify({ error: "No unpaid invoice found." });

        // Increment reminder count
        await db.update(schema.invoices).set({
          reminderCount: (invoice.reminderCount ?? 0) + 1,
          lastReminderAt: new Date(),
        }).where(eq(schema.invoices.id, invoice.id));

        const dueDateStr = invoice.dueDate ? invoice.dueDate.toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "ASAP";
        const draftMessage = `Hi — just following up on invoice ${invoice.number || invoice.id} for $${(invoice.amount / 100).toLocaleString()}, due ${dueDateStr}. Please let me know if you have any questions. Thanks!`;

        return JSON.stringify({
          reminded: true,
          invoiceId: invoice.id,
          invoiceNumber: invoice.number,
          reminderCount: (invoice.reminderCount ?? 0) + 1,
          draftMessage,
          note: `Use send_gmail or send_sms with this draft to actually send the reminder.`,
        });
      }

      // ─── Clients / CRM ───────────────────────────────────────────────────────

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

      // ─── Meetings ────────────────────────────────────────────────────────────

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

      // ─── Outreach ────────────────────────────────────────────────────────────

      case "get_outreach_snapshot": {
        const { getSnapshot } = await import("@/lib/connectors/emailbison");
        const result = await getSnapshot();
        if (!result.success) return JSON.stringify({ error: result.error ?? "EmailBison unavailable" });
        const d = result.data!;
        return JSON.stringify({
          activeCampaigns: d.activeCampaigns,
          totalSent: d.totalSent,
          openRatePct: `${d.openRatePct}%`,
          replyRatePct: `${d.replyRatePct}%`,
          bounceRatePct: `${d.bounceRatePct}%`,
          connectedSenders: d.connectedSenders,
          campaigns: d.campaigns.map((c) => ({
            id: c.id,
            name: c.name,
            status: c.status,
            sent: c.emails_sent,
            replied: c.unique_replies,
            interested: c.interested,
          })),
          workspaceStats: d.workspaceStats,
        });
      }

      case "toggle_campaign": {
        const apiKey = process.env.EMAILBISON_API_KEY;
        const baseUrl = process.env.EMAILBISON_BASE_URL;
        if (!apiKey || !baseUrl) return JSON.stringify({ error: "EMAILBISON env vars not configured" });

        // Find campaign by name if ID not provided
        let campaignId = input.campaignId as number | undefined;
        let campaignName = "Unknown";

        if (!campaignId && input.campaignName) {
          const { getSnapshot } = await import("@/lib/connectors/emailbison");
          const snap = await getSnapshot();
          if (snap.success && snap.data) {
            const match = snap.data.campaigns.find((c) =>
              c.name.toLowerCase().includes((input.campaignName as string).toLowerCase())
            );
            if (!match) return JSON.stringify({ error: `No campaign matching "${input.campaignName}"` });
            campaignId = match.id;
            campaignName = match.name;
          }
        }
        if (!campaignId) return JSON.stringify({ error: "Provide campaignName or campaignId." });

        const action = input.action as "pause" | "resume";
        const newStatus = action === "pause" ? "paused" : "active";

        const res = await fetch(`${baseUrl}/api/campaigns/${campaignId}`, {
          method: "PATCH",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ status: newStatus }),
        });

        if (!res.ok) {
          const text = await res.text().catch(() => "");
          return JSON.stringify({ error: `EmailBison API ${res.status}: ${text.slice(0, 100)}` });
        }

        return JSON.stringify({ success: true, campaignId, campaignName, action, newStatus });
      }

      // ─── Outreach — AI email drafting ────────────────────────────────────────

      case "draft_cold_email": {
        const { draftColdEmail, draftFullSequence } = await import("@/lib/ai/agents/outreach-agent");

        // Find campaign and load knowledge base
        let campaign: { externalId: number; name: string; knowledgeBase: unknown } | undefined;
        if (input.campaignId) {
          const [c] = await db
            .select({ externalId: schema.outreachCampaigns.externalId, name: schema.outreachCampaigns.name, knowledgeBase: schema.outreachCampaigns.knowledgeBase })
            .from(schema.outreachCampaigns)
            .where(eq(schema.outreachCampaigns.externalId, input.campaignId as number))
            .limit(1);
          campaign = c ?? undefined;
        } else if (input.campaignName) {
          const [c] = await db
            .select({ externalId: schema.outreachCampaigns.externalId, name: schema.outreachCampaigns.name, knowledgeBase: schema.outreachCampaigns.knowledgeBase })
            .from(schema.outreachCampaigns)
            .where(ilike(schema.outreachCampaigns.name, `%${input.campaignName as string}%`))
            .limit(1);
          campaign = c ?? undefined;
        }

        const knowledgeBase = (campaign?.knowledgeBase as import("@/lib/db/schema/outreach").CampaignKnowledgeBase | null) ?? null;
        if (!knowledgeBase) {
          return JSON.stringify({
            error: `No knowledge base found for campaign "${input.campaignName ?? input.campaignId}". Set one first using set_campaign_knowledge.`,
            tip: "Use set_campaign_knowledge to define ICP, value prop, proof points, and tone for this campaign.",
          });
        }

        const prospect = {
          fullName: input.prospectName as string | undefined,
          role: input.prospectRole as string | undefined,
          company: input.prospectCompany as string | undefined,
          signals: input.signals as string[] | undefined,
          customAngle: input.customAngle as string | undefined,
        };

        const campaignName = campaign?.name ?? (input.campaignName as string) ?? "Unknown";

        if (input.fullSequence) {
          const drafts = await draftFullSequence(
            campaignName,
            knowledgeBase,
            prospect,
            (input.useHighQuality as boolean) ?? false
          );
          return JSON.stringify({
            campaign: campaignName,
            prospect: prospect.fullName ?? "Prospect",
            sequence: drafts.map((d, i) => ({
              step: i + 1,
              type: ["initial", "followup-1", "followup-2", "followup-3", "breakup"][i],
              subjectLine: d.subjectLine,
              body: d.body,
            })),
          });
        }

        const draft = await draftColdEmail({
          campaignName,
          knowledgeBase,
          prospect,
          emailType: (input.emailType as "initial" | "followup-1" | "followup-2" | "followup-3" | "breakup") ?? "initial",
          instruction: input.instruction as string | undefined,
          useHighQuality: (input.useHighQuality as boolean) ?? false,
        });

        return JSON.stringify({
          campaign: campaignName,
          prospect: prospect.fullName ?? "Prospect",
          subjectLine: draft.subjectLine,
          body: draft.body,
          reasoning: draft.reasoning,
          warnings: draft.warnings?.length ? draft.warnings : undefined,
        });
      }

      case "set_campaign_knowledge": {
        type CampaignKB = import("@/lib/db/schema/outreach").CampaignKnowledgeBase;

        // Find campaign
        let campaign: { id: string; externalId: number; name: string; knowledgeBase: unknown } | undefined;
        if (input.campaignId) {
          const [c] = await db
            .select({ id: schema.outreachCampaigns.id, externalId: schema.outreachCampaigns.externalId, name: schema.outreachCampaigns.name, knowledgeBase: schema.outreachCampaigns.knowledgeBase })
            .from(schema.outreachCampaigns)
            .where(eq(schema.outreachCampaigns.externalId, input.campaignId as number))
            .limit(1);
          campaign = c ?? undefined;
        } else if (input.campaignName) {
          const [c] = await db
            .select({ id: schema.outreachCampaigns.id, externalId: schema.outreachCampaigns.externalId, name: schema.outreachCampaigns.name, knowledgeBase: schema.outreachCampaigns.knowledgeBase })
            .from(schema.outreachCampaigns)
            .where(ilike(schema.outreachCampaigns.name, `%${input.campaignName as string}%`))
            .limit(1);
          campaign = c ?? undefined;
        }

        if (!campaign) {
          return JSON.stringify({ error: `Campaign "${input.campaignName ?? input.campaignId}" not found. Check /outreach for campaign names.` });
        }

        // Merge with existing knowledge base (partial updates supported)
        const existing = (campaign.knowledgeBase as CampaignKB | null) ?? ({} as CampaignKB);
        const updated: CampaignKB = Object.assign({}, existing, {
          ...(input.productName ? { productName: input.productName as string } : {}),
          ...(input.valueProp ? { valueProp: input.valueProp as string } : {}),
          ...(input.toneProfile ? { toneProfile: input.toneProfile as CampaignKB["toneProfile"] } : {}),
          ...(input.icp ? { icp: input.icp as CampaignKB["icp"] } : {}),
          ...(input.proof ? { proof: input.proof as CampaignKB["proof"] } : {}),
          ...(input.copyGuidelines ? { copyGuidelines: input.copyGuidelines as CampaignKB["copyGuidelines"] } : {}),
          ...(input.notes ? { notes: input.notes as string } : {}),
          updatedAt: new Date().toISOString(),
        });

        // Validate required fields for drafting
        const missingForDrafting: string[] = [];
        if (!updated.productName) missingForDrafting.push("productName");
        if (!updated.valueProp) missingForDrafting.push("valueProp");
        if (!updated.toneProfile) missingForDrafting.push("toneProfile");
        if (!updated.icp) missingForDrafting.push("icp");
        if (!updated.proof?.length) missingForDrafting.push("proof (at least one case study)");

        await db
          .update(schema.outreachCampaigns)
          .set({ knowledgeBase: updated, updatedAt: new Date() })
          .where(eqOp(schema.outreachCampaigns.id, campaign.id));

        return JSON.stringify({
          updated: true,
          campaign: campaign.name,
          readyToDraft: missingForDrafting.length === 0,
          missingForDrafting: missingForDrafting.length ? missingForDrafting : undefined,
          knowledgeBase: updated,
        });
      }

      // ─── Strategy ────────────────────────────────────────────────────────────

      case "dismiss_recommendation": {
        let rec: { id: string; title: string } | undefined;

        if (input.recommendationId) {
          const [r] = await db
            .select({ id: schema.strategyRecommendations.id, title: schema.strategyRecommendations.title })
            .from(schema.strategyRecommendations)
            .where(eq(schema.strategyRecommendations.id, input.recommendationId as string))
            .limit(1);
          rec = r ?? undefined;
        } else if (input.title) {
          const [r] = await db
            .select({ id: schema.strategyRecommendations.id, title: schema.strategyRecommendations.title })
            .from(schema.strategyRecommendations)
            .where(and(ilike(schema.strategyRecommendations.title, `%${input.title}%`), eq(schema.strategyRecommendations.status, "active")))
            .orderBy(desc(schema.strategyRecommendations.createdAt))
            .limit(1);
          rec = r ?? undefined;
        }
        if (!rec) return JSON.stringify({ error: "Recommendation not found. Try a partial title match." });

        const newStatus = (input.status as string) || "dismissed";
        await db.update(schema.strategyRecommendations).set({
          status: newStatus as "in_progress" | "done" | "dismissed",
          actedOnAt: new Date(),
          actedOnNote: (input.note as string) ?? null,
        }).where(eq(schema.strategyRecommendations.id, rec.id));

        return JSON.stringify({ updated: true, recommendationId: rec.id, title: rec.title, newStatus });
      }

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

      case "create_invoice": {
        const clientNameSearch = input.clientName as string;
        const amountCents = Math.round((input.amountDollars as number) * 100);
        const status = (input.status as string) || "open";
        const dueDays = (input.dueDateDays as number) || 30;

        // Find or create client
        let clientId: string;
        let clientName: string;

        const foundClients = await db
          .select({ id: schema.clients.id, name: schema.clients.name, companyName: schema.clients.companyName })
          .from(schema.clients)
          .where(
            or(
              ilike(schema.clients.name, `%${clientNameSearch}%`),
              ilike(schema.clients.companyName, `%${clientNameSearch}%`),
            )
          )
          .limit(1);

        if (foundClients.length > 0) {
          clientId = foundClients[0].id;
          clientName = foundClients[0].companyName || foundClients[0].name;
        } else {
          // Auto-create client
          const [newClient] = await db
            .insert(schema.clients)
            .values({ name: clientNameSearch, companyName: clientNameSearch })
            .returning();
          clientId = newClient.id;
          clientName = newClient.name;
        }

        // Generate invoice number
        const invoiceCount = await db.select({ count: count() }).from(schema.invoices);
        const invNum = `INV-${String((invoiceCount[0]?.count ?? 0) + 1).padStart(4, "0")}`;

        // Due date
        const dueDate = new Date();
        dueDate.setDate(dueDate.getDate() + dueDays);

        const [invoice] = await db
          .insert(schema.invoices)
          .values({
            clientId,
            number: invNum,
            status: status as "draft" | "open" | "sent",
            amount: amountCents,
            subtotal: amountCents,
            dueDate,
            notes: (input.notes as string) ?? null,
            lineItems: input.description
              ? [{ description: input.description as string, quantity: 1, unitPrice: amountCents }]
              : null,
            ...(status === "sent" ? { sentAt: new Date() } : {}),
          })
          .returning();

        return JSON.stringify({
          created: true,
          invoiceId: invoice.id,
          invoiceNumber: invoice.number,
          clientId,
          clientName,
          clientCreated: foundClients.length === 0,
          amount: `$${(amountCents / 100).toLocaleString()}`,
          status: invoice.status,
          dueDate: dueDate.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }),
          portalUrl: `/invoices/${invoice.id}`,
        });
      }

      case "mark_invoice_paid": {
        // Find invoice by ID or client name
        let invoice: { id: string; number: string | null; amount: number; clientId: string; status: string } | undefined;

        if (input.invoiceId) {
          const [row] = await db
            .select({ id: schema.invoices.id, number: schema.invoices.number, amount: schema.invoices.amount, clientId: schema.invoices.clientId, status: schema.invoices.status })
            .from(schema.invoices)
            .where(eq(schema.invoices.id, input.invoiceId as string))
            .limit(1);
          invoice = row ? { ...row, status: row.status as string } : undefined;
        } else if (input.clientName) {
          // Find client first
          const [client] = await db
            .select({ id: schema.clients.id })
            .from(schema.clients)
            .where(
              or(
                ilike(schema.clients.name, `%${input.clientName}%`),
                ilike(schema.clients.companyName, `%${input.clientName}%`),
              )
            )
            .limit(1);

          if (!client) return JSON.stringify({ error: `No client found matching "${input.clientName}"` });

          // Find the most recent open/sent invoice for this client
          const conditions: Parameters<typeof and> = [
            eq(schema.invoices.clientId, client.id),
            sql`${schema.invoices.status} IN ('open', 'sent', 'overdue')`,
          ];
          if (input.amountDollars) {
            const targetCents = Math.round((input.amountDollars as number) * 100);
            conditions.push(eq(schema.invoices.amount, targetCents));
          }

          const [row] = await db
            .select({ id: schema.invoices.id, number: schema.invoices.number, amount: schema.invoices.amount, clientId: schema.invoices.clientId, status: schema.invoices.status })
            .from(schema.invoices)
            .where(and(...conditions))
            .orderBy(desc(schema.invoices.createdAt))
            .limit(1);
          invoice = row ? { ...row, status: row.status as string } : undefined;
        }

        if (!invoice) return JSON.stringify({ error: "Invoice not found. Try providing clientName or invoiceId." });
        if (invoice.status === "paid") return JSON.stringify({ error: `Invoice ${invoice.number} is already marked paid.` });

        const now = new Date();
        const updateData: Record<string, unknown> = {
          status: "paid",
          paidAt: now,
          updatedAt: now,
        };
        if (input.notes) {
          updateData.notes = input.notes;
        }

        await db.update(schema.invoices).set(updateData).where(eq(schema.invoices.id, invoice.id));

        // Update client lifetime value
        await db
          .update(schema.clients)
          .set({
            lifetimeValue: sql`${schema.clients.lifetimeValue} + ${invoice.amount}`,
            lastPaymentDate: now,
          })
          .where(eq(schema.clients.id, invoice.clientId));

        return JSON.stringify({
          paid: true,
          invoiceId: invoice.id,
          invoiceNumber: invoice.number,
          amount: `$${(invoice.amount / 100).toLocaleString()}`,
          paidAt: now.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }),
        });
      }

      default:
        return JSON.stringify({ error: `Unknown CEO tool: ${name}` });
    }
  } catch (error) {
    return JSON.stringify({
      error: `CEO tool ${name} failed: ${error instanceof Error ? error.message : "unknown"}`,
    });
  }
}
