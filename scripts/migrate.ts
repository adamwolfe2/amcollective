/**
 * Drizzle migration runner — applies pending migrations to the target database.
 *
 * Usage:
 *   npx tsx --env-file=.env.local scripts/migrate.ts
 *
 * The script reads DATABASE_URL from the environment (loaded via --env-file or dotenv).
 * It connects with a single postgres-js connection (not the neon-http pool used at
 * runtime), runs all pending migrations from ./drizzle, then closes the connection.
 */

import "dotenv/config";
import { runMigrations } from "../lib/db/migrate";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error("[migrate] ERROR: DATABASE_URL is not set. Aborting.");
  process.exit(1);
}

runMigrations()
  .then(() => {
    console.log("[migrate] All migrations applied successfully.");
    process.exit(0);
  })
  .catch((err: unknown) => {
    console.error("[migrate] Migration failed:", err);
    process.exit(1);
  });
