# Phase 12 — Admin SOP (harness / seed / migration workflows)

## DB access (sandbox + prod, read-only inspection)
A non-secret credential skeleton lives at `~/.pm_db.cnf` (host/port/user/database; `0600`, outside the repo); the password was appended interactively by the operator. Use it for read-only inspection:
```
mysql --defaults-extra-file="$HOME/.pm_db.cnf" jonnyrosero_pm "<query>"          # PROD
mysql --defaults-extra-file="$HOME/.pm_db.cnf" jonnyrosero_pm_sandbox "<query>"  # SANDBOX
```
**WP-12.1:** ALWAYS name the database explicitly — a bare connection on this server lands on another of the operator's DBs (`jonnyrosero_march_madness`), not PM.
**Verify method:** use `mysql -E -e "SHOW CREATE TABLE …;"` (vertical) — `\G` fails on this MariaDB build (both via `-e` and stdin).

## Migration cadence (used for 0028–0032)
drizzle schema entry → `npm run db:generate` → **SQL inspection halt** → sandbox apply → contract-verify (`-E` + FK-matrix) → **HALT for prod confirm** → prod apply → contract-verify → 4-file commit (schema + `.sql` + `_journal.json` + `<n>_snapshot.json`). Sandbox is targeted by swapping the DATABASE_URL db-name to `*_sandbox` with a hard guard; prod uses the default `.env.local` URL.
**WP-12.2:** pre-name every FK in the schema source (`foreignKey({…, name: "short_fk"})`) — the long external_* table names make drizzle's auto-generated FK names exceed MySQL's 64-char limit. The chained `check-migration-identifiers` guard catches this pre-apply.

Phase-12 migrations: **0028** systems/accounts/credentials · **0029** status/trade/priority mappings · **0030** links/sync_runs/sync_events/payload_logs · **0031** location mappings · **0032** client mappings + `client_id` on location mappings.

## System user seed (required before ingest)
`scripts/seed-system-user.ts` creates the GLOBAL non-login service identity (`integration@system.internal`) that owns system-originated ingest records. Idempotent (find-by-email; the by-email resolver `getSystemUserId()` means sandbox/prod ids differ harmlessly). Run once per environment:
```
npx tsx --env-file=.env.local --conditions=react-server scripts/seed-system-user.ts          # prod (default URL)
# sandbox: export the *_sandbox DATABASE_URL first, then run.
```

## Phase-blocking harness
```
# re-seed sandbox FIRST (destructive, seed-dependent):
npx tsx --env-file=.env.local --conditions=react-server scripts/seed-sandbox-phase9.ts
npx tsx --env-file=.env.local --conditions=react-server scripts/seed-system-user.ts
npm run db:check:external-integrations   # 25 assertions; sandbox-guarded; builds + tears down its own 2-tenant fixture
```
Sandbox-only (hard-aborts if the resolved DB isn't `*_sandbox`). Destructive — it writes a job/note/push and creates a throwaway tenant T-B + all external_* rows, then tears them down in a `finally`. **Read the verdict from the captured file + the true exit code, never an interleaved console** (§10 discipline — a console-read once produced a false-green that had to be reset; see watchpoints).
