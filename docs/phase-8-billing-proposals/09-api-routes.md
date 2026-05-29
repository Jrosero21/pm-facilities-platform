# Phase 8 — Operator-Callable Surface

Phase 8 exposes no HTTP/REST API. The callable surface is **server actions** (the UI's write path) over a **data-layer** of readers + writers. Browser → server action → data-layer function → DB; the browser never touches MySQL. This doc is the contract map: what each layer exposes, and where the gates sit.

## Accounting-gated actions (the 4 — `requireTenant` + `enforceAccountingGate(ctx)` → redirect `/forbidden`)

| Action | File | Wraps |
|---|---|---|
| `sendClientInvoiceAction(id, jobId)` | `jobs/[id]/client-invoices/actions.ts` | `sendClientInvoice` (draft→sent, issuance) |
| `voidClientInvoiceAction(id, jobId)` | same | `voidClientInvoice` (sent→void) |
| `recordPaymentAction(jobId, prev, formData)` | `jobs/billing-actions.ts` | `recordPayment` (XOR direction) |
| `markBillingClosedAction(jobId, prev, formData)` | same | `markBillingClosed` (→CLOSED_BILLED) |

The gate policy is the pure `isAccountingRole(roleKeys, isSuperAdmin)` (`role-gates.ts`); `enforceAccountingGate` (`auth-context.ts`) applies it + redirects. UI buttons render only when `isAccountingRole(ctx)` (defense-in-depth; the action is the backstop).

## Operator actions (`requireTenant`-only) — by domain

- **Proposals** (`jobs/[id]/proposals/actions.ts`): `createProposalAction`, `updateProposalDraftAction`, `add/update/removeProposalLineItemAction`, `sendProposalAction`, `recordProposalAcceptanceAction(decision)`, `withdrawProposalAction`, `createProposalRevisionAction`.
- **Change orders** (`jobs/[id]/change-orders/actions.ts`): `createChangeOrderAction`, `updateChangeOrderDraftAction`, `add/update/removeChangeOrderLineItemAction`, `submitChangeOrderAction`, `approveChangeOrderAction`, `declineChangeOrderAction`, `withdrawChangeOrderAction`.
- **Vendor invoices (AP)** (`jobs/[id]/vendor-invoices/actions.ts`): `recordVendorInvoiceAction`, `add/update/removeVendorInvoiceLineItemAction`, `approveVendorInvoiceAction`, `disputeVendorInvoiceAction`.
- **Client invoices (AR) — CRUD** (`jobs/[id]/client-invoices/actions.ts`): `createClientInvoiceAction`, `add/update/removeClientInvoiceLineItemAction` (send/void are the gated pair above).
- **NTE rules** (`clients/[id]/nte-rules/actions.ts`): `createClientNteRuleAction`, `activateClientNteRuleAction`, `archiveClientNteRuleAction`.

All return `{ error: string } | null` (useActionState); auth/tenant failure redirects; F3 operational errors return inline `{ error }`; create/revise redirect to the new record. (See `02-decisions.md` §D for the catch discipline.)

## Data layer (`src/server/billing/`) — readers + writers

- **`nte.ts`** — `resolveClientNteRule(input)→ResolvedNte|null`, `createClientNteRule`, `activateClientNteRule`, `archiveClientNteRule`, `listClientNteRules(tenantId, clientId)`. (Lifecycle writers emit `audit_logs` — CF-8c.1.1.)
- **`totals.ts`** — `recalculate{Proposal,ChangeOrder,VendorInvoice,ClientInvoice}Totals(tx, …)` (the sole money-math writers), `roundHalfUp(value)`. Caller owns the txn. `recalculateVendorInvoiceTotals` takes a 4th `governingNte` param (the exceeds-NTE arm).
- **`events.ts`** — `emitJobBillingEvent(tx, params)` (the taxonomy boundary; inside the caller's txn), `listJobBillingEvents(tenantId, jobId)` (returns `actorName` via LEFT join, 8c.11a).
- **`proposals.ts`** — lifecycle writers + line CRUD; readers `getProposal`, `listProposalsForJob`, `listProposalLineItems`.
- **`change-orders.ts`** — lifecycle writers + line CRUD; `getEffectiveNte(tenantId, jobId)→string|null` (computed-on-read); readers `getChangeOrder`, `listChangeOrdersForJob`, `listChangeOrderLineItems`.
  - _`proposal_approvals` / `change_order_approvals` are **write-only audit records** — written by the accept/approve/decline writers (`recordProposalAcceptance`, `approveChangeOrder`/`declineChangeOrder`), **no reader by design**; the decision surfaces operator-visibly via the billing-event timeline (`proposal.accepted/declined`, `change_order.approved/declined`)._
- **`vendor-invoices.ts`** — `recordVendorInvoice`, line CRUD, `approveVendorInvoice`, `disputeVendorInvoice`; readers `getVendorInvoice`, `listVendorInvoicesForJob`, `listVendorInvoiceLineItems`, `sumApprovedVendorInvoiceTotals`.
- **`client-invoices.ts`** — `createClientInvoice`, line CRUD, `sendClientInvoice`, `voidClientInvoice`; readers `getClientInvoice`, `listClientInvoicesForJob`, `listClientInvoiceLineItems`, `resolveClientMarkupDefault`, `sumApprovedClientInvoiceTotals`.
- **`payments.ts`** — `recordPayment(input)` (no `jobId` param — writer-derived); readers `getPayment`, `listPaymentsForJob`, `listPaymentsForVendorInvoice`, `listPaymentsForClientInvoice`.
- **`margin.ts`** — `getJobMargin(tenantId, jobId)→{revenue, cost, margin}` (the sole AR↔AP meeting point).
- **`close.ts`** — `markBillingClosed(input)`, `getBillingCloseReadiness(tenantId, jobId)→{ready, concerns[]}`.
- **`money.ts`** — `isDecimalStr`, `assertCommonLineFields` (pure validators; no DB).
- **`errors.ts`** — F3 error classes (state-machine guards) + generic sentinels.

**Phase-4 retrofit:** `createJob` (`src/server/jobs.ts`) became the sole writer of `jobs.not_to_exceed_amount`. **Auth:** `enforceAccountingGate(ctx)` added to `auth-context.ts`.

## Routes (Next App Router pages, all `ƒ` dynamic)

- `/jobs/[id]` — billing section + record-type list sections + payments + close.
- `/jobs/[id]/proposals/new` · `/jobs/[id]/proposals/[proposalId]`
- `/jobs/[id]/change-orders/new` · `/jobs/[id]/change-orders/[changeOrderId]`
- `/jobs/[id]/vendor-invoices/new` · `/jobs/[id]/vendor-invoices/[vendorInvoiceId]`
- `/jobs/[id]/client-invoices/new` · `/jobs/[id]/client-invoices/[clientInvoiceId]`
- `/jobs/[id]/payments/new`
- `/clients/[id]/nte-rules`

Every reader/writer is tenant-scoped (`eq(tenantId)` on every query). The forward NTE negotiator (deferred, OQ-27) would be the first **LLM-native tool-use agent** on the existing runner — no new route, an agent over this same data layer.
