# Database Migration Guide

## Current State

The `/drizzle` directory does not exist yet. The baseline migration has not been generated.
Production has been managed with `db:push` and a series of manual ad-hoc scripts in `scripts/`.
The baseline generation is a one-time human-verified step described below under "Generating the Baseline."

Once the baseline exists, all future schema changes must go through the migration ritual below.

---

## The Migration Ritual

Every schema change follows this exact sequence. No exceptions.

### 1. Edit the schema

Make your changes in `lib/db/schema/*.ts`. Keep changes small and focused — one migration per logical change.

### 2. Generate the migration

```bash
pnpm db:generate --name=<descriptive-snake-case-name>
```

Examples:
- `pnpm db:generate --name=add-client-timezone`
- `pnpm db:generate --name=drop-legacy-sprint-tasks`
- `pnpm db:generate --name=add-pgvector-embeddings-to-clients`

This writes a new SQL file to `./drizzle/`. Review it before committing.

### 3. Review the generated SQL

Read the generated `.sql` file. Verify:
- It does exactly what you intended
- No unexpected DROP statements
- Column types match your schema definition
- Indexes are correct

If anything looks wrong, fix the schema and regenerate.

### 4. Commit schema + migration together

Both the schema change and the generated migration file must live in the same commit.

```bash
git add lib/db/schema/your-file.ts drizzle/
git commit -m "feat(db): add client timezone column"
```

Never commit a schema change without its migration, and never commit a migration without its schema change.

### 5. Deploy code, then run migrations

Deploy the Next.js app first, then apply migrations:

```bash
pnpm db:migrate
```

This runs `scripts/migrate.ts`, which uses a dedicated postgres-js connection (not the neon-http runtime driver) to apply pending migrations tracked in `public.__drizzle_migrations`.

---

## Destructive Operation Checklist

Any of the following requires extra care. Create a Neon branch before applying:

- `DROP TABLE` — unrecoverable without PITR or a branch snapshot
- `DROP COLUMN` — use the expand-contract pattern (see rollback runbook)
- `ALTER COLUMN TYPE` that narrows (e.g., `text` to `varchar(50)`) — may truncate data
- Adding `NOT NULL` to an existing column without a backfill — will fail if any rows exist
- Renaming a column — Drizzle emits DROP + ADD, not ALTER; use two migrations

For any of these, follow the expand-contract pattern in `docs/runbooks/db-rollback.md`.

---

## pgvector and pg_trgm Extensions

Drizzle Kit does NOT emit `CREATE EXTENSION` statements. These extensions must already exist in the target database before any migration runs.

Required extensions:
- `pgvector` — for vector similarity search (`lib/db/schema/ai.ts`)
- `pg_trgm` — for trigram text search

If deploying to a new Neon branch or database, run manually before migrations:
```sql
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS pg_trgm;
```

Verify on any new environment before running `pnpm db:migrate`.

---

## Generating the Baseline (One-Time, Human Step)

This must be done against a Neon branch of production (not prod directly):

1. Create a Neon branch from `main` (production)
2. Set `DATABASE_URL` to the branch connection string
3. Run: `pnpm db:generate --name=baseline`
4. Review the generated SQL against the actual tables on the branch
5. Run `pnpm db:migrate` against the branch to verify it applies cleanly
6. If clean, commit the `/drizzle` directory and merge to main
7. Run `pnpm db:migrate` against production

---

## Why `db:push:dangerous` Still Exists

`pnpm db:push:dangerous` maps to `drizzle-kit push`, which pushes schema changes directly to a database without generating migration files or tracking what was applied.

It is kept for:
- Ephemeral local development databases
- Rapid experimentation on throwaway Neon branches

It must never be run against production. That is why it was renamed — the friction is intentional.

---

## Drift Detection

```bash
pnpm db:check
```

Runs `drizzle-kit check` to detect drift between the generated migration history and the current schema files. Run this in CI before merge.

---

## Rollback Runbook

See `docs/runbooks/db-rollback.md` for PITR, Neon branch strategy, and the expand-contract pattern.
