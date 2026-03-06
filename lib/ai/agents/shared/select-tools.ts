/**
 * Shared tool selector utility.
 *
 * Extracts keyword-based tool routing from CEO agent and applies it
 * to any agent that needs to reduce its tool surface area per request.
 * Always includes a minimal core set + modules triggered by keywords.
 */

import type Anthropic from "@anthropic-ai/sdk";

export interface ToolModule {
  keywords: string[];
  toolNames: string[];
}

/**
 * Given a user message and a list of tool modules (keyword → tool names),
 * returns the subset of tools relevant to the query.
 *
 * @param message - Raw user message text
 * @param allTools - Full list of Anthropic Tool definitions to filter from
 * @param modules - Keyword → tool name mapping modules
 * @param coreToolNames - Tools always included regardless of keywords
 */
export function selectToolsForQuery(
  message: string,
  allTools: Anthropic.Tool[],
  modules: ToolModule[],
  coreToolNames: Set<string> = new Set()
): Anthropic.Tool[] {
  const lower = message.toLowerCase();
  const toolMap = new Map(allTools.map((t) => [t.name, t]));
  const selected = new Set<string>(coreToolNames);

  for (const mod of modules) {
    if (mod.keywords.some((kw) => lower.includes(kw))) {
      for (const name of mod.toolNames) {
        selected.add(name);
      }
    }
  }

  // Preserve original definition order
  return allTools.filter((t) => selected.has(t.name) && toolMap.has(t.name));
}
