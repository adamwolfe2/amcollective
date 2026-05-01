/**
 * Service-token auth for the MCP server.
 *
 * The MCP endpoint at /api/mcp is consumed by external agents (Hermes)
 * over HTTP. They authenticate with a bearer token (MCP_SERVICE_TOKEN env)
 * which acts as an admin-equivalent service identity.
 *
 * Tokens should be long random strings (e.g. `openssl rand -hex 32`).
 * Rotate by changing the env var and pushing.
 */

import { timingSafeEqual } from "node:crypto";

export interface McpAuthContext {
  /** The agent identity (e.g. "hermes"). Used for audit logging. */
  agent: string;
  /** Optional Slack channel scope passed by the calling agent. */
  channel?: string;
  /** Optional Slack user invoking the call. */
  slackUser?: string;
}

/**
 * Authenticate an incoming MCP request from its headers.
 * Returns an auth context on success or null on failure.
 */
export function authenticateMcpRequest(req: Request): McpAuthContext | null {
  const expected = process.env.MCP_SERVICE_TOKEN;
  // Fail closed unconditionally if token is not set.
  // For local dev, set MCP_SERVICE_TOKEN in .env.local to any random string.
  if (!expected) return null;

  const header = req.headers.get("authorization") ?? "";
  const match = /^Bearer\s+(.+)$/i.exec(header);
  if (!match) return null;
  const presented = match[1].trim();

  // Constant-time comparison to avoid timing attacks.
  const presentedBuf = Buffer.from(presented);
  const expectedBuf = Buffer.from(expected);
  if (presentedBuf.length !== expectedBuf.length) return null;
  if (!timingSafeEqual(presentedBuf, expectedBuf)) return null;

  return {
    agent: req.headers.get("x-mcp-agent") ?? "hermes",
    channel: req.headers.get("x-mcp-channel") ?? undefined,
    slackUser: req.headers.get("x-mcp-slack-user") ?? undefined,
  };
}
