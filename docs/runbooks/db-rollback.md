# Database Rollback Runbook

## Philosophy: Forward-Only Migrations

This project does not use down migrations. Safety comes from:
1. Neon PITR (point-in-time recovery) for catastrophic failures
2. Neon branches for testing before applying to production
3. The expand-contract pattern for destructive column changes

If a migration causes an outage, restore from Neon, then fix forward with a corrective migration.

---

## Primary Strategy: Neon PITR

Neon maintains a write-ahead log that enables restoring a branch to any point in time within the retention window (default: 7 days on paid plans).

### When to Use

- A migration corrupted data
- A bad deploy caused unrecoverable application errors
- A migration ran and cannot be cleanly reverted forward

### Steps

1. Open the Neon console: [https://console.neon.tech](https://console.neon.tech)
2. Select the **main** branch (production)
3. Click **Restore** (or **Branch from point in time**)
4. Select the timestamp just before the bad migration ran
5. Neon creates a new branch from that point — this is your restored copy
6. Verify the restored branch has correct data
7. Promote the restored branch to main (or swap connection strings)
8. Notify the team; redeploy without the bad migration

**PITR contacts / dashboards:**
- Neon dashboard: [PLACEHOLDER — add URL]
- Incident channel: [PLACEHOLDER — add Slack/Discord channel]
- On-call: [PLACEHOLDER — add contact]

---

## Secondary Strategy: Neon Branches

Before applying any risky migration (see destructive op checklist in `docs/MIGRATIONS.md`), create a branch snapshot of production and test against it first.

### Steps

1. In the Neon console, go to **Branches**
2. Create a new branch from `main` — name it `migration-test-YYYY-MM-DD`
3. Set your local `DATABASE_URL` to the branch connection string
4. Run `pnpm db:migrate` against the branch
5. Verify the application works correctly against the branch
6. If clean, run `pnpm db:migrate` against production
7. Delete the test branch after successful prod deployment

### CLI (Neon CLI)

```bash
# Create branch
neon branch create --name migration-test-$(date +%Y-%m-%d) --project-id <PROJECT_ID>

# Get connection string for branch
neon branch get <BRANCH_NAME> --project-id <PROJECT_ID>
```

---

## Expand-Contract Pattern (Column Drops and Renames)

Use this pattern for any destructive column operation. It spans multiple deploys and avoids data loss.

### Pattern for Dropping a Column

**Phase 1 — Expand (stop writing to old column)**
- Deploy code that stops writing to the old column
- Code still reads from old column as fallback
- No schema change yet

**Phase 2 — Backfill (if needed)**
- If the new column needs data from the old one, run a backfill script
- Verify data is complete before proceeding

**Phase 3 — Contract (switch reads)**
- Deploy code that reads exclusively from the new column
- Old column is now unused

**Phase 4 — Drop (schema change)**
- Generate migration: `pnpm db:generate --name=drop-old-column-name`
- Review the generated DROP COLUMN SQL
- Deploy code (unchanged), then run `pnpm db:migrate`
- The column is now gone

### Pattern for Renaming a Column

Drizzle emits `DROP COLUMN` + `ADD COLUMN` for renames — it does not emit `ALTER COLUMN RENAME`. Use expand-contract instead:

1. Add the new column (migration 1)
2. Deploy code that writes to both old and new columns
3. Backfill new column from old column
4. Deploy code that reads only from new column, still writes to both
5. Deploy code that writes only to new column
6. Drop the old column (migration 2)

---

## Emergency Contacts and Dashboards

| Resource | URL / Contact |
|----------|---------------|
| Neon Console | [PLACEHOLDER] |
| Vercel Dashboard | [PLACEHOLDER] |
| Sentry | [PLACEHOLDER] |
| Incident Slack Channel | [PLACEHOLDER] |
| On-Call Engineer | [PLACEHOLDER] |

---

## Quick Reference: What NOT to Do

- Do not write down migrations. There are none. Use PITR.
- Do not run `pnpm db:push:dangerous` against production. Ever.
- Do not apply a migration to production before testing on a Neon branch.
- Do not drop a column in the same deploy that removes the code using it — follow expand-contract.
