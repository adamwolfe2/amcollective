/**
 * Test Resend email connection -- sends a test email.
 *
 * Usage: npx tsx scripts/test-resend.ts
 */

import { config } from "dotenv";
config({ path: ".env.local" });

import { Resend } from "resend";

async function main() {
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    console.error("RESEND_API_KEY is not set");
    process.exit(1);
  }

  const resend = new Resend(key);

  console.log("Testing Resend connection...\n");

  // First test: verify API key by listing domains
  const { data: domains, error: domainError } = await resend.domains.list();
  if (domainError) {
    console.error("Domain list failed:", domainError.message);
  } else {
    console.log(`Verified domains: ${domains?.data?.length ?? 0}`);
    for (const d of domains?.data ?? []) {
      console.log(`  ${d.name} -- ${d.status}`);
    }
  }

  // Send test email
  const { data, error } = await resend.emails.send({
    from: "AM Collective <team@amcollectivecapital.com>",
    to: ["adamwolfe102@gmail.com"],
    subject: "AM Collective -- Integration Test",
    text: "This is an automated test from the AM Collective activation script. If you received this, Resend is working correctly.",
  });

  if (error) {
    console.error("Send failed:", error.message);
    console.log("\nResend connection: PARTIAL (API key valid, send failed -- check domain verification)");
    process.exit(1);
  }

  console.log(`\nEmail sent: ${data?.id}`);
  console.log("Resend connection: OK");
}

main().catch((err) => {
  console.error("Resend test failed:", err.message);
  process.exit(1);
});
