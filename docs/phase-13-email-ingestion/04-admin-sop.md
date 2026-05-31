# Phase 13 — Admin SOP

Operational procedures for the email-ingestion subsystem.

## DB access (reminders)
- DB via `~/.pm_db.cnf` (0600, outside repo): `mysql --defaults-extra-file="$HOME/.pm_db.cnf" --protocol=tcp -h 127.0.0.1 -P 3307 jonnyrosero_pm -e "..."`.
- **Always name the DB explicitly** (`jonnyrosero_pm` / `jonnyrosero_pm_sandbox`) — a bare connection lands on another DB (WP-12.1).
- Vertical output: use `-E`, **never `\G`** (fails on this MariaDB).
- Tunnel: `ssh -p 21098 -L 3307:127.0.0.1:3306 jonnyrosero@host62.registrar-servers.com` in a separate terminal.

## The phase-blocking harness
```
npm run db:check:email-ingestion
```
- **SANDBOX ONLY** — it derives the sandbox URL from `DATABASE_URL` and hard-exits(2) if the result isn't a `*_sandbox` DB (the env-swap runs before any DB import).
- **DESTRUCTIVE + seed-dependent.** It reuses the seeded T-A (`phase9-seed-tenant`: Acme client/location, EMERGENCY priority, global NEW/HVAC) + the system user, builds its own T-B, and tears down everything it created in a `finally` (incl. a defensive pre-clean of a leftover T-B / harness inbound rows).
- **If it fails with `SYSTEM_USER_NOT_SEEDED` or a missing seeded tenant** → re-seed the sandbox first, then re-run:
  ```
  npx tsx --env-file=.env.local --conditions=react-server scripts/seed-sandbox-phase9.ts
  export DATABASE_URL="$(grep -E '^DATABASE_URL=' .env.local | cut -d= -f2- | sed -E 's#/jonnyrosero_pm(\?|$)#/jonnyrosero_pm_sandbox\1#')"
  npx tsx --env-file=.env.local --conditions=react-server scripts/seed-system-user.ts
  ```
- Read the verdict from a **captured file + the true exit code**, never an interleaved console (§10). Expected: `passed: 21 / failed: 0 / PHASE-BLOCKING LEDGER GREEN ✓`, exit 0.

## Migration cadence (used for 0033–0035)
drizzle schema entry → `npm run db:generate` (chained: drizzle-kit + fix-mysql-engine + check-migration-identifiers) → inspect SQL (HALT) → sandbox apply (env-override `db:migrate`) → contract-verify `-E` → **HALT for prod confirm** → prod apply → verify → 4-file commit (schema + `.sql` + `_journal.json` + `snapshot.json`). Sandbox migrate uses the `DATABASE_URL` override (above); prod migrate reads `.env.local` directly.

## Watchpoints
- **WP-13.1** — `inbound_emails` (Phase 13) is DISTINCT from the Phase-6 `inbound_messages` (communication-log channel rows). Different purpose; do not conflate.
- **WP-13.2** — a stale `tsconfig.tsbuildinfo` (incremental cache) can replay **phantom** `tsc` errors (e.g. cross-script "Cannot redeclare"). If `tsc` reports errors that don't match the source, `rm -f tsconfig.tsbuildinfo` and re-run. (It is gitignored.)
- **MariaDB-JSON-read** — `json` columns (`raw_headers`, `extracted_fields`) round-trip as raw strings on read; parse at the boundary (the `drafts.ts:109` precedent).
