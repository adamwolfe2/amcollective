/**
 * Research Agent — on-demand web research via Tavily + Claude Sonnet
 *
 * Adapted from Trackr's research pipeline (~/trackr/lib/actions/research.ts)
 */

import { getAnthropicClient, MODEL_SONNET } from "../client";
import { storeEmbedding } from "../embeddings";
import { captureError } from "@/lib/errors";
import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { createAuditLog } from "@/lib/db/repositories/audit";

interface ResearchResult {
  query: string;
  summary: string;
  sources: Array<{ title: string; url: string; snippet: string }>;
  timestamp: string;
}

async function tavilySearch(
  query: string,
  maxResults = 5
): Promise<{ answer: string; results: Array<{ title: string; url: string; content: string }> }> {
  const apiKey = process.env.TAVILY_API_KEY;
  if (!apiKey) {
    return { answer: "", results: [] };
  }

  const res = await fetch("https://api.tavily.com/search", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      api_key: apiKey,
      query,
      search_depth: "advanced",
      max_results: maxResults,
      include_answer: true,
    }),
    signal: AbortSignal.timeout(10_000),
  });

  if (!res.ok) {
    captureError(new Error(`Tavily search failed: ${res.status}`), {
      tags: { source: "research" },
    });
    return { answer: "", results: [] };
  }

  return res.json();
}

export async function runResearch(
  query: string,
  actorId: string
): Promise<ResearchResult> {
  // Step 1: Tavily search
  const searchResults = await tavilySearch(query);

  // Step 2: Synthesize with Claude Sonnet
  const anthropic = getAnthropicClient();
  let summary: string;

  if (anthropic && searchResults.results.length > 0) {
    const contextText = searchResults.results
      .map((r, i) => `[${i + 1}] ${r.title}\n${r.content.slice(0, 1000)}`)
      .join("\n\n");

    const response = await anthropic.messages.create({
      model: MODEL_SONNET,
      max_tokens: 1000,
      messages: [
        {
          role: "user",
          content: `Research query: "${query}"

Web search results:
${contextText}

${searchResults.answer ? `Tavily AI summary: ${searchResults.answer}` : ""}

Synthesize these results into a concise research brief (3-5 paragraphs). Cite sources by number [1], [2], etc. Focus on actionable insights. If the results don't adequately answer the query, say so. Never use emojis.`,
        },
      ],
    });

    summary =
      response.content[0].type === "text"
        ? response.content[0].text
        : searchResults.answer || "No synthesis available.";
  } else {
    summary = searchResults.answer || "No results found. Try a different query.";
  }

  const result: ResearchResult = {
    query,
    summary,
    sources: searchResults.results.map((r) => ({
      title: r.title,
      url: r.url,
      snippet: r.content.slice(0, 200),
    })),
    timestamp: new Date().toISOString(),
  };

  // Step 3: Store as embedding for future RAG
  if (summary.length > 50) {
    await storeEmbedding(
      `Research: ${query}\n\n${summary}`,
      "project_doc",
      `research-${Date.now()}`,
      { type: "research", query, sourceCount: result.sources.length }
    );
  }

  // Step 4: Store as message for audit trail
  await db.insert(schema.messages).values({
    direction: "inbound",
    channel: "slack",
    from: "AM Agent Research",
    to: "internal",
    subject: `Research: ${query}`,
    body: summary,
    threadId: `research-${Date.now()}`,
  });

  await createAuditLog({
    actorId,
    actorType: "user",
    action: "create",
    entityType: "research",
    entityId: `research-${Date.now()}`,
    metadata: { query, sourceCount: result.sources.length },
  });

  return result;
}
