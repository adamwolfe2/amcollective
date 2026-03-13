/**
 * CEO Agent Tools — ClaudeBot-specific extensions
 *
 * Extends the base TOOL_DEFINITIONS with CEO-only capabilities:
 * memory management, proactive messaging, delegation, and company snapshots.
 *
 * Uses the Anthropic SDK tool format (not Vercel AI SDK).
 */

export { CEO_TOOL_DEFINITIONS } from "./definitions";

import { handler as memoryHandler } from "./memory-tools";
import { handler as communicationHandler } from "./communication-tools";
import { handler as crmHandler } from "./crm-tools";
import { handler as financeHandler } from "./finance-tools";
import { handler as operationsHandler } from "./operations-tools";
import { handler as systemHandler } from "./system-tools";

const handlers = [
  memoryHandler,
  communicationHandler,
  crmHandler,
  financeHandler,
  operationsHandler,
  systemHandler,
];

export async function executeCeoTool(
  name: string,
  input: Record<string, unknown>
): Promise<string> {
  try {
    for (const handler of handlers) {
      const result = await handler(name, input);
      if (result !== undefined) return result;
    }
    return JSON.stringify({ error: `Unknown CEO tool: ${name}` });
  } catch (error) {
    return JSON.stringify({
      error: `CEO tool ${name} failed: ${error instanceof Error ? error.message : "unknown"}`,
    });
  }
}
