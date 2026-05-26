# Phase 5 — Admin / Internal SOP

Developer/administrator procedures introduced or changed in Phase 5. Builds on Phase 1–4 SOPs (env setup, seeding, the migration pipeline, FK-rule verification).

> **Prerequisites for every `mysql` command below:** the SSH tunnel must be open and `MYSQL_PWD` exported (Phase 1 SOP-1.A). `mysql ...` is shorthand for `mysql --protocol=tcp -h 127.0.0.1 -P 3307 -u jonnyrosero_jonny jonnyrosero_pm`.

## SOP-5.A — Seed dispatch reference data (9 global statuses)
```bash
pnpm db:seed:dispatch-reference   # tsx db/seeds/dispatch-reference.ts
```
- Seeds **9 GLOBAL `dispatch_assignment_statuses`** (no tenant dimension, once across the DB): DRAFT/draft, SENT/pending, ACCEPTED/active, DECLINED/cancelled(terminal), SCHEDULED/active, CONFIRMED/active, ON_SITE/active, WORK_COMPLETE/completed(terminal), CANCELLED/cancelled(terminal). `sort_order` 10…90 (D-5.17).
- Idempotent: keyed on `code` alone (global). No audit rows (bootstrap reference data). Codes uppercased.
- Like `job_statuses`, this needs the Phase 1 seed-on-tenant-creation hook only insofar as it must run once per environment — it's global, so one run covers all tenants.

## SOP-5.B — Apply the Phase 5 migration
```bash
pnpm db:generate   # drizzle-kit generate → fix-mysql-engine → check-migration-identifiers
pnpm db:migrate    # apply pending migrations
```
- Phase 5 added **`0009_brief_wallflower`** — 7 tables (1 global ref + 6 operational). Total recorded migrations after Phase 5: **10** (`0000`–`0009`).
- The 64-char identifier guard matters here: the dispatch tables' auto-generated FK names would exceed the limit, so they carry **explicit short FK names** (`jva_`/`jvash_`/`dm_`/`vec_`/`vci_`/`vco_` prefixes — `08-db-changes.md`). Always inspect generated SQL before `db:migrate`.

## SOP-5.C — Verify the dispatch FK delete rules
```bash
# the 4 sibling tables + status_history → job_vendor_assignments must be CASCADE;
# job_vendor_assignments → reference tables must be RESTRICT
mysql ... -e "SELECT TABLE_NAME, REFERENCED_TABLE_NAME, DELETE_RULE
  FROM information_schema.REFERENTIAL_CONSTRAINTS
  WHERE CONSTRAINT_SCHEMA='jonnyrosero_pm'
    AND REFERENCED_TABLE_NAME IN ('job_vendor_assignments','dispatch_assignment_statuses','vendors','vendor_locations','trades')
  ORDER BY TABLE_NAME, REFERENCED_TABLE_NAME;"
# expect: *_status_history / dispatch_messages / vendor_eta_confirmations / vendor_check_ins /
#         vendor_check_outs → job_vendor_assignments = CASCADE;
#         job_vendor_assignments → statuses/trades/vendors/vendor_locations = RESTRICT
```

## SOP-5.D — Verify the JSON column (MariaDB representation)
```bash
mysql ... -e "SHOW CREATE TABLE job_vendor_assignments\G" | grep matched_geo_types
# expect: matched_geo_types_at_dispatch longtext ... CHECK (json_valid(`matched_geo_types_at_dispatch`))
```
- On MariaDB, `JSON` is an alias for `LONGTEXT` + an auto-added `CHECK (json_valid(...))`. `information_schema.COLUMNS.DATA_TYPE` reports **`longtext`**, never `json` — this is correct, not a defect; `JSON_VALID`/`JSON_CONTAINS`/`JSON_EXTRACT` all work. (`08-db-changes.md`; same as Phase 4's `job_events.metadata`.)

## SOP-5.E — Inspect Phase 5 data (the worked examples)
```bash
mysql ... -e "SELECT code, category, is_terminal, sort_order FROM dispatch_assignment_statuses ORDER BY sort_order;"  # 9 rows
# Job #2's dispatch (the SENT keeper):
mysql ... -e "SELECT v.name AS vendor, s.code AS status, a.vendor_location_id, a.chosen_branch_covered_trade,
    a.tightest_geo_at_dispatch, a.compliance_status_at_dispatch, (a.sent_at IS NOT NULL) AS sent
  FROM job_vendor_assignments a JOIN vendors v ON v.id=a.vendor_id
  JOIN dispatch_assignment_statuses s ON s.id=a.current_status_id
  JOIN jobs j ON j.id=a.job_id WHERE j.job_number=2;"
# expect: Sunbelt HVAC / SENT / NULL location / NULL chosen_branch / national / no_data / sent=1
mysql ... -e "SELECT action FROM audit_logs WHERE action IN
  ('job_vendor_assignment.created','job_vendor_assignment.sent','job.dispatched');"   # 1 each for Job #2
```

## SOP-5.F — Ephemeral verification scripts (the discipline used this phase)
- 5a/5c/5d verification used throwaway scripts under `scripts/` (matcher smoke + EXPLAIN, `createDispatch`/`sendDispatch` smoke, the 5d data-orchestration probe, the Job #3 click-through cleanup). They are **scaffolding — run during the build, deleted before commit**; results live in commit messages + these docs. Server-only modules import `server-only`, so run such scripts with `NODE_OPTIONS="--conditions=react-server" pnpm exec tsx --env-file=.env.local scripts/<name>.ts`.
- **Mutate-restore discipline:** any script that temporarily mutates capability/reference data (e.g. archiving a coverage row to test `VENDOR_NO_LONGER_CANDIDATE`) must use `try/finally` with **post-restore verification** that fails loudly — a half-completed cleanup is silent data corruption that surfaces weeks later.

## SOP-5.G — Light up a deferred Phase 5 surface later
- **Delivery layer** for `dispatch_messages` (Phase 6): add recipient routing, channel fields, and `delivered_at`/`read_at`; the content/metadata columns + `direction` already exist.
- **ETA / check-in / check-out UI** (Phase 6): `vendor_eta_confirmations` (append-only; latest by `created_at` is the current ETA) and `vendor_check_ins`/`vendor_check_outs` (identical v1 schemas) have no UI yet.
- **Compliance hard-gating** (D-5.2 sunset): when compliance data lands, flip the matcher from non-blocking to compliance-required.
- **Aggregator-designated primary vendor + auto-dispatch** (future): the matcher is advisory today; this is a new feature, not a wiring-up of existing schema.
