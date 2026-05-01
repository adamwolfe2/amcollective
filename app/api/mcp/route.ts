/**
 * MCP server endpoint for AM Collective.
 *
 * Speaks the Streamable HTTP transport from the official MCP SDK. Used by
 * external agents (Hermes) running on Modal/VPS to reach into AM Collective
 * data via Slack.
 *
 * Auth: Bearer token in Authorization header, must match MCP_SERVICE_TOKEN
 * env. Optional context headers x-mcp-agent / x-mcp-channel / x-mcp-slack-user
 * are recorded in the audit log.
 *
 * Stateless: each request handled independently (no session id). Hermes does
 * not need server-side session continuity for tool calls.
 */

import { NextResponse } from "next/server";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";

import { authenticateMcpRequest, type McpAuthContext } from "@/lib/mcp/auth";
import { logMcpCall } from "@/lib/mcp/audit";
import { registerTools } from "@/lib/mcp/tools";
import { ajMcp } from "@/lib/middleware/arcjet";

// Force Node runtime — Drizzle uses Node APIs and we use crypto.timingSafeEqual.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function buildServer(ctx: McpAuthContext) {
  const server = new McpServer(
    { name: "am-collective", version: "0.1.0" },
    {
      capabilities: {
        tools: { listChanged: false },
      },
      instructions:
        "AM Collective operational MCP server. Read tools query the dashboard's database and connector cache (Stripe, Vercel, Neon). Write tools mutate EOS/alert state. Always cite the data source when reporting numbers to the user.",
    },
  );
  registerTools(server, ctx);
  return server;
}

/**
 * Pull tool name + args from a JSON-RPC body for audit logging.
 * Returns null for non-tool-call methods (initialize, tools/list, etc).
 */
function extractToolCall(
  body: unknown,
): { tool: string; args: Record<string, unknown> } | null {
  if (!body || typeof body !== "object") return null;
  const b = body as Record<string, unknown>;
  if (b.method !== "tools/call") return null;
  const params = b.params as Record<string, unknown> | undefined;
  if (!params || typeof params.name !== "string") return null;
  return {
    tool: params.name,
    args:
      params.arguments && typeof params.arguments === "object"
        ? (params.arguments as Record<string, unknown>)
        : {},
  };
}

export async function POST(req: Request) {
  // Rate-limit before auth so brute-force token probing costs as much as
  // legitimate requests (30/min per IP; Hermes sends ≤2 per cron run).
  if (ajMcp) {
    const decision = await ajMcp.protect(req as Parameters<typeof ajMcp.protect>[0], { requested: 1 });
    if (decision.isDenied()) {
      return NextResponse.json(
        { error: "Too many requests." },
        { status: 429 },
      );
    }
  }

  const ctx = authenticateMcpRequest(req);
  if (!ctx) {
    return NextResponse.json(
      { error: "Unauthorized — missing or invalid bearer token." },
      { status: 401 },
    );
  }

  // Parse body once so we can both audit-log and pass to the SDK transport.
  let parsedBody: unknown;
  try {
    parsedBody = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const callInfo = extractToolCall(parsedBody);
  const startedAt = Date.now();

  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });
  const server = await buildServer(ctx);
  await server.connect(transport);

  let response: Response;
  try {
    response = await transport.handleRequest(req, { parsedBody });
  } catch (e) {
    // Never echo internal error messages (may contain SQL schema, table names,
    // constraint details). Log server-side only.
    const reqId = crypto.randomUUID().slice(0, 8);
    console.error(`[mcp] request handler error (reqId=${reqId}):`, e);
    response = NextResponse.json(
      { error: "Internal server error.", reqId },
      { status: 500 },
    );
  } finally {
    transport.close().catch(() => undefined);
    server.close().catch(() => undefined);
  }

  // Audit-log tool calls; skip protocol traffic (initialize, tools/list).
  if (callInfo) {
    void logMcpCall({
      ctx,
      tool: callInfo.tool,
      args: callInfo.args,
      result: response.ok ? "ok" : "error",
      durationMs: Date.now() - startedAt,
      error: response.ok ? undefined : `HTTP ${response.status}`,
    });
  }

  return response;
}

export async function GET() {
  // Diagnostic ping. Hermes uses POST for JSON-RPC; this is for humans.
  return NextResponse.json({
    service: "am-collective-mcp",
    status: "ok",
    docs: "POST JSON-RPC 2.0 messages here. Authenticate with `Authorization: Bearer <MCP_SERVICE_TOKEN>`.",
  });
}
