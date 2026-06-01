# Phase 14 — Known Limitations

Limitations as-shipped. Each maps to a banked/carry-forward item in `closeout-carryforwards.md`. None blocks close — the engine + data layer are empirically green (24/0 @ `a149c22`); these are deliberate boundaries.

## Engine / transport boundaries
- **No live cron (B-14.2).** `runDueSchedules` is a triggered (harness-invokable) entry; nothing fires it on a timer. The scheduler that calls it periodically is the activation work.
- **No operator UI.** PM-program/schedule/membership CRUD (CF-14.3), the review-queue + batch-approve surface (CF-14.2), and mass-dispatch / generic mass-update (B-14.4) are all operator-portal-phase concerns. The data/engine layer exists and is harness-proven; there are no screens.
- **Operator authz gate deferred (CF-14.2).** `approvePmVisits` is a data-layer fn taking `actorUserId`; the `requireTenant`/`requireRole` gate + friendly-error surface live in the (deferred) action wrapper.

## Schema present, behavior deferred
- **Checklist results not instantiated (CF-14.1).** `pm_visit_checklists` (template) + `pm_visit_results` (instance) schema exists, but the engine does **not** yet create `pm_visit_results` per visit from the program's checklist template. This drops in when the PM execution/mobile surface is built.
- **Per-location scope/trade override (B-14.3).** Scope/trade/priority are program-level; the schema leaves room for a per-location override but it is not built (the canonical example needs one trade across all stores).
- **`pm_assets` is lightweight (B-14.5).** A name + type + location reference — NOT EAM asset-lifecycle management. Enterprise asset depth is explicitly out of scope.

## Edges
- **Visit→job orphan window (CF-13.6 analog).** `createJob` commits its own txn, then the `pm_visits.job_id` link-back is a separate re-check-guarded update. A 0-row guard match (the visit changed under us after the job committed) is **audited (`pm_visit_link_orphan`), not thrown** — the job is real. Mitigation deferred (hardening, when observed).
- **Harness poison construct.** The skip-and-flag test induces a `LOCATION_CLIENT_MISMATCH` by putting a same-tenant, different-client location in a program's membership — a **harness-only** construct (a real program's membership comes from the client's own locations), not a production path.

## Cross-cutting / inherited
- Inherited open items roll forward unchanged — see `closeout-carryforwards.md` (CF-13.x, CF-12.x, FB-10*, CF-11.x).
- **Watchpoints:** WP-12.1 (name the DB), WP-12.2 (pre-name `pm_*` FKs), WP-13.2 (clear stale `tsconfig.tsbuildinfo` before tsc verdicts), §10 (read verdicts from file). **Package note:** this repo is pnpm, not npm.
