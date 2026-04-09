# Schema Drift Inventory

This document records every manual migration script that has been run against production,
what each did, and whether the change is reflected in the current Drizzle schema files.

This inventory is the basis for generating a correct baseline migration. Before running
`pnpm db:generate --name=baseline`, the human must verify this list against the actual
production database and reconcile any gaps.

---

## Manual Migration Scripts (Chronological Best-Guess Order)

### 1. `scripts/add-credentials-table.ts`

**What it did:** Created the `credentials` table — an encrypted vault for storing service
credentials (username, password_encrypted, url, notes) linked to clients and/or projects.
Also created four indexes: `credentials_service_idx`, `credentials_client_id_idx`,
`credentials_project_id_idx`, `credentials_created_at_idx`.

**Schema reflected?** Needs verification — search `lib/db/schema/` for a `credentials` table
definition. If it exists there, Drizzle will include it in the baseline. If not, the table
is dark (exists in prod but not in schema files — a gap the baseline will miss).

---

### 2. `scripts/add-share-token-unique.ts`

**What it did:** Added a `UNIQUE` constraint (`weekly_sprints_share_token_unique`) on
`weekly_sprints.share_token`. The script was idempotent — it caught "already exists" errors.

**Schema reflected?** Check `lib/db/schema/sprints.ts` for `unique()` on `share_token`.
If the unique constraint is missing from the schema, Drizzle will not emit it in the baseline,
and `drizzle-kit check` will flag drift after baseline generation.

---

### 3. `scripts/add-stripe-sub-id.ts`

**What it did:** Added `stripe_subscription_id VARCHAR(255)` column to `subscription_costs`.
Also added a partial unique index `subscription_costs_stripe_sub_id_idx` on that column
`WHERE stripe_subscription_id IS NOT NULL`.

**Schema reflected?** Check `lib/db/schema/billing.ts` or `lib/db/schema/costs.ts` for
`stripe_subscription_id` on `subscription_costs`. Partial indexes are often not reflected in
Drizzle schema files — verify the index is defined explicitly.

---

### 4. `scripts/run-sprint-migration.ts`

**What it did:** A multi-step DDL migration:
- `ALTER TYPE task_source ADD VALUE 'sprint'` (standalone, outside transaction)
- Added `tasks.subtasks JSONB NOT NULL DEFAULT '[]'`
- Added `weekly_sprints.closed_at TIMESTAMP`
- Added four columns to `portfolio_projects`: `open_task_count`, `last_30d_completion_rate`,
  `velocity_label`, `metrics_last_updated_at`
- Created `task_sprint_assignments` table (originally with composite PK `(task_id, sprint_id)`)
- Created indexes: `tsa_sprint_id_idx`, `tsa_task_id_idx`, `tsa_section_id_idx`
- Created `sprint_snapshots` table with indexes: `ss_sprint_id_idx`, `ss_project_id_idx`

**Schema reflected?** Likely yes for most — this was a major sprint architecture migration
and schema files were updated alongside it. Verify `task_sprint_assignments` PK specifically
(see next item).

---

### 5. `scripts/fix-tsa-pk.ts`

**What it did:** Replaced the composite `PRIMARY KEY (task_id, sprint_id)` on
`task_sprint_assignments` with a new `id UUID` primary key. Added partial unique index
`uniq_active_tsa` on `(task_id, sprint_id) WHERE removed_at IS NULL`.

**Schema reflected?** Critical to verify. If `lib/db/schema/sprints.ts` defines
`task_sprint_assignments` with the composite PK (old), the baseline will be wrong. If it
defines the `id UUID` PK (new), it matches prod. The partial unique index may not be in the
schema at all — partial indexes are Drizzle `.using('partial')` territory.

---

### 6. `scripts/run-migration-0004.ts`

**What it did:** Added five columns to `portfolio_projects`:
- `launch_date TIMESTAMP`
- `product_stage VARCHAR(30)`
- `description TEXT`
- `target_market VARCHAR(200)`
- `monthly_goal_cents INTEGER`

**Schema reflected?** Check `lib/db/schema/projects.ts`. These columns should be present.

---

### 7. `scripts/run-migration-0005.ts`

**What it did:** Data-only + DDL:
- Set `portfolio_projects.status = 'archived'` for slug `campusgtm` (data change, not tracked in schema)
- Created index `sprint_sections_project_id_idx ON sprint_sections(project_id)`

**Schema reflected?** The data change is irrelevant to schema. The index should be in
`lib/db/schema/sprints.ts` as a Drizzle index definition. If missing, it won't appear in
the baseline.

---

### 8. `scripts/run-migration-0006.ts`

**What it did:** Added index `sprint_sections_assignee_id_idx ON sprint_sections(assignee_id)`.
Also idempotently re-created `sprint_sections_project_id_idx` (from 0005).

**Schema reflected?** Check `lib/db/schema/sprints.ts` for both index definitions.

---

### 9. `scripts/migrate-sprint-tasks.ts` and `scripts/migrate-sprint-tasks-force.ts`

**What they did:** Data backfill scripts only. They moved rows from `sprint_tasks` into
`tasks` + `task_sprint_assignments`. No DDL changes.

**Schema reflected?** Not applicable — pure data migration.

---

## Known Uncertainties (Human Verification Required)

Before generating the baseline, the following must be verified against the actual production database:

1. **`credentials` table existence** — Does it exist in `lib/db/schema/`? If not, it's a dark table.

2. **`task_sprint_assignments` PK** — Is the schema file using `id UUID` PK or the old composite PK? This is the most likely source of baseline drift.

3. **Partial unique index `uniq_active_tsa`** — Is it defined in the schema? Drizzle partial indexes require explicit `.where()` on the index definition.

4. **`weekly_sprints_share_token_unique` constraint** — Is the unique constraint in the schema for `share_token`?

5. **`subscription_costs_stripe_sub_id_idx`** — Is the partial unique index on `stripe_subscription_id` in the schema?

6. **All sprint_sections indexes** — `sprint_sections_project_id_idx` and `sprint_sections_assignee_id_idx` should appear in schema index definitions.

7. **pgvector and pg_trgm extensions** — Drizzle Kit does not track these. They must exist in prod already and must be created manually in any new environment before running migrations.

---

## Recommended Next Step (Human Action)

Run `pnpm drizzle-kit introspect` against a **Neon branch of production** (not prod directly).
This generates schema files from the live database structure.

Diff the introspected output against `lib/db/schema/*` to find every gap. Reconcile before
generating the baseline. Steps:

```bash
# 1. Create a Neon branch from main (production)
neon branch create --name introspect-$(date +%Y-%m-%d) --project-id <PROJECT_ID>

# 2. Set DATABASE_URL to the branch connection string
export DATABASE_URL="<branch-connection-string>"

# 3. Run introspect (outputs to a temp directory)
pnpm drizzle-kit introspect --out=./drizzle-introspect

# 4. Diff against current schema
diff -r drizzle-introspect/ lib/db/schema/

# 5. Reconcile differences in lib/db/schema/*, then delete drizzle-introspect/

# 6. Generate the baseline
pnpm db:generate --name=baseline

# 7. Verify baseline SQL looks correct, then commit /drizzle/
```

Do not run these commands against production directly.
