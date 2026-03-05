import { config } from "dotenv";
config({ path: ".env.local" });
import { neon } from "@neondatabase/serverless";

async function main() {
  const sql = neon(process.env.DATABASE_URL!);
  const rows = await sql`SELECT name, slug, status FROM portfolio_projects ORDER BY name`;
  console.log(JSON.stringify(rows, null, 2));
  process.exit(0);
}
main().catch(e => { console.error(e); process.exit(1); });
