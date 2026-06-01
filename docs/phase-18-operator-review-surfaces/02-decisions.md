# Phase 18 — Decisions

## D-18.1 — Option A: branch Phase 18 off main (not off the planning branch)

The v2 planning branch (`phase-17-v2-inspection`: 17a inspection report + v2 roadmap) was
ff-merged to `main` (`ea5b613..65f93fc`, linear, no merge commit), then `phase-18-operator-review-surfaces`
was cut off the freshly-advanced `main`. Keeps history linear and the phase trunk clean.

## D-18.2 — Fork 1: promotion is flip + audit, NO outbound

`promoteNoteVisibility` flips `job_notes.visibility` and writes one `audit_logs` row — and **nothing
else**. It does **not** write `communication_logs`, `client_update_logs`, or any notification. The
send/publish path is **Phase 19's** (the notification center + live send backend). Promotion is a
**classification** change (who *may* see the note), not an act of sending. Harness group D proves the
absence of outbound empirically (communication_logs + client_update_logs unchanged after a promotion).

*Standing override note:* Fork 1 is the default. If a later decision wants promotion to also enqueue
an outbound, that is an explicit Phase-19 wiring on top — it does not retroactively change Phase 18.

## D-18.3 — Operator authorization pattern, not vendor-scope

The promotion writer authorizes via the **operator** pattern: `requireTenant()` in the action wrapper
(the `(app)` layout already gates non-operators out) + a tenant-scope guard in the writer
(`getJobNote(tenantId, noteId)` → `NOTE_NOT_FOUND`). It deliberately does **not** import
`createVendorNote`'s `canActOnAssignment` vendor-scope check — that is the vendor-side axis and is the
wrong gate for an operator action.

## D-18.4 — Audit home: `audit_logs`, not `job_events`

The promotion record lands in `audit_logs` via the reusable `writeAuditLog` (`action:
'job_note.visibility_promoted'`, `targetType:'job_note'`, `metadata:{jobId, from, to}`). This matches
the established operator-action convention (`job_note.created`, `rewrite_draft.*`). `job_events` was
rejected: it has **no standalone writer** (all inserts are in-transaction lifecycle events) and the
flip is a single-row UPDATE fitting the R-4.5 audit-outside pattern. (If job-timeline surfacing of
promotions is later wanted, `job_events` is the place — a separate, larger choice.)

## D-18.5 — Promotion-target constraint (promotion writer, not a general mutator)

`promoteNoteVisibility` accepts ONLY `client_visible` and `client_and_vendor_visible` as targets
(`PROMOTION_TARGETS`). Anything else — `internal_only`, `requires_review`, `vendor_visible`, or a
non-`NoteVisibility` string — throws `INVALID_PROMOTION_TARGET` with no flip. This keeps the writer a
*promotion* (share-outward) action; it cannot be repurposed to demote or set arbitrary visibility.
Harness group C covers all four reject cases + the two accept cases.

## D-18.6 — New component, don't overload the per-job one

`review-queue-section.tsx` is a **new** client component. `update-drafts-section.tsx` stays
single-job-bound (it takes one `jobId` prop and binds it into every action). The queue threads each
row's **own** `draft.jobId` into the existing `(jobId, draftId, …)` wrappers — so no new action
wrappers were needed. Overloading the per-job component would have entangled two consumers.

## D-18.7 — One tabbed `/review` route, `?tab=`-driven

The inbox is the **second tab** of `/review` (Drafts \| Vendor updates), not a new top-level route.
Tabs are `searchParams`-driven (`?tab=drafts` default \| `?tab=vendor-updates`) so the page stays a
Server Component with no client tab state. The lane/tab container is structured so a third surface can
be added without restructuring.

## D-18.8 — Dual-mode = groundwork only

The "dual-mode review" concept (awaiting-approval vs acted-autonomously) is **documented groundwork**:
the queue's lane container leaves room for a future autonomous lane (commented seam), but **no
autonomous lane is rendered and no new status enum value is added**. There is no producer of
autonomous actions until the policy engine (Phase 23). Building the lane now would be speculative.

## D-18.9 — Migration-free; index banked

Both surfaces are readers + one UPDATE over existing columns — no schema change. The cross-job vendor
reader filters `(tenant_id, origin='vendor')` with no covering index (only `(tenant_id, job_id)`
exists); given low vendor-note volume this is an acceptable tenant-prefix scan. A `(tenant_id, origin)`
index is **banked as a soft perf item**, not built (preserves the migration-free phase).
