# Phase 22 — Admin / Internal SOP

Audience: platform operators/maintainers. Covers how the eligibility floor + preference + blocklist behave operationally, the auto-picker's status (built but ungoverned), and the harness. **No new deploy-time env var this phase.**

## The eligibility floor (where the safe volume is)

A job's dispatch candidate set is computed by `findCandidateVendorsForJobByFacets` (Phase 5, extended in Phase 22). A vendor is a candidate only if **all** hold:
- **Trade** — has active `vendor_trade_coverage` for the job's primary trade.
- **Geographic coverage** — has an active `vendor_service_areas` row matching the job location, **by equality**: national, or state, or city+state, or postal_code. (`radius`/`county` rows are stored but **inert** — no client-location coordinates; CF-22.1.)
- **Compliance** — **not** excluded: there is no active `vendor_compliance` row with `compliance_status IN ('expired','non_compliant')`. An **absent** compliance row is `no_data` = **eligible-but-recorded** (snapshotted on the assignment). This is **TEMPORARY** (D-5.2): when real compliance data lands, this tightens to "compliant required" with no schema change.
- **Not blocklisted** — no active `location_blocked_vendors` row for the job's `(client, location)` (a client-wide row, `client_location_id IS NULL`, also excludes).

Survivors are ordered **preferred-first** (`location_preferred_vendors.priority` ASC, NULLs last) then the existing tiebreak (primary-trade → tightest-geo → name).

## The auto-picker exists but is NOT yet auto-invoked

`autoDispatchDraftForJob(tenantId, jobId)` is the deterministic rule-based picker: idempotency guard → match → top candidate → **create a DRAFT** assignment → write an `auto_drafted` audit row. **It stops at DRAFT — it never sends.** Critically, **nothing calls it** — there is no trigger, cron, or action that auto-invokes it. **Phase 23** (the autonomy policy engine + guardrails) governs **when** it runs and whether a DRAFT may auto-advance to SENT. Until then, all dispatch is operator-driven; the picker is a mechanism awaiting governance, not a live autonomous loop.

## Auto-dispatch legibility (when it does run)

Every drafted auto-dispatch writes a `job_vendor_assignment.auto_drafted` audit row: **NULL acting user** (system actor) + metadata `{jobId, vendorId, rule:"preferred-then-rank", preferenceRank}`. The DRAFT itself also lands a NULL `created_by_user_id` and an initial `null → DRAFT` status-history row. An auto-dispatched draft is therefore spot-reviewable: it is an ordinary DRAFT assignment that an operator must explicitly send (invariant 2).

## Soft-delete model

Preferred and blocked rows are **never hard-deleted** — removal flips `status='archived'` in a transaction with an audit row (the `archiveClientNteRule` pattern); list reads filter out archived. This preserves the who-blocked-whom-and-when trail. Re-adding a preferred vendor **reactivates** the archived row in place (D-22.4).

## Running the phase-blocking harness

```bash
pnpm run db:check:dispatch     # SANDBOX only; requires the SSH tunnel (port 3307)
```
- Rewrites `DATABASE_URL` → `…_sandbox` at module top and hard-exits (code 2) otherwise.
- **Pure DB** — sets **no** capture flags (Phase 22 sends nothing and stores nothing).
- Self-seeds a controlled client/location (Metropolis/NY/10001), an HVAC job, **7 controlled vendor profiles** (pass / no-trade / no-geo / bad-compliance / blocked / preferred / preferred+blocked), and a tenant-B fixture; calls the matcher + auto-picker + routing fns directly; asserts; tears down (idempotent — re-runnable, leaves no seeded rows).
- Green line: `PHASE-22 DISPATCH-ENGINE LEDGER GREEN ✓` (**30/0**), across 12 groups.

## No new env

Phase 22 introduces **no** deploy-time variable. The existing `RESEND_*` / `R2_*` / `APP_URL` are unaffected (the auto-picker doesn't send, so it touches neither the send nor storage seam).
