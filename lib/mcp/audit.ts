import { db } from "@/lib/db";
import { auditLogs } from "@/lib/db/schema";
import type { McpAuthContext } from "./auth";

/**
 * Fields that may contain PII or large free-text blobs — redacted from the
 * audit log before insertion. We keep the key names (so we know the field was
 * supplied) but replace the value with [redacted] to prevent the audit table
 * from becoming a PII dumpster.
 */
const REDACTED_FIELDS = new Set([
  "body",
  "plain_text",
  "notes",
  "description",
  "content",
  "email",
  "phone",
  "password",
  "token",
  "secret",
  "linkedin_url",
  "website",
]);

/** Max length for any single arg value in the audit log. */
const MAX_ARG_VALUE_LEN = 500;

/**
 * Sanitize tool args before logging:
 *  - Redact known PII / large-text fields
 *  - Truncate remaining string values to MAX_ARG_VALUE_LEN
 *  - Array values are summarized as "[N items]"
 */
function sanitizeArgs(
  args: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(args)) {
    if (REDACTED_FIELDS.has(k)) {
      out[k] = "[redacted]";
    } else if (Array.isArray(v)) {
      out[k] = `[${v.length} items]`;
    } else if (typeof v === "string" && v.length > MAX_ARG_VALUE_LEN) {
      out[k] = v.slice(0, MAX_ARG_VALUE_LEN) + "…[truncated]";
    } else {
      out[k] = v;
    }
  }
  return out;
}

/**
 * Record an MCP tool invocation in the audit log.
 *
 * Every Hermes tool call should produce one entry so we can trace agent
 * behavior, debug surprising results, and meet basic compliance.
 */
export async function logMcpCall(params: {
  ctx: McpAuthContext;
  tool: string;
  args: Record<string, unknown>;
  result: "ok" | "error";
  error?: string;
  durationMs: number;
}): Promise<void> {
  try {
    await db.insert(auditLogs).values({
      actorId: params.ctx.agent,
      actorType: "agent",
      action: `mcp.${params.tool}`,
      entityType: "mcp_tool",
      entityId: params.tool,
      metadata: {
        args: sanitizeArgs(params.args),
        result: params.result,
        error: params.error,
        durationMs: params.durationMs,
        slackChannel: params.ctx.channel,
        slackUser: params.ctx.slackUser,
      },
    });
  } catch (err) {
    // Never let audit failure crash a tool call.
    console.error("[mcp.audit] Failed to record audit log:", err);
  }
}
