/**
 * Test Anthropic API connection -- sends a simple completion request.
 *
 * Usage: npx tsx scripts/test-anthropic.ts
 */

import { config } from "dotenv";
config({ path: ".env.local" });

import Anthropic from "@anthropic-ai/sdk";

async function main() {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) {
    console.error("ANTHROPIC_API_KEY is not set");
    process.exit(1);
  }

  const client = new Anthropic({ apiKey: key });

  console.log("Testing Anthropic API connection...\n");

  const message = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 100,
    messages: [
      { role: "user", content: "Respond with exactly: CONNECTION_OK" },
    ],
  });

  const text =
    message.content[0].type === "text" ? message.content[0].text : "";
  console.log(`Response: ${text.trim()}`);
  console.log(`Model: ${message.model}`);
  console.log(`Usage: ${message.usage.input_tokens} in / ${message.usage.output_tokens} out`);
  console.log("\nAnthropic connection: OK");
}

main().catch((err) => {
  console.error("Anthropic test failed:", err.message);
  process.exit(1);
});
