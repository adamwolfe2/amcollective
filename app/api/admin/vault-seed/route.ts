/**
 * POST /api/admin/vault-seed
 *
 * One-time seeding endpoint. Reads all known env vars from process.env,
 * encrypts them, and inserts them into the credentials vault.
 * Idempotent — skips any entry whose label already exists.
 * Admin-only.
 */

import { NextResponse } from "next/server";
import { checkAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { encryptPassword } from "@/lib/vault/crypto";

// ─── Credential Map ───────────────────────────────────────────────────────────
// Each entry: { label, service, envVar, url?, notes? }
// The env var value becomes the encrypted password field.

const SEED_ENTRIES = [
  // ── Anthropic ──
  { label: "Anthropic API Key", service: "anthropic", envVar: "ANTHROPIC_API_KEY", url: "https://console.anthropic.com" },

  // ── ArcJet ──
  { label: "ArcJet Key", service: "arcjet", envVar: "ARCJET_KEY", url: "https://app.arcjet.com" },

  // ── Bloo.io ──
  { label: "Bloo.io API Key", service: "blooio", envVar: "BLOOIO_API_KEY", url: "https://bloo.io" },

  // ── Clerk ──
  { label: "Clerk Secret Key", service: "clerk", envVar: "CLERK_SECRET_KEY", url: "https://dashboard.clerk.com" },
  { label: "Clerk Publishable Key", service: "clerk", envVar: "NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY", url: "https://dashboard.clerk.com" },

  // ── Composio ──
  { label: "Composio API Key", service: "composio", envVar: "COMPOSIO_API_KEY", url: "https://app.composio.dev" },
  { label: "Composio Webhook Secret", service: "composio", envVar: "COMPOSIO_WEBHOOK_SECRET", url: "https://app.composio.dev" },
  { label: "Composio Project ID", service: "composio", envVar: "COMPOSIO_PROJECT_ID", url: "https://app.composio.dev" },

  // ── EmailBison ──
  { label: "EmailBison API Key", service: "emailbison", envVar: "EMAILBISON_API_KEY", url: process.env.EMAILBISON_BASE_URL || "https://emailbison.com", notes: `Base URL: ${process.env.EMAILBISON_BASE_URL || ""}` },
  { label: "EmailBison Base URL", service: "emailbison", envVar: "EMAILBISON_BASE_URL", notes: "API base URL" },

  // ── Firecrawl ──
  { label: "Firecrawl API Key", service: "firecrawl", envVar: "FIRECRAWL_API_KEY", url: "https://www.firecrawl.dev/app" },

  // ── GitHub ──
  { label: "GitHub PAT", service: "github", envVar: "GITHUB_PAT", url: "https://github.com/settings/tokens", notes: `Repo: ${process.env.GITHUB_KNOWLEDGE_REPO || ""}` },

  // ── Linear ──
  { label: "Linear API Key", service: "linear", envVar: "LINEAR_API_KEY", url: "https://linear.app/settings/api" },
  { label: "Linear Webhook Secret", service: "linear", envVar: "LINEAR_WEBHOOK_SECRET", url: "https://linear.app/settings/api" },

  // ── Mercury ──
  { label: "Mercury API Key", service: "mercury", envVar: "MERCURY_API_KEY", url: "https://app.mercury.com/settings/developer" },

  // ── Neon ──
  { label: "Neon API Key", service: "neon", envVar: "NEON_API_KEY", url: "https://console.neon.tech" },
  { label: "AM Collective Database URL", service: "neon", envVar: "DATABASE_URL", notes: "Primary AM Collective Neon DB" },
  { label: "Cursive Database URL", service: "neon", envVar: "CURSIVE_DATABASE_URL", notes: "Cursive Neon DB" },
  { label: "TaskSpace Database URL", service: "neon", envVar: "TASKSPACE_DATABASE_URL", notes: "TaskSpace Neon DB" },
  { label: "Trackr Database URL", service: "neon", envVar: "TRACKR_DATABASE_URL", notes: "Trackr Neon DB" },
  { label: "Wholesail Database URL", service: "neon", envVar: "WHOLESAIL_DATABASE_URL", notes: "Wholesail Neon DB" },

  // ── OpenAI ──
  { label: "OpenAI API Key", service: "openai", envVar: "OPENAI_API_KEY", url: "https://platform.openai.com/api-keys" },

  // ── PostHog ──
  { label: "PostHog API Key", service: "posthog", envVar: "NEXT_PUBLIC_POSTHOG_KEY", url: "https://app.posthog.com" },

  // ── Resend ──
  { label: "Resend API Key", service: "resend", envVar: "RESEND_API_KEY", url: "https://resend.com/api-keys" },

  // ── Sentry ──
  { label: "Sentry Auth Token", service: "sentry", envVar: "SENTRY_AUTH_TOKEN", url: "https://sentry.io/settings/auth-tokens/", notes: `Org: ${process.env.SENTRY_ORG || ""} / Project: ${process.env.SENTRY_PROJECT || ""}` },
  { label: "Sentry DSN", service: "sentry", envVar: "SENTRY_DSN", url: "https://sentry.io" },

  // ── Slack ──
  { label: "Slack Bot Token", service: "slack", envVar: "SLACK_BOT_TOKEN", url: "https://api.slack.com/apps" },
  { label: "Slack Signing Secret", service: "slack", envVar: "SLACK_SIGNING_SECRET", url: "https://api.slack.com/apps" },
  { label: "Slack Webhook URL", service: "slack", envVar: "SLACK_WEBHOOK_URL", url: "https://api.slack.com/apps" },

  // ── Stripe ──
  { label: "Stripe Secret Key", service: "stripe", envVar: "STRIPE_SECRET_KEY", url: "https://dashboard.stripe.com/apikeys" },
  { label: "Stripe Webhook Secret", service: "stripe", envVar: "STRIPE_WEBHOOK_SECRET", url: "https://dashboard.stripe.com/webhooks" },
  { label: "Stripe Account IDs", service: "stripe", envVar: "STRIPE_ACCOUNT_IDS", notes: "Comma-separated portfolio Stripe account IDs" },

  // ── Tavily ──
  { label: "Tavily API Key", service: "tavily", envVar: "TAVILY_API_KEY", url: "https://app.tavily.com" },

  // ── Upstash ──
  { label: "Upstash Redis REST Token", service: "upstash", envVar: "UPSTASH_REDIS_REST_TOKEN", url: "https://console.upstash.com" },
  { label: "Upstash Redis REST URL", service: "upstash", envVar: "UPSTASH_REDIS_REST_URL", url: "https://console.upstash.com" },

  // ── Vercel ──
  { label: "Vercel API Token", service: "vercel", envVar: "VERCEL_API_TOKEN", url: "https://vercel.com/account/tokens", notes: `Team: ${process.env.VERCEL_TEAM_ID || ""}` },

  // ── Internal Secrets ──
  { label: "Bot Internal Secret", service: "internal", envVar: "BOT_INTERNAL_SECRET", notes: "Shared secret for /api/bot/* routes" },
  { label: "OpenClaw Shared Secret", service: "internal", envVar: "OPENCLAW_SHARED_SECRET", notes: "OpenClaw webhook auth" },
  { label: "Credentials Encryption Secret", service: "internal", envVar: "CREDENTIALS_SECRET", notes: "AES-256-GCM key for vault encryption" },
  { label: "Wholesail Connector Secret", service: "internal", envVar: "WHOLESAIL_CONNECTOR_SECRET", notes: "Wholesail connector auth" },
] as const;

// ─── Route ────────────────────────────────────────────────────────────────────

export async function POST() {
  const userId = await checkAdmin();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    // Fetch existing labels to skip duplicates
    const existing = await db
      .select({ label: schema.credentials.label })
      .from(schema.credentials);
    const existingLabels = new Set(existing.map((r) => r.label.toLowerCase()));

    let seeded = 0;
    let skipped = 0;
    const skippedMissing: string[] = [];

    for (const entry of SEED_ENTRIES) {
      const value = process.env[entry.envVar];

      // Skip if no value in env
      if (!value) {
        skippedMissing.push(entry.label);
        skipped++;
        continue;
      }

      // Skip if label already in vault
      if (existingLabels.has(entry.label.toLowerCase())) {
        skipped++;
        continue;
      }

      await db.insert(schema.credentials).values({
        label: entry.label,
        service: entry.service,
        username: entry.envVar, // store the env var name as the "username" for reference
        passwordEncrypted: encryptPassword(value),
        url: "url" in entry ? (entry.url as string) : null,
        notes: "notes" in entry ? (entry.notes as string) : null,
        clientId: null,
        projectId: null,
        createdBy: userId,
      });

      seeded++;
    }

    return NextResponse.json({
      success: true,
      seeded,
      skipped,
      message: `Seeded ${seeded} credentials into vault. Skipped ${skipped}.`,
    });
  } catch (error) {
    console.error("[admin-vault-seed]", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
