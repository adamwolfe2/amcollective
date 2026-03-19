/**
 * Database Extension Setup
 *
 * Enables pg_trgm for fuzzy text search.
 * Run once via: npx tsx lib/db/setup-extensions.ts
 * Or called at app startup.
 *
 * Neon PostgreSQL supports pg_trgm out of the box.
 */

import { db } from "@/lib/db";
import { sql } from "drizzle-orm";

export async function enableExtensions() {
  await db.execute(sql`CREATE EXTENSION IF NOT EXISTS pg_trgm`);
  // pg_trgm extension enabled
}

// Allow running as script
if (require.main === module) {
  enableExtensions()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
