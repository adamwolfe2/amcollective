/**
 * Communication domain tools — send_to_slack, send_sms, send_email,
 * get_outreach_snapshot, toggle_campaign, draft_cold_email, set_campaign_knowledge
 */

import type Anthropic from "@anthropic-ai/sdk";
import { sendMessage as blooSendMessage } from "@/lib/integrations/blooio";
import { createAuditLog } from "@/lib/db/repositories/audit";
import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { eq, ilike } from "drizzle-orm";

export const definitions: Anthropic.Tool[] = [
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
    name: "send_email",
    description:
      "Send an email via Resend. Use when asked to 'send an email to [person]', 'email [client] about [topic]', or to send a drafted cold email. Requires to, subject, and body.",
    input_schema: {
      type: "object" as const,
      properties: {
        to: { type: "string", description: "Recipient email address" },
        subject: { type: "string", description: "Email subject line" },
        body: { type: "string", description: "Email body in plain text" },
        replyTo: { type: "string", description: "Optional reply-to email address" },
      },
      required: ["to", "subject", "body"],
    },
  },
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
];

export async function handler(
  name: string,
  input: Record<string, unknown>
): Promise<string | undefined> {
  switch (name) {
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

    case "send_email": {
      const { Resend } = await import("resend");
      const apiKey = process.env.RESEND_API_KEY;
      if (!apiKey) return JSON.stringify({ error: "RESEND_API_KEY not configured" });

      const resend = new Resend(apiKey);
      const fromEmail = process.env.RESEND_FROM_EMAIL || "team@amcollectivecapital.com";
      const to = input.to as string;
      const subject = input.subject as string;
      const body = input.body as string;
      const replyTo = input.replyTo as string | undefined;

      const sendOptions: {
        from: string;
        to: string;
        subject: string;
        text: string;
        reply_to?: string;
      } = {
        from: fromEmail,
        to,
        subject,
        text: body,
      };
      if (replyTo) sendOptions.reply_to = replyTo;

      const result = await resend.emails.send(sendOptions);

      // Audit log
      await createAuditLog({
        actorId: "claudebot",
        actorType: "system",
        action: "email.sent",
        entityType: "email",
        entityId: (result.data as { id?: string })?.id ?? "unknown",
        metadata: { to, subject, fromEmail },
      });

      return JSON.stringify({ sent: true, to, subject, id: (result.data as { id?: string })?.id });
    }

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

      const campaignNameResolved = campaign?.name ?? (input.campaignName as string) ?? "Unknown";

      if (input.fullSequence) {
        const drafts = await draftFullSequence(
          campaignNameResolved,
          knowledgeBase,
          prospect,
          (input.useHighQuality as boolean) ?? false
        );
        return JSON.stringify({
          campaign: campaignNameResolved,
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
        campaignName: campaignNameResolved,
        knowledgeBase,
        prospect,
        emailType: (input.emailType as "initial" | "followup-1" | "followup-2" | "followup-3" | "breakup") ?? "initial",
        instruction: input.instruction as string | undefined,
        useHighQuality: (input.useHighQuality as boolean) ?? false,
      });

      return JSON.stringify({
        campaign: campaignNameResolved,
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
        .where(eq(schema.outreachCampaigns.id, campaign.id));

      return JSON.stringify({
        updated: true,
        campaign: campaign.name,
        readyToDraft: missingForDrafting.length === 0,
        missingForDrafting: missingForDrafting.length ? missingForDrafting : undefined,
        knowledgeBase: updated,
      });
    }

    default:
      return undefined;
  }
}
