/**
 * Test OpenAI API connection -- generates a test embedding.
 *
 * Usage: npx tsx --env-file=.env.local scripts/test-openai.ts
 */

import { config } from "dotenv";
config({ path: ".env.local" });

async function main() {
  const key = process.env.OPENAI_API_KEY;
  if (!key) {
    console.error("OPENAI_API_KEY is not set");
    process.exit(1);
  }

  console.log("Testing OpenAI API connection...\n");

  const res = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "text-embedding-3-small",
      input: "Test embedding for AM Collective",
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    console.error(`OpenAI API error: ${res.status} ${res.statusText}`);
    console.error(text);
    process.exit(1);
  }

  const data = await res.json();
  const embedding = data.data?.[0]?.embedding;

  console.log(`Model: ${data.model}`);
  console.log(`Embedding dimensions: ${embedding?.length ?? "unknown"}`);
  console.log(`Usage: ${data.usage?.total_tokens ?? "?"} tokens`);
  console.log("\nOpenAI connection: OK");
}

main().catch((err) => {
  console.error("OpenAI test failed:", err.message);
  process.exit(1);
});
