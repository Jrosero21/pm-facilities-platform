# Phase 9 — Aggregator Dashboard & Analytics MVP · Known Limitations

What Phase 9 deliberately does NOT do, and the bounded edges of what it does. Each is a conscious decision, not an oversight. Grouped by kind.

**CF vs. not:** **substrate/coverage deferrals** (where the platform owes a closure — a missing assertion, an unstrengthened seed, an open UX choice) carry a **CF handle** and live definitively in `closeout-carryforwards.md` (this doc cross-references them). **Standing watchpoints** (a correct-but-bounded edge worth future awareness) are noted here **without** a CF.

## A. Open carry-forwards (Phase 9-originated)

The definitive entries are in `closeout-carryforwards.md`; cross-referenced here:

- **CF-9d.6.1 — dispatch-timing distribution is degenerate-by-design.** The seed creates no closed-job assignments, so `timeToDispatchDistribution` is fed only by open jobs at a uniform 3600s (`ClosedJobSpec.dispatchAfterHours` is vestigial). The reader's *plumbing* is verified; its *percentile ordering* is not exercised. Strengthen (seed varied dispatch deltas) when the seed is next edited.
- **CF-9e.4.1 — filter indicator is count-only, not a labeled chip.** `/jobs`'s active-filter indicator shows "Showing N filtered jobs · Clear filters," not "Status: In Progress ✕". Honors the IDs-only `resolveJobsFilters` contract (no label-lookup queries). Extend to a labeled chip if bookmark/URL-share usage signals demand.
- **CF-9f.1 — `isJobStalled` is not covered by the harness.** The 23-assertion `check-analytics-readers` harness covers the 9 9c readers; `isJobStalled` (the 10th, added at 9f) is verified by 9f's cross-surface consistency check but not by the standing harness. Low priority — extend the harness when the seed/fixture is next touched.

## B. Standing watchpoints (no CF)

- **Deferred index `job_status_history (tenant_id, job_id, created_at)`.** `timeInStatusDistribution`'s `LAG()` diffing filesorts on `created_at` within each per-job partition (the table carries only `(tenant_id, job_id)`). **Benign at current volume; a scale watchpoint** — add the composite if/when history grows large. Source: `9c-inspection-report.md §5`.
- **mysql2 ↔ DB timezone skew (the bug class behind the 9d TZ fix).** mysql2 serializes JS `Date` objects in the **Node-process timezone**, but the MySQL session timezone is `SYSTEM` (DB host's tz); comparing against `NOW()` yields a skew = the TZ delta between Node host and DB host. **Mitigations:** (a) server-anchored expressions (`` sql`NOW() - INTERVAL n SECOND` ``); (b) `Date.toISOString()` UTC strings + the mysql2 `timezone: 'Z'` connection option. Phase 9 9d uses **(a)** via `agoSql`, sandbox-scoped. **Production is unaffected** (real writes use DB-default `CURRENT_TIMESTAMP`). Codebase-wide adoption of (b) at the pool config would eliminate the entire class but requires auditing existing date-write paths — **banked as a future cleanup, not a Phase 9 deliverable.** Full framing: `02-decisions.md §D`.
- **Loading-state is route-level only.** A single `dashboard/loading.tsx` skeleton; **no per-panel Suspense / streaming.** The 9 readers are millisecond-cheap at current/foreseeable volume, so per-panel suspense is unearned. **Future-scale watchpoint:** refine to per-panel Suspense if reader latency grows under real volume.
- **better-auth NULL-tenant `audit_logs` rows.** `signUpEmail` writes `auth.user.created` / `auth.login` audit rows with `tenant_id = NULL` (no tenant context at signup — Phase-1 forensic-trail design). The seed's user-upsert keeps this **frozen** across re-runs (reused users → no new rows); the idempotency invariant is **"count does not grow"** (6 → 6 → 6), not "= 0". Inert (no analytics reader touches `audit_logs`).
- **Tool-output reliability.** Three intermittent tool-output anomalies recurred during Phase 9 construction (format-string `%` interpolation in inline SQL; empty-stdout race on fast-exiting commands; cross-file output bleed). The mitigation discipline (file-capture / grep-committed-text / re-probe) is documented in **`04-admin-sop.md §10`** — referenced here, not duplicated.

## C. Inherited / cross-phase

- **CF-8c.8.3 (no test framework) — Phase-8 carry-forward, partially addressed.** Phase 9's retained `scripts/check-analytics-readers.ts` harness is the project's **first standing regression artifact** — but it is **analytics-specific**, not a general test runner/CI. CF-8c.8.3 **remains open** in Phase 8's ledger; Phase 9 is a partial answer, not a discharge.
- **CF-8b.1 (fresh-migration verify) — re-affirmed.** The from-scratch migration-replay methodology was re-run through the new migration `0024` at 9b.3.3 (`11-closeout.md`). Not a new limitation — recorded for traceability.

## D. Scope reminders (each a later phase)

- **No vendor/client portals** (Phase 10/11) — the dashboard is the internal aggregator surface only. The 9e shared primitives (`role-predicates.ts`, `empty-state.tsx`, `loading.tsx`, `tier-colors.ts`) are built to be inherited by those phases.
- **No real-time updates** — page-load + the implicit-dynamic render is the cadence (no websockets/polling; a tab-focus soft-refresh was considered and deferred).
- **No tenant-configurable thresholds** — the stalled thresholds are a fixed constants module (`stalled-rules.ts`); lifting to a per-tenant table is a future enhancement with no refactor cost (`02-decisions.md §A`).
- **No materialized analytics** — every metric is computed-on-read; no summary tables / caches (`02-decisions.md §A`).
