# Phase 9 — Aggregator Dashboard & Analytics MVP · Database Changes

Phase 9 is **read-heavy by character**: no new tables, no new columns, no new foreign keys. The **only** schema change is **two secondary indexes** on `jobs` — both deferred since Phase 4 to "the consuming phase" (the consumer defines the right composite; add it where it's read). Phase 9 is that consumer. One migration, `0024`. The dashboard metrics are **computed-on-read** (no materialized views / summary tables — a deliberate decision, `02-decisions.md §A`), so these indexes are what keep the tenant-scoped reads cheap; materialization is unearned at current/foreseeable volume.

## Migration → change map

| Migration | Type | Table | Detail |
|---|---|---|---|
| `0024_uneven_radioactive_man.sql` | `CREATE INDEX` | `jobs` | `jobs_tenant_due_idx` `(tenant_id, due_at)` |
| `0024_uneven_radioactive_man.sql` | `CREATE INDEX` | `jobs` | `jobs_tenant_source_idx` `(tenant_id, source_type)` |

Emitted SQL (verbatim):
```sql
CREATE INDEX `jobs_tenant_due_idx` ON `jobs` (`tenant_id`,`due_at`);
CREATE INDEX `jobs_tenant_source_idx` ON `jobs` (`tenant_id`,`source_type`);
```

## Rationale per index

- **`jobs_tenant_due_idx (tenant_id, due_at)`** — serves **overdue detection** in the dashboard's composite-urgency queue (tenant-scoped `due_at` filtering / ordering). The `overdue` tier is data-blocked today (`due_at` is largely NULL — "lights up as data flows"); the index is in place so the tier is cheap the moment operators populate due dates.
- **`jobs_tenant_source_idx (tenant_id, source_type)`** — serves **source-type aggregations** in future analytics and source-scoped reads. `source_type` is a real 8-value `enum` (`manual, internal_client_portal, external_client_portal, email_ingestion, forwarded_email, api, preventative_maintenance, snow_event`), so the index is compact and selective. Lands **now** per the deferred-to-consuming-phase rule, even though the MVP queue UI does not yet filter on `source_type`.

## Naming + substrate notes

- Both follow the existing **`jobs_tenant_<discriminator>_idx`** convention — the six prior tenant composites from earlier phases (`…_status_idx`, `…_priority_idx`, `…_client_idx`, `…_trade_idx`, `…_location_idx`, `…_created_idx`) share the same form. After `0024`, `jobs` carries **16 distinct indexes** total (verified in prod at closeout, `11-closeout.md`).
- The **status/priority/client/trade roll-up readers** (`countOpenJobsBy*`, `topClientsByOpenJobs`, `topTradesByOpenJobs`) are already served by the pre-existing tenant composites — no new index was needed for them.
- **`vendor_check_ins` keys on `assignment_id` only** (not also `job_id`). The stalled / dispatch readers that need on-site presence therefore join `vendor_check_ins → job_vendor_assignments` to reach the job (corrects an earlier 9c.1 assumption). No schema change — recorded here as the authoritative structural fact the readers and the seed depend on.

For the full schema-gate documentation (design rationale, emitted-SQL review, fresh-replay verification), see `9b-schema-manifest.md`.
