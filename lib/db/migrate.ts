import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

export const MIGRATIONS_FOLDER = "./drizzle";

export async function runMigrations(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is not set");
  }

  const start = new Date().toISOString();
  console.log(`[migrate] Starting migrations at ${start}`);

  const client = postgres(databaseUrl, { max: 1 });
  const db = drizzle(client);

  try {
    await migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });
    const end = new Date().toISOString();
    console.log(`[migrate] Migrations complete at ${end}`);
  } finally {
    await client.end();
  }
}
