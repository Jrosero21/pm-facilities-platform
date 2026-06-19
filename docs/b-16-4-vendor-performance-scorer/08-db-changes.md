# B-16.4 — Database Changes

## Migration 0054 (additive, 2 columns)
`0054_medical_warstar.sql` — two nullable, backfill-free columns on `vendor_performance_scores`:
```sql
ALTER TABLE `vendor_performance_scores` ADD `total_dispatches` int;
ALTER TABLE `vendor_performance_scores` ADD `completion_rate` decimal(5,2);
```
Gives completion (`completed / total_dispatches`) a first-class home rather than burying it in `notes`
JSON — completion is the dominant scoring metric (0.7 weight), and the eventual dispatch-ranking consumer
will want it queryable. The pre-existing `jobs_completed` / `jobs_on_time` / `on_time_rate` / `score` /
`avg_rating` columns are unchanged.

## Apply discipline — direct ALTER, NOT `drizzle-kit migrate`
**The `__drizzle_migrations` ledger undercounts** (dev/sandbox at applied-count 48–49, but their schemas
have every 0049–0053 effect). Running `drizzle-kit migrate` would compare the 54-entry journal to the
undercounted ledger and **replay 0049–0053, erroring on duplicate columns.** So 0054 is **generated** with
`pnpm db:generate` (ledger-independent — diffs schema vs the 0053 snapshot) but **applied as the two
direct ALTERs**, sandbox first then prod, each `SELECT DATABASE()`-guarded. See
`memory/reference-migration-ledger-drift`.

## Apply status
- **Sandbox:** applied 2026-06-18 (direct ALTER, guarded). `vendor_performance_scores` columns 17 → 19.
- **Prod (`jonnyrosero_pm`):** **NOT applied** — separate gated step. The scorer cannot write in prod until
  the two ALTERs are applied there.

## Tables read (no changes)
`job_vendor_assignments`, `job_vendor_assignment_status_history`, `vendor_check_ins`,
`dispatch_assignment_statuses` — read-only sources for the rollup; no schema changes.

## Writes
`vendor_performance_scores` — one row per `(tenant, vendor, trade)`, idempotent delete-then-insert.
