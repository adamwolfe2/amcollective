/**
 * Memory domain tools — write_memory, read_memory, list_memories, search_memory,
 * write_bot_memory, read_bot_memory
 */

import type Anthropic from "@anthropic-ai/sdk";
import { readMemory, writeMemory, listMemory, searchMemory } from "../memory";
import { setMemory, getAllMemory } from "@/lib/db/repositories/bot-memory";

export const definitions: Anthropic.Tool[] = [
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
];

export async function handler(
  name: string,
  input: Record<string, unknown>
): Promise<string | undefined> {
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

    default:
      return undefined;
  }
}
