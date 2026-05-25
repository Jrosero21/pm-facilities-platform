# Phase 2 — Admin / Internal SOP

Developer/administrator procedures introduced or changed in Phase 2. Builds on Phase 1 SOPs (env setup, seeding, running the app).

> **Prerequisites for every `mysql` command below:** the SSH tunnel must be open and `MYSQL_PWD` exported in your shell (Phase 1 SOP-1.A). Throughout this file, `mysql ...` is shorthand for the standard flag set: `mysql --protocol=tcp -h 127.0.0.1 -P 3307 -u jonnyrosero_jonny jonnyrosero_pm`.

## SOP-2.A — Generate and apply a migration (updated pipeline)
```bash
pnpm db:generate   # drizzle-kit generate → fix-mysql-engine → check-migration-identifiers
pnpm db:migrate    # apply pending migrations
```
- `db:generate` now runs three steps in order: generate the SQL, force `ENGINE=InnoDB` (Namecheap MariaDB defaults to MyISAM), then **check every identifier is ≤ 64 chars**.
- If the identifier check fails it prints the offending name, its kind (table/column/index/constraint), length, and a fix hint, then exits non-zero. Fix the schema (give the constraint/index an explicit short name, or shorten the table/column), delete the bad migration `.sql` + its `meta/*_snapshot.json`, revert the `meta/_journal.json` entry, and re-run `db:generate`.
- Always inspect the generated SQL before `db:migrate`.

## SOP-2.B — Recover a partially-applied migration
Prerequisite: SSH tunnel open and `MYSQL_PWD` exported (Phase 1 SOP-1.A); `mysql ...` is the shorthand defined at the top of this file.

If `db:migrate` fails midway (symptoms: tables exist but FK/index counts are short, and the migration is missing from `__drizzle_migrations`):
1. Identify what partially applied:
   ```bash
   mysql ... -e "SELECT id, hash FROM __drizzle_migrations ORDER BY id;"
   mysql ... -e "SELECT TABLE_NAME, COUNT(*) FROM information_schema.KEY_COLUMN_USAGE WHERE TABLE_SCHEMA='jonnyrosero_pm' AND REFERENCED_TABLE_NAME IS NOT NULL GROUP BY TABLE_NAME;"
   ```
2. Drop the partially-created tables (they are empty if the failure was during the FK step):
   ```bash
   mysql ... -e "SET FOREIGN_KEY_CHECKS=0; DROP TABLE IF EXISTS <tables>; SET FOREIGN_KEY_CHECKS=1;"
   ```
3. Delete the bad migration `.sql` + snapshot, revert `_journal.json`.
4. Fix the root cause (e.g. over-long identifier), `pnpm db:generate`, re-apply.

## SOP-2.C — Add CRUD for a schema-only detail table later
`client_location_hours`, `client_location_access_notes`, and `client_billing_rules` have schema but no data layer/UI. To light one up: add a `src/server/<entity>.ts` data layer (tenant-scoped, audit on write, parent-in-tenant guard like `client-locations.ts`), a server action, and screens under `(app)`. Follow the create+read pattern in `client-contacts.ts` / `location-contacts.ts`.

## SOP-2.D — Inspect Phase 2 data
```bash
mysql ... -e "SELECT name, client_code, status FROM clients;"
mysql ... -e "SELECT name, city, state_province FROM client_locations;"
mysql ... -e "SELECT action, target_type, created_at FROM audit_logs WHERE action LIKE 'client%' ORDER BY created_at DESC;"
```
