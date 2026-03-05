import { config } from "dotenv";
config({ path: ".env.local" });
import { neon } from "@neondatabase/serverless";

async function main() {
  const sql = neon(process.env.DATABASE_URL as string);
  try {
    await sql`ALTER TABLE weekly_sprints ADD CONSTRAINT weekly_sprints_share_token_unique UNIQUE (share_token)`;
    console.log("unique constraint added to weekly_sprints.share_token");
  } catch (e: unknown) {
    const msg = (e as Error).message ?? "";
    if (msg.includes("already exists")) {
      console.log("constraint already exists — ok");
    } else {
      throw e;
    }
  }
}

main().catch(console.error);
