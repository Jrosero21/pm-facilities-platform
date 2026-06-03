# Phase 26 — API Routes / Server Actions

No new HTTP routes. The phase adds one agent entrypoint and a set of server actions; issuance reuses
an existing action.

## Agent entrypoint (server)

```ts
runInvoiceCreator({ tenantId, jobId, vendorInvoiceId, triggeredByUserId? })
  : Promise<{ runId: string; draftId: string }>
```
`src/server/agents/invoice-creator/index.ts`. The fixed pipeline (openRun → reads → eligibility gate
→ generate → number-join → logDecision → write draft → closeRun). **Throws:** `JOB_NOT_FOUND`,
`VENDOR_INVOICE_NOT_FOUND`, `JOB_NOT_COMPLETED`, `NoActivePromptError` (real path, fail-closed), plus
any LLM/provider error. Always queues for review.

## Server actions — `src/app/(app)/jobs/invoice-actions.ts` (`"use server"`)

All use `requireTenant()` and return `{ error: string } | null`; all `revalidatePath(\`/jobs/${jobId}\`)`.

| Action | Signature | Effect |
|---|---|---|
| `generateInvoiceAction` | `(jobId, vendorInvoiceId)` | runs `runInvoiceCreator`; maps `NoActivePromptError`, `JOB_NOT_FOUND`, `VENDOR_INVOICE_NOT_FOUND`, `JOB_NOT_COMPLETED` |
| `approveInvoiceDraftAction` | `(jobId, draftId, _prev, formData)` | `resolveEditedInvoice(formData.editedContent, draft.proposedInvoice)` (null-if-unchanged, accepts operator-edited numbers) → `createInvoiceReview(approve)` |
| `rejectInvoiceDraftAction` | `(jobId, draftId, _prev, formData)` | requires `reviewNotes` → `createInvoiceReview(reject)` |
| `discardInvoiceDraftAction` | `(jobId, draftId)` | `discardInvoiceDraft` (pending or approved) |
| `publishInvoiceDraftAction` | `(jobId, draftId)` | `publishInvoiceDraft` — **materialize to a `client_invoices` DRAFT**; maps `InvoiceAlreadyMaterialized`, `DraftNotApproved`, `DRAFT_NOT_FOUND`, `JOB_NOT_FOUND` |

## Publish (server) — `src/server/agents/invoice-creator/publish.ts`

```ts
publishInvoiceDraft({ tenantId, jobId, draftId, actorUserId }) : Promise<{ clientInvoiceId: string }>
```
Guard → resolve approved content (`edited_content ?? proposed_invoice`) → `createClientInvoice`
(draft) → N× `addClientInvoiceLineItem` (`markupPercent: undefined` → fresh rule) → finalize txn
(stamp `published_client_invoice_id` + `status='published'`, audit). **Throws:** `DRAFT_NOT_FOUND`,
`DraftNotApproved`, `InvoiceAlreadyMaterialized`.

## Issuance — REUSED, not authored this phase

Issuing a materialized client invoice (Draft → Sent) is the **existing**, accounting-role-gated:
```ts
sendClientInvoiceAction(clientInvoiceId, jobId)   // src/app/(app)/jobs/[id]/client-invoices/actions.ts
  → enforceAccountingGate(ctx) → sendClientInvoice(...)
```
already wired into `src/components/client-invoice-actions.tsx` ("Send (issue)"). We deliberately did
**not** add an `issueClientInvoiceAction` (no duplicate issuance path).

## Reused billing writers (server)

`src/server/billing/`:
- `createClientInvoice` — draft client invoice (snapshots `payment_terms_days`).
- `addClientInvoiceLineItem` — adds a line; `markupPercent: undefined` re-snapshots the rule;
  runs `recalculateClientInvoiceTotals` inside.
- `resolveClientMarkupDefault` — the markup preview on the draft.
- `recalculateClientInvoiceTotals` — the single money writer (line extended/markup + header totals).
- Read tools: `getVendorInvoice`, `listVendorInvoiceLineItems`.

## Data layers (server) — `src/server/agents/invoice-creator/`

`drafts.ts` (`createInvoiceDraft`, `getInvoiceDraft`, `listInvoiceDraftsForJob[Detailed]`,
`discardInvoiceDraft`), `reviews.ts` (`createInvoiceReview`, `getApproveReviewForInvoiceDraft`),
`edits.ts` (`resolveEditedInvoice`), `tools.ts`, `llm.ts`, `prompt.ts`, `errors.ts`
(`DraftNotApproved`, `InvoiceAlreadyMaterialized`).

## Analytics adapters (server)

- `invoiceCorrectionPairs(tenantId)` (`analytics/correction-pairs.ts`) — the Phase-25 harvest adapter
  (`CAST(... AS CHAR)` JSON path); wired into `correctionPairsForAgent` / `allCorrectionPairs`.
- `invoiceApproveAsIs(tenantId)` (`analytics/agent-observability.ts`) — the Phase-24 approve-as-is
  adapter; a fourth row in `agentApproveAsIs`.
