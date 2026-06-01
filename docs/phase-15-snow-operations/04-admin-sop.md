# Phase 15 — Admin SOP

## DB access (read-only verification)

Use the read-only CLI config; **name the database explicitly** (WP-12.1 — the login-path default DB is wrong):

```
mysql --defaults-extra-file=~/.pm_db.cnf jonnyrosero_pm -E -e "SELECT ..."        # PROD
mysql --defaults-extra-file=~/.pm_db.cnf jonnyrosero_pm_sandbox -E -e "SELECT ..." # SANDBOX
```

`-E` vertical output (never `\G`). Capture every load-bearing verdict to a file and `cat` it (§10).

## Sandbox-targeting env-override (phase-9 §1 — the foundational pattern)

The dev DB defaults to **prod** (`.env.local` → `jonnyrosero_pm`). To target the sandbox, derive the URL by regex-swapping the DB name (inline env wins over `.env.local`):

```
export DATABASE_URL="$(grep -E '^DATABASE_URL=' .env.local | cut -d= -f2- | sed -E 's#/jonnyrosero_pm(\?|$)#/jonnyrosero_pm_sandbox\1#')"
echo "${DATABASE_URL##*@}"   # MUST end in /jonnyrosero_pm_sandbox before proceeding
```

Required for `pnpm run db:migrate` (standalone sandbox replay — reads `DATABASE_URL` with no internal swap). The harness self-targets the sandbox (it swaps internally + hard-exits on a non-`_sandbox` URL) — run it with the plain alias.

## Migration cadence used (0039 / 0040 / 0041)

Each migration followed the same gated cycle, **one per cycle**:

1. Author the drizzle schema in `src/server/schema/snow.ts` (hand-named FKs, WP-12.2).
2. `pnpm run db:generate` → emits `db/migrations/00NN_*.sql` + journal + snapshot, runs `fix-mysql-engine.mjs`, then the **identifier guard** (see below).
3. Inspect the SQL (additive-only; correct FK delete rules; PK/FK `varchar(36)`).
4. **Sandbox apply** via the §1 override → `pnpm run db:migrate` → `-E` contract-verify (tables, FK matrix, enums).
5. **HALT for prod confirm** (gated by Jonny).
6. **Prod apply** → `pnpm run db:migrate` (reads `.env.local` = prod) → `-E` contract-verify on prod.
7. Commit the 4-file unit (schema + migration SQL + `_journal.json` + snapshot) **locally** (push deferred to the gated origin sequence).

Migration map: **0039** = `snow_programs`/`snow_sites`/`snow_service_triggers`; **0040** = `snow_events`/`snow_event_sites`/`snow_dispatches`; **0041** = `snow_service_logs`/`snow_weather_observations` + the `fk_sevent_weather` ADD CONSTRAINT (the only ALTER of an existing table — provably safe on the empty `snow_events`).

## The migration-identifier guard (NOTE)

The >64-char identifier guard is **NOT a pnpm alias** — `pnpm run db:check:migration-identifiers` does **not** exist. It runs automatically inside `db:generate`, and can be invoked directly:

```
node scripts/check-migration-identifiers.mjs   # → "OK — all identifiers <= 64 chars", exit 0
```

Longest snow identifier: `fk_sevent_created_by`/`fk_sevent_declared_by` = 20–21 chars (well under 64).

## The phase-blocking harness

```
pnpm run db:check:snow-dispatch
```

- **Sandbox-only:** a module-top guard regex-swaps the URL to `_sandbox` and **hard-exits (code 2)** if the resolved URL is not a `*_sandbox` DB. It never touches prod.
- **Destructive + self-seeding:** reuses the phase9 seed (Acme client + its `client_locations` + `HVAC` trade + `SCHEDULED` priority + `NEW` status + the seeded operator), builds its own snow program/sites + a 2nd tenant + a poison client/location on top, then tears **everything it created** down in a `finally` (`SET FOREIGN_KEY_CHECKS=0` txn).
- **Result:** **23 / 0 green** — proves declare+materialize / stage-gate / auto-dispatch / skip-and-flag / idempotent re-fire / cross-tenant / empty-fire.
- Before any `tsc`: `rm -f tsconfig.tsbuildinfo` (WP-13.2 — stale buildinfo → phantom errors).

## Verification snapshot (prod, post-0041)

- Base tables: **115** (was 107 pre-Phase-15); **8** `snow_*` tables.
- `snow_*` FKs: **25** (16 CASCADE / 4 RESTRICT / 5 SET NULL).
- `snow_dispatches.dispatch_status` enum default `'staged'`; `snow_events.event_status` enum default `'declared'`; `snow_service_logs.photo_refs` = `longtext` (MariaDB json).
