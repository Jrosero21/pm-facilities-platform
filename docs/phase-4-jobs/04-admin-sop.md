# Phase 4 — Admin / Internal SOP

Developer/administrator procedures introduced or changed in Phase 4. Builds on Phase 1–3 SOPs (env setup, seeding, running the app, the migration pipeline).

> **Prerequisites for every `mysql` command below:** the SSH tunnel must be open and `MYSQL_PWD` exported (Phase 1 SOP-1.A). `mysql ...` is shorthand for `mysql --protocol=tcp -h 127.0.0.1 -P 3307 -u jonnyrosero_jonny jonnyrosero_pm`.

## SOP-4.A — Seed job-workflow reference data (priorities + statuses + sequence)
```bash
pnpm db:seed:job-reference   # tsx db/seeds/job-reference.ts
```
- Seeds, for the Demo Aggregator (slug `demo`): **5 priorities** (tenant-scoped — Emergency/Urgent/High/Routine/Scheduled, by rank), **8 job_statuses** (GLOBAL — New/Scheduled/Dispatched/In Progress/On Hold/Completed/Cancelled/Closed, seeded once across the DB), and **one `tenant_job_sequences` row** (next_number=1).
- Idempotent: priorities keyed on `(tenant_id, code)`, statuses on `code` alone, the sequence row created only if missing (never resets an advanced counter). No audit rows.
- **Seed-on-tenant-creation hook is a Phase 1 carry-forward** — all three (priorities, statuses, sequences) need it; for now they're hand-seeded for the demo tenant (`10-known-limitations.md` L-4.5).

## SOP-4.B — Apply the Phase 4 migrations
```bash
pnpm db:generate   # drizzle-kit generate → fix-mysql-engine → check-migration-identifiers
pnpm db:migrate    # apply pending migrations
```
- Phase 4 added `0007_absent_puma` (priorities + job_statuses) and `0008_mature_guardsmen` (jobs + 7 siblings + tenant_job_sequences). Total recorded migrations after Phase 4: **9** (`0000`–`0008`).
- Always inspect generated SQL before `db:migrate` (Phase 2 SOP-2.A); recover a partial migration via Phase 2 SOP-2.B.

## SOP-4.C — Verify the job FK delete rules
```bash
# 7 sibling tables → jobs must all be CASCADE
mysql ... -e "SELECT TABLE_NAME, DELETE_RULE FROM information_schema.REFERENTIAL_CONSTRAINTS
  WHERE CONSTRAINT_SCHEMA='jonnyrosero_pm' AND REFERENCED_TABLE_NAME='jobs' ORDER BY TABLE_NAME;"
# jobs reference FKs: clients/client_locations/trades/priorities/job_statuses=RESTRICT, tenants=CASCADE, users=SET NULL
mysql ... -e "SELECT REFERENCED_TABLE_NAME, DELETE_RULE FROM information_schema.REFERENTIAL_CONSTRAINTS
  WHERE CONSTRAINT_SCHEMA='jonnyrosero_pm' AND TABLE_NAME='jobs' ORDER BY REFERENCED_TABLE_NAME;"
```

## SOP-4.D — Inspect Phase 4 data (the Job #1 worked example)
```bash
mysql ... -e "SELECT job_number, source_type, current_status_id FROM jobs;"
mysql ... -e "SELECT j.job_number, c.name AS client, cl.name AS location, t.name AS trade, p.name AS priority, js.name AS status
  FROM jobs j JOIN clients c ON c.id=j.client_id JOIN client_locations cl ON cl.id=j.client_location_id
  JOIN job_statuses js ON js.id=j.current_status_id
  LEFT JOIN trades t ON t.id=j.primary_trade_id LEFT JOIN priorities p ON p.id=j.priority_id;"
# Job #1 → Apple / Apple 5th Ave / Plumbing / High / New
mysql ... -e "SELECT from_status_id, to_status_id, changed_by_user_id FROM job_status_history;"   # 1 row, from NULL
mysql ... -e "SELECT event_type, summary FROM job_events;"                                        # job.created
mysql ... -e "SELECT action, target_type FROM audit_logs WHERE action IN ('job.created','job_contact.created','job_note.created') ORDER BY created_at;"
# expect job.created, job_contact.created, job_note.created (explicit list — not LIKE 'job%', which over-matches)
mysql ... -e "SELECT tenant_id, next_number FROM tenant_job_sequences;"                           # next_number=2 after Job #1
```

## SOP-4.E — Light up a deferred Phase 4 surface later
- **`job_attachments`** (schema-only): add a `src/server/job-attachments.ts` data layer + action + UI when file-upload infrastructure exists (mirror `vendor_documents`/the contact pattern). `file_url`/`file_size_bytes`/`file_mime_type` stay null until then.
- **Note visibility** (Phase 6): the column + enum already exist; expose the picker and the visibility-control workflow.
- **Status/priority/trade transitions** (Phase 5+): write the transition through the same dual-write pattern as `createJob` — a `*_history` row + a `job_events` row + audit, in one transaction (`06-business-rules.md` R-4.5).
