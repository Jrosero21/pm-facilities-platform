# Phase 26 — Phase Summary

**New Agents (arc): the Invoice Creator** · v2.9.0-phase-26 · branch `phase-26-invoice-agent`.

## Goal

Begin the v2.9.0 "new agents" arc by shipping the first one — `invoice_creator_v1` — following the
proven pattern the rewriter and scope generator established: register in the agent registry → run
through the shared runner → produce a reviewable draft → land at the §2.5-v1 review gate →
policy-able via Phase 23 → feedback-fed by Phase 25. The invoice creator is deliberately first
because it is **low-stakes / high-volume**: routine work, many reps, a fast and safe correction
signal that immediately feeds the Phase-25 loop.

## What it does

The agent reads a **submitted vendor invoice on a COMPLETED job** and drafts the **client-facing,
marked-up client invoice** the operator would otherwise write by hand. The split that makes this
safe to automate:

- **The LLM writes the words, never the numbers.** The model's structured-output schema is
  **number-free by construction** — a line item carries only `category`, `description`, and a
  `reconcilesToVendorLineId`. There is no quantity / unit-price / markup field anywhere in the
  schema, so the model is *structurally unable* to emit a dollar figure. This is money-safety as a
  type constraint, not a prompt instruction.
- **Every dollar derives from the vendor invoice.** After the model returns its phrasing, a
  **vendor-line-driven join** attaches the real costs: the code iterates the vendor invoice's lines
  (the source of truth for money), copies each line's quantity and unit price, and attaches the
  model's description by `reconcilesToVendorLineId`. No vendor cost can be dropped and no number can
  be invented.
- **Markup comes from the billing rules.** The per-line markup is the client's rule default
  (`resolveClientMarkupDefault`), carried on the draft as a **preview**; at publish it is re-resolved
  **fresh** from the current rule, so neither the model nor a stale draft value can set the billed
  markup.
- **A lazy/lumped vendor invoice is kept whole.** If the vendor sent a single non-itemized charge,
  the agent produces **one** client line at the vendor total and sets `lumpFlag = true` — it never
  fabricates a split into labor/materials sub-amounts.

## The arc: draft → review → materialize → issue

1. **Draft.** `runInvoiceCreator` opens a run, reads the job + vendor invoice + its lines + the job
   status (all auto-logged tool calls), enforces the **COMPLETED-job eligibility gate**, generates
   the phrasing, joins the numbers in, logs the decision at `queued_for_review`, and writes an
   `invoice_drafts` row at `pending_review`. It **always** queues for review — there is no
   auto-execute path.
2. **Review (the §2.5-v1 gate).** The operator approves, edits, or rejects. Crucially, the operator
   **can correct the numbers** at this gate (the gold signal); the AI cannot generate them. Edits
   land on `invoice_reviews.edited_content`; the draft's `proposed_invoice` stays immutable.
3. **Materialize (publish).** Publishing an approved draft **materializes** it into a real
   `client_invoices` row at `status='draft'` via the existing canonical billing writers
   (`createClientInvoice` + `addClientInvoiceLineItem` → `recalculateClientInvoiceTotals`). It is
   idempotency-guarded on `published_client_invoice_id`. Publish does **not** issue.
4. **Issue.** Issuance (draft → sent) stays the **existing accounting-gated** `sendClientInvoice` /
   `sendClientInvoiceAction`, untouched this phase — the materialized draft simply appears on the
   Client Invoices screen where accounting issues it.

## How it plugs into the platform

- **Phase-24 observability:** volume and cost surface for free (GROUP BY `agent_id`); a new
  `invoiceApproveAsIs` adapter + a fourth row in `agentApproveAsIs` make approve-as-is surface too.
- **Phase-25 feedback:** a new `invoiceCorrectionPairs` adapter (the scope JSON path —
  `CAST(... AS CHAR)`) makes the invoice drafts/reviews harvestable; few-shot is wired into the agent
  exactly as the rewriter/scope agents wire it. The invoice creator is now itself a correction source
  feeding the Phase-25 loop.

## What this retires

This phase retires **B-16.5** ("LLM-assisted draft phrasing — provider seam + `ai_prompt_templates`")
**partially**, on the per-agent schedule the roadmap defines. The invoice agent's share is delivered;
the residual is the proposal generator and the NTE negotiator (not yet built). B-16.5 stays OPEN with
that reduced residual. (Honest nuance: the seam B-16.5 names was built back in Phases 6–7 and is
*reused* here, not newly built — consistent with the "retires per agent" framing.)

## Scope discipline

The agent reads broad and writes narrow: it touches only its own `invoice_drafts` row at
`pending_review` and has no path to `client_invoices` — that is the human-gated publish action. It is
**fail-safe gated** (no `agent_policy_defaults` row seeded → `resolveAgentPolicy` returns
`requiresReview:true`). Enabling any autonomy is explicitly **not** done this phase (it would need a
Phase-23 policy *and* a live trigger that does not exist — CF-24.2).
