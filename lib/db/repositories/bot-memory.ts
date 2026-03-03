/**
 * Bot Memory Repository
 *
 * Persistent key-value facts injected into every ClaudeBot prompt.
 * Two memory types coexist:
 *   - bot_memory (this file): structured short facts, always injected, never searched
 *   - GitHub memory (lib/ai/memory.ts): long-form narrative docs, semantically searched
 */

import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { eq } from "drizzle-orm";

export async function getAllMemory(): Promise<
  Array<{ key: string; value: string; category: string; source: string }>
> {
  return db
    .select({
      key: schema.botMemory.key,
      value: schema.botMemory.value,
      category: schema.botMemory.category,
      source: schema.botMemory.source,
    })
    .from(schema.botMemory)
    .orderBy(schema.botMemory.category, schema.botMemory.key);
}

export async function getMemory(key: string): Promise<string | null> {
  const [row] = await db
    .select({ value: schema.botMemory.value })
    .from(schema.botMemory)
    .where(eq(schema.botMemory.key, key))
    .limit(1);
  return row?.value ?? null;
}

export async function setMemory(
  key: string,
  value: string,
  category = "general",
  source: "manual" | "ai" | "system" = "manual"
): Promise<void> {
  await db
    .insert(schema.botMemory)
    .values({ key, value, category, source })
    .onConflictDoUpdate({
      target: schema.botMemory.key,
      set: { value, category, source, updatedAt: new Date() },
    });
}

export async function deleteMemory(key: string): Promise<void> {
  await db.delete(schema.botMemory).where(eq(schema.botMemory.key, key));
}

/**
 * Returns all memory formatted as an injectable string for Claude prompts.
 * Groups by category. Returns empty string if no memory is set.
 */
export async function formatMemoryForPrompt(): Promise<string> {
  const rows = await getAllMemory();
  if (rows.length === 0) return "";

  // Group by category
  const grouped = new Map<string, string[]>();
  for (const row of rows) {
    const cat = row.category;
    if (!grouped.has(cat)) grouped.set(cat, []);
    grouped.get(cat)!.push(`${row.key}: ${row.value}`);
  }

  const sections = Array.from(grouped.entries()).map(
    ([cat, items]) => `[${cat}]\n${items.join("\n")}`
  );

  return sections.join("\n\n");
}
