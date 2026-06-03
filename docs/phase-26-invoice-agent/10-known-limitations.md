# Phase 26 — Known Limitations

## CF-26.2 — Invoice publish partial-failure window (§2.6 accepted trade-off)

Publish is a **non-atomic sequence**: `createClientInvoice` + N× `addClientInvoiceLineItem` each run
in their own transaction, **before** the finalize transaction stamps `published_client_invoice_id` +
`status='published'`. We deliberately did **not** refactor the canonical billing writers to accept an
external transaction.

Consequence: a crash mid-sequence, or a concurrent publish, can leave an **orphaned `client_invoices`
DRAFT** — a never-issued draft invoice, safely operator-deletable, fully recoverable. The idempotency
guard (`published_client_invoice_id` non-null → `InvoiceAlreadyMaterialized`, checked pre-flight **and**
under the finalize-txn lock) prevents double-**materialization** of the *draft*; it does not prevent
the orphan. This is the §2.6 accepted cost of not over-engineering cross-writer atomicity.

**Close only if a no-cost guard appears.** The candidate guards (a `materializing` status enum value,
or a provisional marker before `createClientInvoice`) each need a follow-up migration or break the
`published_client_invoice_id` NULL-means-unpublished semantics — more than a trivial guard. Banked, not
built. (Recorded as **CF-26.2** in `closeout-carryforwards.md`.)

## CF-26.1 — No agent-assisted breakdown of lazy/lumped vendor invoices

When a vendor submits a single lumped charge, the agent keeps it **whole** at the vendor total with
`lumpFlag = true` — the money-safe behavior (it never fabricates a labor/materials split). A smarter
agent that *breaks out* a lumped charge into itemized lines would need **authored vendor rate data** to
attribute costs. The substrate exists — `vendor_rates` and `vendor_performance_scores` are real tables
— but they carry **no authored rate data** (no rate-book ingestion/authoring surface is built; B-16.4
independently confirms `vendor_performance_scores` is unpopulated). Deferred until that data exists.
(Recorded as **CF-26.1**.)

## Sign-off / required-documents readiness (Scenario 2/3) — NOT MODELED

The eligibility gate is "COMPLETED job + a vendor invoice on it." The richer readiness conditions —
"client requires sign-off," "required documents received" — are **not** part of the gate because there
is **no schema column** for them anywhere (verified in 26a). They are future data, not yet modeled; the
agent cannot key on what does not exist. If/when those signals are modeled, the gate extends.

## The harness proves invariants on a SEEDED/MOCK corpus — not live invoice quality

`db:check:invoice` (11/0) is a **seeded-fixture + mock** proof. The vendor corpus and the model are
synthetic. What it proves is exact and bounded:
- the **money-safety invariants** on the **real** join code (itemized client lines reconcile to vendor
  unit prices; no fabricated dollars; a lumped invoice kept whole at its total; markup is the rule
  preview only), and
- the **adapter plumbing** (`invoiceCorrectionPairs` buckets, `invoiceApproveAsIs` counts, volume) on
  a seeded corpus.

It does **not** measure live invoice quality — there is no live invoice-creator corpus yet. Like the
Phase-25 honesty rule: the machinery is what ships; quality signal accrues as real reviews accumulate.

## Autonomy is not wired (carries CF-24.2)

The agent is governable but gated; no live trigger invokes it (only the operator action). Enabling
autonomy needs a Phase-23 opt-in policy **and** a trigger that does not exist. Out of scope by design
(§2.3 — permission ≠ readiness).

## Soft notes

- **Issuance reuse:** the materialized draft is issued via the existing accounting-gated
  `sendClientInvoiceAction`. There is no invoice-creator-specific issuance surface (intentional — no
  duplicate enforcement path). The materialized draft appears on the Client Invoices screen.
- **No `published_at` on `invoice_drafts`:** publish state is `status='published'` + the FK
  (rewriter-style), deliberately not a separate timestamp column.
