import { db } from "@/lib/db";
import { auditLogs } from "@/lib/db/schema";
import type { McpAuthContext } from "./auth";

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
        args: params.args,
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
