# Phase 26 — Decisions

The load-bearing decisions for `invoice_creator_v1`, with the v2 invariant each one honors.

## D1 — Scope: draft a marked-up CLIENT invoice from a SUBMITTED vendor invoice

Of the candidate scopes for an invoice agent, the chosen one (option 3) is: the agent reads a
vendor invoice that has been submitted on a finished job and drafts the **client-facing, marked-up**
invoice. It is not an AP-side validator and it does not issue anything. This keeps the agent on the
high-volume, low-stakes path (routine billing) and produces a reviewable draft, never a final
document. **Honors §2.1** (AI output is a reviewable draft) and the proven rewriter/scope pattern.

## D2 — Money-safety is a TYPE constraint, not a prompt instruction

The LLM's zod schema is **number-free by construction**: a line item is
`{ category, description, reconcilesToVendorLineId? }` plus a top-level `lumpFlag`, `confidence`,
`rationale`. There is no quantity / unit-price / markup field anywhere in it. The model therefore
*cannot* emit a dollar amount — we do not rely on telling it not to. This is the phase's signature
decision. **Honors the platform money-discipline** (the LLM writes phrasing; `billing/totals.ts`
owns all money math).

## D3 — Vendor-line-driven join (not LLM-line-driven)

After generation, the number-join **iterates the vendor invoice's lines** (the source of truth for
costs) and attaches the model's description by matching `reconcilesToVendorLineId`. An unmatched
vendor line keeps its own description; a vendor line is never dropped. The inverse — iterating the
model's lines — was rejected because it could drop a vendor cost or admit an un-costed line. Result:
every client line's `unitPrice` provably equals a vendor line's `unitPrice`; no number is invented.
**Honors §2.5** (the hard-eligibility/integrity floor — the bill reconciles to its source).

## D4 — Markup: preview on the draft, re-resolved FRESH at publish

The draft carries a `markupPercent` that is the **rule preview** (`resolveClientMarkupDefault` for
the client). It is display-only. At publish, `addClientInvoiceLineItem` is called with
`markupPercent: undefined`, which makes the billing writer **re-snapshot the client's current rule**.
So neither the model nor a stale draft value can ever set the billed markup — the rule does, at the
moment of materialization. **Honors the markup-from-rules discipline.**

## D5 — Operators CAN edit numbers at the gate; the AI CANNOT generate them

A symmetry that resolves cleanly: the AI is structurally barred from producing a number (D2), but a
human reviewer **may** correct a quantity or unit price at the §2.5-v1 gate. `resolveEditedInvoice`
validates operator-edited numbers as well-formed decimals and accepts them as the **gold correction
signal** (they are *not* rejected for differing from the vendor figure). **Honors §2.5-v1** (the
draft-review gate is the operator's authority) and feeds Phase 25.

## D6 — Lazy/lumped vendor invoice: keep whole and flag

If the vendor sent a single non-itemized charge (zero itemized lines, or the model judges it lumped),
the agent produces **one** client line at the vendor **total** and sets `lumpFlag = true`. It never
fabricates a labor/materials split. A smarter agent-assisted breakdown is deferred to **CF-26.1**
(blocked on authored vendor rate data, which does not exist). **Honors §2.1** (no invented content)
and the money-safety rule.

## D7 — Publish = MATERIALIZE to a draft; issuance stays the existing accounting gate

`publishInvoiceDraft` materializes an **approved** draft into a `client_invoices` row at
`status='draft'`. It does **not** issue. Issuance (draft → sent) remains the **existing**
accounting-role-gated `sendClientInvoice` / `sendClientInvoiceAction` (built in Phase 8), which is
already wired into the Client Invoices UI. We deliberately did **not** author a second issuance path
(`issueClientInvoiceAction`) — reusing the canonical, already-gated one avoids a duplicate enforcement
surface. **Honors §2.5-v1** (a second human, accounting, issues the money) and the no-duplication
discipline.

## D8 — Non-atomic publish + idempotency guard (the §2.6 trade-off)

The canonical billing writers each own their own transaction; we did **not** refactor them to accept
an external tx. So publish is a **sequence**: guard → `createClientInvoice` → N×
`addClientInvoiceLineItem` → a small finalize txn that stamps `published_client_invoice_id` +
`status='published'` under the draft lock. The idempotency guard (pre-flight read **and** in-txn
re-check on `published_client_invoice_id` non-null → `InvoiceAlreadyMaterialized`) prevents
double-materialize. The accepted cost: a mid-sequence crash or a concurrent publish can orphan a
`client_invoices` DRAFT (never issued, operator-deletable, recoverable) — banked as **CF-26.2**.
**Honors §2.6** (idempotency) as an explicit, recorded trade-off rather than over-engineering
cross-writer atomicity.

## D9 — Fail-safe gated by default; no autonomy this phase

We seeded an `ai_prompt_template_defaults` row for `invoice_creator_v1` (so the real path resolves a
prompt) but **deliberately seeded NO `agent_policy_defaults` row**. `resolveAgentPolicy` therefore
fail-safes to `{ requiresReview: true }` — the agent always queues for review. **Honors §2.1**
(absence of policy must never mean auto-execute). Enabling autonomy would need a Phase-23 policy *and*
a live trigger that does not exist (CF-24.2); neither is in scope.

## D10 — Eligibility floor: COMPLETED job + a vendor invoice on it

The agent's hard-eligibility gate (§2.5) is: the vendor invoice exists and belongs to the job
(`vendorInvoice.jobId === jobId`), **and** the job's status `code === 'COMPLETED'` (the stable global
`job_statuses.code`, not the tenant-editable name). The Scenario-2/3 "requires sign-off / documents
received" conditions are **not** part of the gate because they are **unmodeled** (no schema column —
see `10-known-limitations.md`).

## D11 — Specialized draft/review tables, mirroring the scope substrate

`invoice_drafts` / `invoice_reviews` are new specialized tables (migration 0047), not a reuse of the
rewriter/scope tables and not a premature shared `agent_drafts` table — exactly the precedent the
scope generator set. `proposed_invoice` / `edited_content` are JSON (structured invoice), so the
Phase-25 adapter uses the scope **`CAST(... AS CHAR)`** path, not the rewriter plain-text path.
**Honors §2.2** (the agent's work is captured in the agent_* substrate; human actions in `audit_logs`).

## Invariants honored (summary)

- **§2.1 fail-safe gated** — no policy default → `requiresReview:true`; AI output is a reviewable draft.
- **§2.2 not-silent** — every run/tool-call/decision logged to `agent_runs` / `agent_tool_calls` /
  `agent_decisions`; human review/publish to `audit_logs`.
- **§2.5 hard-eligibility floor** — COMPLETED-job + vendor-invoice eligibility; numbers reconcile to
  the vendor source.
- **§2.5-v1 draft-review gate** — intact and unchanged; operator edits are the authority.
- **§2.6 idempotency** — publish guarded on `published_client_invoice_id`.
