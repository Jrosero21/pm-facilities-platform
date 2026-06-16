# Per-Dispatch Status Tracking — Decisions

## D-PD.1 — Status lives on the dispatch; a job is a collection of dispatches

The unit of status is the dispatch (`job_vendor_assignments`), not the job and not the vendor. A job can
have many dispatches (no (job,vendor) uniqueness — re-dispatch, multi-trade, comparing offers; same vendor
twice is legal). Each dispatch carries its own status + append-only history.

## D-PD.2 — Operator hand-advance is FREE movement; vendor portal is guided/forward-only

The vendor portal's transitions (`performTransition`) are guided and forward-only (each enforces a required
from-status). The operator hand-advance (`setAssignmentStatus`) is **free movement** — any target status,
including re-opening from a terminal status — because the coordinator is reconciling reality (a vendor
phoned in, a status was set wrong). Both write the **same** `current_status_id` + the **same**
`job_vendor_assignment_status_history`; the only discriminator is the audit metadata
(`actor: 'operator', via: 'operator_console'` vs the vendor path's `actor: 'vendor'`). The history table has
no actor column — provenance is in audit, the platform's existing convention.

## D-PD.3 — Operator advance is a PURE status set (no fabricated side-effects)

The vendor transitions carry real side-effect rows (ETA confirmation, check-in, check-out). The operator
hand-advance writes **only** status + history + audit — it does NOT fabricate a check-in/ETA/check-out. An
operator setting `ON_SITE` records the status, not a physical check-in that didn't happen.

## D-PD.4 — Send stays its own button; DRAFT/SENT not operator-pickable

`DRAFT → SENT` is not selectable in the operator picker (and the server rejects it,
`STATUS_NOT_OPERATOR_SETTABLE`): the Send action does more than flip status (stamps `sent_at`, advances the
job to Dispatched, fires the magic-link send). Routing it through the generic picker would skip all of that.

## D-PD.5 — Job follows the dispatch ONLY when exactly one active dispatch

The auto-follow fires only when the job has **exactly one active dispatch** (active = dispatch status
`category NOT IN ('cancelled','draft')`). With several vendors at different stages, the platform can't infer
the job's state from one of them — that coupling is **deliberately deferred** (banked: multi-vendor
job-status coupling rule). Single-vendor is the overwhelmingly common case and is unambiguous.

## D-PD.6 — One swappable mapping, forward-only, ON_HOLD excluded

`DISPATCH_TO_JOB_ADVANCE` (one place): `ON_SITE → IN_PROGRESS`, `WORK_COMPLETE → PENDING_INVOICE`. Each
target carries a `fromCodes` allow-list of only the statuses that sit *before* it, so the follow is
forward-only (never regresses). `ON_HOLD` is in **no** `fromCodes`: a job an operator parked on hold is never
auto-advanced — operator intent wins over an automatic milestone.

## D-PD.7 — Auto-follow is LOCK-FREE forward-only by design

The cores lock the *assignment* (not the job); the auto-follow's `advanceJobStatus` reads + writes the job
**without** a job lock. This is deliberate: taking a job `FOR UPDATE` here would impose an assignment→job
lock order, the reverse of `sendDispatch`'s job→assignment order → deadlock risk. The forward-only `fromCodes`
guard makes a concurrent race a **no-op** (it never regresses or corrupts), so a lock isn't needed for
correctness. (Accepted trade-off: a vanishingly rare double-advance race resolves to the same forward state.)

## D-PD.8 — `PENDING_INVOICE` is the accounting-handoff seam

`PENDING_INVOICE` is a **non-terminal** `completed`-category status: work is physically done, billing hasn't
happened. It's the natural landing spot for a single vendor's `WORK_COMPLETE`. Invoicing (the billing arc,
CF-27.16) takes the job onward `PENDING_INVOICE → CLOSED / CLOSED_BILLED`. The two builds meet at this seam —
per-dispatch tracking produces "ready to bill"; billing consumes it.

## D-PD.9 — Reference data is MVP seed, not permanent config

Statuses/trades/priorities are seeded global/per-tenant reference data, resolved by **code** with the
dispatch→job mapping isolated in one place. This was a conscious MVP choice: a tenant-configurable
reference-data admin UI (add/rename/reorder statuses) is an **addition** later, not a rewrite — the
lookup-by-code indirection already insulates the platform from hard-coded ids.
