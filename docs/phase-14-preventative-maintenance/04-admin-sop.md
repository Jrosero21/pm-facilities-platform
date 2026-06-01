# Phase 14 — Admin SOP

Operational procedures for the PM subsystem.

## DB access (reminders)
- DB via `~/.pm_db.cnf` (0600, outside repo): `mysql --defaults-extra-file="$HOME/.pm_db.cnf" --protocol=tcp -h 127.0.0.1 -P 3307 jonnyrosero_pm -e "..."`.
- **Always name the DB explicitly** (`jonnyrosero_pm` / `jonnyrosero_pm_sandbox`) — a bare connection lands on another DB (WP-12.1).
- Vertical output: `-E`, **never `\G`**. Tunnel: `ssh -p 21098 -L 3307:127.0.0.1:3306 jonnyrosero@host62.registrar-servers.com`.

## The phase-blocking harness
```
pnpm run db:check:pm-generation
```
- **SANDBOX ONLY** — module-top env-swap derives the sandbox URL from `DATABASE_URL` and hard-`exit(2)` if the result isn't `*_sandbox` (the swap runs before any DB import; the output prints "sandbox target confirmed").
- **DESTRUCTIVE + self-seeding.** It resolves the seeded Acme client + reference data (SCHEDULED priority, HVAC trade, NEW status), queries Acme's LIVE locations for the fan-out, seeds its own program/schedule/membership + a same-tenant poison client (for the skip-and-flag test) + a T-B tenant, and tears down everything it created in a `finally` (FK_CHECKS=0 → delete by tracked ids/markers → FK_CHECKS=1) with a defensive pre-clean. **The phase-9 seed (Acme + locations + ref data) is left intact.**
- Expected: `passed: 24 / failed: 0 / PHASE-BLOCKING LEDGER GREEN ✓`, exit 0. Read the verdict from a captured file + true exit code (§10).
- If `SYSTEM_USER_NOT_SEEDED` / seeded-tenant absent → re-seed the sandbox first (phase-9 fixture + `seed-system-user.ts` via the `DATABASE_URL` override), then re-run.

## Migration cadence (used for 0036–0038)
drizzle entry (`src/server/schema/pm.ts`) → `pnpm run db:generate` (chained: drizzle-kit + fix-mysql-engine + check-migration-identifiers) → SQL inspect (HALT) → sandbox apply (env-override `db:migrate`) → contract-verify `-E` → **HALT for prod confirm** → prod apply → verify → 4/5-file commit. Sandbox migrate uses the `DATABASE_URL` `_sandbox` override; prod migrate reads `.env.local`.

## Package management
- **This repo is pnpm** (`pnpm-lock.yaml`, `packageManager: pnpm@…`) — use `pnpm add` / `pnpm run`, NOT npm. An `npm install` crashes npm's arborist against the pnpm `node_modules` (`Cannot read properties of null (reading 'matches')`) and mutates nothing. `date-fns@4.4.0` was added this phase for F4 date math.

## Watchpoints
- **WP-13.2** — a stale `tsconfig.tsbuildinfo` replays **phantom** `tsc` errors; if errors don't match the source, `rm -f tsconfig.tsbuildinfo` and re-run (it's gitignored).
- **WP-12.2** — pre-name every FK on the long-named `pm_*` tables (`pm_schedule_locations`/`pm_visit_checklists`/`pm_visit_results` auto-names would exceed 64 chars); the `check-migration-identifiers` guard enforces it.
- **WP-12.1** — name the DB explicitly (above). **§10** — read verdicts from file + true exit, never an interleaved console.
- **Naming care** — `pm_schedules` (recurrence) is distinct from the dispatch adjective "scheduled" (`scheduled_start_at`/`scheduled_end_at`); PM recurrence cols (`frequency`/`interval_count`/`next_due_at`/`last_generated_at`) are deliberately unlike them.
