# Phase 8 — Business Rules

The rules that govern billing behavior, bounded to what Phase 8 enforces. Each is enforced by the data layer (not just convention). Operator flows are in `03-user-sop.md`; the deferred edges in `10-known-limitations.md`.

## NTE (not-to-exceed)

- **NTE is snapshotted at job creation, then a fixed ceiling.** `createJob` resolves the client's NTE rule and stamps `jobs.not_to_exceed_amount`; later rule edits never change existing jobs.
- **The 5-case override matrix** (`createJob`, 8c.4) determines what gets stamped and whether it's audited:
  - **A** — a rule resolved, no operator value → stamp the **rule amount** (no event).
  - **B** — operator value **equals** the resolved rule → stamp the operator value, **no event** (accepting the pre-fill isn't an override).
  - **C** — operator value **differs** from the resolved rule → stamp the operator value + emit **`nte.overridden`** (the audited financial decision).
  - **D** — no rule, operator value given → stamp it (manual NTE, no event).
  - **E** — no rule, no operator value → **NULL** (the job has no ceiling).
- **Effective NTE = base + Σ approved change-order totals**, computed on read (`getEffectiveNte`); a job with a NULL base has no effective ceiling (the aggregate breach check is skipped, not treated as 0).
- **Vendor-invoice breach is two independent checks** (evaluated at approval): the invoice exceeds its own ceiling (its dispatch's agreed amount, else the job's effective NTE) → per-invoice `nte.exceeded`; **and** the job's total *approved* AP crosses the job's effective NTE → an aggregate `nte.exceeded`.
- **First-crossing only** (aggregate): the aggregate breach fires **once**, when approved-AP transitions from ≤ effective-NTE to > effective-NTE. Subsequent over-ceiling approvals do **not** re-fire it (it only re-fires if the total drops back to ≤ and crosses again — practically, it doesn't repeat once breached).
- **NTE is advisory, not a hard block.** Breaching it flags the invoice (`exceeds_nte`) and emits `nte.exceeded` for audit/visibility, but it **never prevents** the operator from approving the vendor invoice. The ceiling informs the decision; it doesn't gate it. (A hard dollar-gated approval threshold is explicitly out of scope — OQ-21, `10-known-limitations.md`.)

## Markup (AR)

- **Three-way at line creation:** leave the markup field **blank** → snapshot the client's default markup (from `client_billing_rules`); enter **`0`** → explicitly no markup; enter a **value** → override. The snapshot is at creation; later rule changes don't touch existing lines.
- **Editing a line without a markup value leaves the existing markup unchanged** (no silent re-snapshot).
- **Markup is internal-only** (OQ-6) — the cost+markup split is never exposed to the client (the Phase-11 portal shows the marked-up total only).

## Revenue & payment

- **AR revenue counts at `status='sent'` only.** A client invoice contributes to revenue (and margin) when **issued** (sent) — drafts and voided invoices don't. **`payment_status` is orthogonal:** a paid invoice is still `status='sent'`; payment state never affects revenue recognition.
- **A payment references exactly one invoice, matching its direction** (the XOR, D-7.7): incoming/inbound → a client invoice; outgoing/outbound → a vendor invoice. Never both, never neither. The `job_id` is derived from that invoice, never operator-entered.
- **Payable preconditions:** a **vendor** invoice is payable only when **approved**; a **client** invoice only when **sent**. ("This invoice isn't ready to pay yet" = approve / send it first.)
- **Payment status is derived** (sole-writer `payments.ts`): Σ payments vs the invoice total → unpaid / partially_paid / paid. The "paid in full" event fires on the **first** crossing to paid.
- **Overpayment is allowed** (Σ > total → caps at `paid`); there is **no overpaid status, credit balance, or reconciliation workflow** (CF-8c.9.1) — operators reconcile manually.

## Control split (who can do what)

- **Bifurcated invoice control (OQ-24):** the **operator** approves a *vendor* invoice (it's valid, work was done); **accounting** approves the *payment*. Approving a vendor invoice is not the same as paying it.
- **Accounting-gated actions (OQ-23/24):** **issue** (send) a client invoice, **void** a client invoice, **record a payment**, **close billing** — accounting role or super-admin only. Everything else (proposals, change orders, vendor-invoice record/approve/dispute, client-invoice authoring, NTE-rule admin) is operator-level.
- **Voiding a sent client invoice does not check payment status** — voiding an invoice with payments received is permitted; **the operator is responsible** for refunding/reconciling (there's no system guard, CF-8c.8.2/CF-8c.9.1). Voiding drops the invoice from revenue.

## Lifecycle rules

- **Proposals:** accepted is a **commitment** — not withdrawable; alter via a revision or a change order. Withdraw is for draft/sent/viewed only. A revision re-opens any accepted/terminal proposal as a fresh draft (one live revision per chain at a time).
- **Proposal vs change order:** revise a **proposal** before acceptance/work; create a **change order** for scope changes after work has started. Change orders are **forward deltas** — no "revise a CO"; a redo is a new CO.
- **Change-order approval vocabulary:** operators "approve" / "decline" a change order; the approved state is final (no further actions). _(Internally the decision is recorded as `accepted`/`declined` to share the proposal approval shape — invisible to the operator; CF-8c.6.1.)_
- **Vendor-invoice recording is assignment-anchored** (CF-8c.11d.1): record an AP invoice only against an existing dispatch (which supplies the vendor); dispatch a vendor first if needed.
- **Billing close is explicit and operator-initiated** (OQ-25), never automated; **independent of operational close** (8c-D6) — a job can be billing-closed from any status. It's final and snapshots the margin; the readiness signal is advisory, never blocking.

## Money math

- **`decimal(12,2)`, round-each-line-then-sum, round-half-up, explicit-mode** (OQ-1) — the totals writers are the sole arithmetic authority; the UI never computes money. **Same-currency MVP** (OQ-2): currency is stored but not converted.
- **Margin = Σ sent client-invoice totals − Σ approved vendor-invoice totals** (`getJobMargin`); snapshotted at billing close.
