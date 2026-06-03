# Phase 26 — System Workflows

The two flows the invoice creator adds: the draft pipeline and the review→materialize→issue lifecycle.

## A. The draft pipeline (`runInvoiceCreator`)

A fixed pipeline on the shared runner, mirroring the scope generator with a number-join inserted
after generation:

1. **openRun** — one `agent_runs` row (`agent_id='invoice_creator_v1'`, `trigger_source='operator_manual'`).
2. **Read-broad (auto-logged tool calls):**
   - `getJobDetail` → the job (client, trade, problem, approved scope); throw `JOB_NOT_FOUND` if absent.
   - `getVendorInvoice` → the source AP invoice; throw `VENDOR_INVOICE_NOT_FOUND` if absent **or**
     `vendorInvoice.jobId !== jobId`.
   - `listVendorInvoiceLineItems` → the vendor lines (the cost source).
   - `getJobStatusCode` → the stable `job_statuses.code`.
3. **Eligibility gate** — `statusCode === 'COMPLETED'` else throw `JOB_NOT_COMPLETED`.
4. **Resolve routing** — `resolveInvoiceRouting()`. On the real path: `resolveActivePrompt` (system
   prompt + temperature, fail-closed) and `resolveAgentPolicy` (governs disposition; carries the B2
   `failoverOrder`). The mock path skips the DB prompt and records `prompt_version='mock'`.
5. **Few-shot** — `routing.mode === 'mock' ? [] : selectFewShotPairs(await invoiceCorrectionPairs(tenantId))`
   (GOLD-first, cap 20, NEGATIVE excluded; empty → single-shot).
6. **Generate (phrasing only)** — `generateInvoice(...)`: the **number-free** zod schema; with
   few-shot, prior turns precede the user prompt; provider preference + failover applied inside.
7. **Number-join (the money-safety step)** — `resolveClientMarkupDefault` for the preview markup;
   then:
   - **itemized** (`vendorLines.length > 0` and not lumped): iterate **vendor lines**, copy each
     line's `quantity`/`unit`/`unitPrice` (cost), attach the model's `description` by
     `reconcilesToVendorLineId` (fallback = the vendor line's own description), set
     `reconcilesToVendorLineId = vendorLine.id`;
   - **lump** (`lumpFlag === true` or `vendorLines.length === 0`): ONE line at the vendor **total**,
     `reconcilesToVendorLineId = null`, `lumpFlag = true`.
8. **logDecision** — `decision_type='invoice_proposal'`, `disposition='queued_for_review'`,
   `policy_check = requiresReview ? 'requires_review' : 'review_not_required'`,
   `metadata={ lineCount, lumpFlag }`. **Always queued.**
9. **Write-narrow (auto-logged)** — `createInvoiceDraft` → one `invoice_drafts` row at
   `pending_review`. `proposed_invoice` is immutable.
10. **closeRun** — `succeeded` with model, prompt_version, tokens. On any failure the run closes
    `failed` and the error re-throws for the action to surface.

## B. Review → materialize → issue lifecycle

```
                         operator                         operator                accounting
 invoice_drafts ──────────────────► invoice_drafts ───────────────► client_invoices ──────────► client_invoices
   (pending_review)   approve/edit     (approved)      publish          (draft)        send (issue)   (sent)
        │  reject → rejected (review row)                                  ▲
        │  discard → discarded (no review row)                            │
        └─ edited_content carries operator corrections ──────────────────┘  (effective = edited ?? proposed)
```

- **Review** (`createInvoiceReview`, a 2-row txn): lock the draft `FOR UPDATE`, re-check
  `pending_review`, insert the review, advance the draft (`approve→approved` / `reject→rejected`),
  write `audit_logs` **inside** the txn. `edited_content` (nullable JSON) is the operator's edit;
  null = approved-as-is.
- **Publish** (`publishInvoiceDraft`): load + guard (`DRAFT_NOT_FOUND` / `InvoiceAlreadyMaterialized`
  if already published / `DraftNotApproved`); resolve the **approved content** (`edited_content ??
  proposed_invoice` — operator corrections win); `createClientInvoice` (draft) → N×
  `addClientInvoiceLineItem` with `markupPercent: undefined` (fresh rule re-resolve) →
  `recalculateClientInvoiceTotals` inside each; then a **finalize txn** locks the draft, re-checks
  `approved` and `published_client_invoice_id IS NULL`, stamps `published_client_invoice_id` +
  `status='published'`, and audits. Returns `{ clientInvoiceId }`. Non-atomic by design (§2.6) — see
  `10-known-limitations.md` (CF-26.2).
- **Issue**: the **existing** accounting-gated `sendClientInvoice` (Draft → Sent), unchanged.

## C. Feedback + observability hooks

- Every approve/edit/reject is harvestable by `invoiceCorrectionPairs` (run → draft → review join,
  `CAST(... AS CHAR)` JSON path) → classified POSITIVE / GOLD / NEGATIVE → fed back as few-shot.
- The agent surfaces in the Phase-24 readers: volume/cost/dispositions/failures/latency free;
  approve-as-is via `invoiceApproveAsIs`.
