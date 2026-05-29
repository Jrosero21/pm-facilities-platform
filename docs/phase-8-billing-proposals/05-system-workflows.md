# Phase 8 — System Workflows

End-to-end billing flows and how the data moves across domains. The operator steps are in `03-user-sop.md`; the rules in `06-business-rules.md`; the architectural rationale in `02-decisions.md`.

## Job lifecycle with billing

Operational status and billing status share one column (`jobs.current_status_id`) but are **independent transitions** (8c-D6 / OQ-26): `NEW → … → COMPLETED → CLOSED` is the operational arc; **`CLOSED_BILLED`** is the terminal reached by the *explicit, accounting-gated* billing-close action — **from any status**, not necessarily after operational `CLOSED`. A job can be billing-closed while still operationally open, or vice-versa; the billing-close writer only refuses if the job is already `CLOSED_BILLED`.

## The happy path (quote → deliver → bill → close)

1. **Proposal** sent to the client and **accepted** (AR side, operator). _(Quote-first isn't supported — a proposal already belongs to a job; see `10-known-limitations.md`, OQ-12.)_
2. **Job created** → `createJob` resolves the client's NTE rule (client × trade × priority [× location]) and **snapshots** `jobs.not_to_exceed_amount`; an operator override emits an `nte.overridden` audit event (the 5-case matrix, `06-business-rules.md`).
3. **Vendor dispatched** (Phase 5) → a `job_vendor_assignments` row, optionally with an agreed NTE.
4. **Vendor invoice received** → recorded against that dispatch → operator **approves** it. At approval the system checks it against its ceiling and emits `nte.exceeded` if it (or the job's total approved AP) breaches.
5. **Client invoice created** → lines added (markup pre-filled from the client billing rule) → **sent** (accounting). Sending captures revenue.
6. **Payments recorded** (accounting) — outgoing to the vendor (against the approved vendor invoice), incoming from the client (against the sent client invoice). Each invoice's `payment_status` derives from Σ payments; a "paid in full" event fires on the first crossing.
7. **Billing closed** (accounting) → job → `CLOSED_BILLED`; the **final margin is snapshotted** into the `billing.closed` event + audit row.

Throughout, **margin** (`getJobMargin`) reads live: Σ *sent* client-invoice totals (revenue) − Σ *approved* vendor-invoice totals (cost).

## The change path (scope changed after acceptance)

A **change order** (not a proposal revision — work has started) is **submitted → approved**. Approved change-order totals raise the job's **effective NTE**, which is **computed on read** (`getEffectiveNte` = base `jobs.not_to_exceed_amount` + Σ approved-CO totals), never stored. So every *subsequent* vendor-invoice approval checks against the *new, higher* effective ceiling automatically — no recomputation step, no stored value to drift. (A declined/withdrawn CO contributes nothing; a redo is a new CO — `06-business-rules.md`.)

## The dispute path

A vendor invoice received but contested is **disputed** (received/under_review → disputed) — terminal in Phase 8 (no transition out; a resolve-dispute / re-review writer is a future workflow — CF-8c.docs.2, `10-known-limitations.md`). A disputed invoice is excluded from approved-AP cost (so it doesn't count toward margin or the aggregate NTE check) until/unless re-handled by a future writer.

## Where the history lives (four substrates, by purpose)

| Substrate | Records | Written by |
|---|---|---|
| `job_status_history` | operational status transitions (from→to) | createJob (initial), billing-close |
| `job_events` | the operational timeline (`job.created`, `job.status_changed`, …) | createJob, billing-close |
| **`job_billing_events`** | the **financial timeline** — 21 types (`proposal.*`, `change_order.*`, `vendor_invoice.*`, `client_invoice.*`, `payment.recorded`, `nte.exceeded`, `nte.overridden`, `billing.closed`) | every billing writer, via `emitJobBillingEvent` |
| `audit_logs` | platform-wide audit — `billing.closed`, `client_nte_rule.{created,activated,archived}` (config-scoped, not job-scoped) | billing-close, NTE-rule writers |

The job-detail **timeline** merges `job_events` + communications + notes + `job_billing_events` into one chronological feed (the billing close appears in *two* lanes: an operational `job.status_changed` and a financial `billing.closed` — each self-describing, no status-id resolution needed). See `03-user-sop.md` for reading it.

## What the system enforces (so the operator doesn't have to)

The flows above rely on data-layer invariants the operator needn't track by name. The two most directly governing these flows:
- **A payment references exactly one invoice, matching its direction** (the XOR), and its `job_id` is **derived from that invoice** — the direction toggle + invoice picker mirror this; a payment can't be misfiled against the wrong job, and a direction/ref mismatch is rejected.
- **One canonical writer per money column** (line/header totals, `payment_status`, the job NTE) — the math is never done two ways (R-7.2).

The other guarantees the flows lean on — billing close never touching NTE/scope/dispatch data, and AR↔AP meeting only in the margin reader — are in `02-decisions.md` §A/§E.

## Roles in the flow

Operator-level actions vs. the four accounting-gated ones (issue/void a client invoice, record a payment, close billing) — the full role-by-role split is in `06-business-rules.md` (Control split).
