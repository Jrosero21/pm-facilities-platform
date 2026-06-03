# Phase 26 — Business Rules

The rules `invoice_creator_v1` adds or enforces.

## Money-safety

- **The LLM never emits a dollar figure.** The structured-output schema is number-free
  (`{ category, description, reconcilesToVendorLineId? }` + `lumpFlag`/`confidence`/`rationale`).
  Enforced by the type, not a prompt.
- **Every client-line dollar derives from the vendor invoice.** Costs are copied from the vendor
  lines (or, for a lump, the vendor total). The number-join iterates vendor lines, so no cost is
  dropped and no number is invented. Every produced `unitPrice` provably equals a vendor `unitPrice`
  (or the vendor total for a lump).
- **Markup is rule-resolved, twice.** On the draft, `markupPercent` is the client rule **preview**
  (`resolveClientMarkupDefault`). At publish, `addClientInvoiceLineItem` is called with
  `markupPercent: undefined` so the writer **re-snapshots the current rule**. The model/draft value is
  never the billed markup.
- **Totals are owned by `recalculateClientInvoiceTotals`** (the single money writer), run inside each
  line add at publish. The agent never computes a total.

## Lazy/lumped vendor invoices

- A single non-itemized vendor charge is kept **whole**: one client line at the vendor **total**,
  `lumpFlag = true`, `reconcilesToVendorLineId = null`. **Never** split into invented sub-amounts.
- The model may *set* `lumpFlag` (its judgment that the vendor was lazy), but still emits no numbers.
  The lump branch also fires whenever the vendor invoice has zero itemized lines, regardless of the
  model's judgment.

## Eligibility (the §2.5 hard floor)

- The vendor invoice must exist and belong to the job (`vendorInvoice.jobId === jobId`).
- The job's status `code` must be **`COMPLETED`** (the stable global `job_statuses.code`, not the
  tenant-editable name).
- "Requires sign-off / required documents received" (Scenario 2/3) is **not** part of the gate — it is
  unmodeled (no schema column).

## The review gate (§2.5-v1)

- The draft always lands at `pending_review`; the agent has no auto-execute path.
- Operators may **approve / edit-then-approve / reject / discard**.
- **Operators may edit numbers** at the gate; the edited invoice (`edited_content`) is the
  operator-corrected version and the gold training signal. Edits are validated as well-formed decimals
  but are **not** rejected for differing from the vendor figure (the human has the authority).
- `proposed_invoice` is **immutable**; effective published content = `edited_content ?? proposed_invoice`.
- Discard is allowed from `pending_review` **or** `approved` (a stranded approved draft needs a
  disposal path); terminal states are not discardable.

## Publish / issue

- **Publish materializes** an approved draft into a `client_invoices` row at `status='draft'` — it
  does **not** issue.
- **Idempotency:** a draft with a non-null `published_client_invoice_id` cannot be published again
  (`InvoiceAlreadyMaterialized`), enforced both pre-flight and under the finalize-txn lock.
- **Issuance** (draft → sent) is **accounting-gated** and unchanged (the existing `sendClientInvoice`
  / `sendClientInvoiceAction`).

## Governance / autonomy

- **Fail-safe gated:** no `agent_policy_defaults` row for the agent → `requiresReview:true`. Absence
  of policy never means auto-execute (§2.1).
- Autonomy is **not** enabled this phase; it would require a Phase-23 opt-in policy and a live trigger
  that does not exist (CF-24.2).

## Audit

- The agent's run, every tool call, and the decision are logged to `agent_runs` / `agent_tool_calls`
  / `agent_decisions` (§2.2 — not silent).
- Human actions (review, discard, publish) are logged to `audit_logs`. The agent's own draft write is
  captured in `agent_tool_calls`, not `audit_logs`.
