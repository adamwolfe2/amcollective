/**
 * Embeddings — generate, store, and search vector embeddings
 *
 * Uses Voyager-3 via Anthropic or falls back to simple TF-IDF-like approach.
 * Stores in pgvector embeddings table.
 *
 * Note: Anthropic doesn't have a native embeddings endpoint as of early 2026.
 * We use Voyage AI (voyage-3-lite) via their API, or fall back to OpenAI text-embedding-3-small.
 * If neither is configured, we skip embeddings gracefully.
 */

import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { sql } from "drizzle-orm";

type EmbeddingSourceType = "sop" | "client_note" | "project_doc" | "invoice" | "meeting" | "conversation";

// ─── Embedding Query Cache (in-memory, 1-hour TTL, max 500 entries) ──────────

const EMBEDDING_CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour
const EMBEDDING_CACHE_MAX_SIZE = 500;

const embeddingCache = new Map<string, { embedding: number[]; expires: number }>();

function getCachedEmbedding(query: string): number[] | null {
  const entry = embeddingCache.get(query);
  if (!entry) return null;
  if (Date.now() > entry.expires) {
    embeddingCache.delete(query);
    return null;
  }
  return entry.embedding;
}

function setCachedEmbedding(query: string, embedding: number[]): void {
  // Evict oldest entries if at capacity
  if (embeddingCache.size >= EMBEDDING_CACHE_MAX_SIZE) {
    let oldestKey: string | null = null;
    let oldestExpires = Infinity;
    for (const [key, entry] of embeddingCache) {
      if (entry.expires < oldestExpires) {
        oldestExpires = entry.expires;
        oldestKey = key;
      }
    }
    if (oldestKey) embeddingCache.delete(oldestKey);
  }
  embeddingCache.set(query, {
    embedding,
    expires: Date.now() + EMBEDDING_CACHE_TTL_MS,
  });
}

// ─── Generate Embedding ──────────────────────────────────────────────────────

export async function generateEmbedding(text: string): Promise<number[] | null> {
  // Try OpenAI embeddings (most common, cheap)
  if (process.env.OPENAI_API_KEY) {
    return generateOpenAIEmbedding(text);
  }

  // No embedding provider configured
  console.log("[embeddings] No embedding provider configured, skipping");
  return null;
}

async function generateOpenAIEmbedding(text: string): Promise<number[]> {
  const res = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "text-embedding-3-small",
      input: text.slice(0, 8000), // Token limit safety
    }),
  });

  if (!res.ok) {
    throw new Error(`OpenAI embeddings failed: ${res.status}`);
  }

  const data = await res.json();
  return data.data[0].embedding;
}

// ─── Store Embedding ─────────────────────────────────────────────────────────

export async function storeEmbedding(
  content: string,
  sourceType: EmbeddingSourceType,
  sourceId: string,
  metadata?: Record<string, unknown>
): Promise<boolean> {
  const embedding = await generateEmbedding(content);
  if (!embedding) return false;

  // Atomic upsert on (sourceType, sourceId) unique index
  await db
    .insert(schema.embeddings)
    .values({
      content,
      embedding,
      sourceType,
      sourceId,
      metadata: metadata ?? null,
    })
    .onConflictDoUpdate({
      target: [schema.embeddings.sourceType, schema.embeddings.sourceId],
      set: {
        content,
        embedding,
        metadata: metadata ?? null,
        createdAt: new Date(),
      },
    });

  return true;
}

// ─── Search Similar ──────────────────────────────────────────────────────────

export async function searchSimilar(
  query: string,
  limit = 5,
  sourceType?: EmbeddingSourceType
): Promise<Array<{ content: string; sourceType: string; sourceId: string | null; similarity: number; metadata: unknown }>> {
  // Check in-memory cache first to avoid redundant OpenAI API calls
  let queryEmbedding = getCachedEmbedding(query);
  if (!queryEmbedding) {
    const generated = await generateEmbedding(query);
    if (!generated) return [];
    queryEmbedding = generated;
    setCachedEmbedding(query, queryEmbedding);
  }

  const vectorStr = `[${queryEmbedding.join(",")}]`;

  const conditions = sourceType
    ? sql`${schema.embeddings.sourceType} = ${sourceType}`
    : sql`1=1`;

  const results = await db
    .select({
      content: schema.embeddings.content,
      sourceType: schema.embeddings.sourceType,
      sourceId: schema.embeddings.sourceId,
      metadata: schema.embeddings.metadata,
      similarity: sql<number>`1 - (${schema.embeddings.embedding} <=> ${vectorStr}::vector)`.as("similarity"),
    })
    .from(schema.embeddings)
    .where(conditions)
    .orderBy(sql`${schema.embeddings.embedding} <=> ${vectorStr}::vector`)
    .limit(limit);

  return results;
}
