# Phase 8 — 8c Construction Plan (construction-gate design proposal)

**Status:** **plan-only — NO code, NO data-layer, NO DB touched this turn.** Output is this plan. Cadence mirrors **7c**: staged sub-batches, **hold-for-review at each sub-batch boundary**, **pre-DB code review** before any DB-touching turn + **verify-result review** after, F3 named errors for testable failure modes (D-7.7), **one commit per coherent sub-batch**.
**Source of truth:** `8a-design-proposal.md` (`f5a3736`, 27 OQs LOCKED + Surface 23) and `8b-schema-plan.md` (`24b82dc`; migrations applied `2475712`). Every sub-batch cites the 8a surface (#N) / OQ / 8b §5–§6 invariant it implements — the plan is a contract.

---

## §0 — Inherited construction patterns (from the live repo; mirror, do not redesign)

Confirmed against the live data layer:
- **Data-layer modules** are `server-only` (`import "server-only"`). Writers take an explicit `{ tenantId, …, actorUserId }` and run `db.transaction(async (tx) => { … })`.
- **Parent-before-child lock order** (R-5.7/R-6.21): `tx.select(...).for("update")` the parent, then the child; **re-check guards under the lock**; then writes; then **audit INSIDE the txn** (`tx.insert(auditLogs)`, R-6.7) for operator-gated state changes. (`scope-generator/publish.ts` is the template.)
- **F3 named errors** (`agents/config/errors.ts`, `scope-generator/errors.ts`): named classes (not generic `Error`) so a verify script can assert the *specific* failure fired. Generic not-found stays a string `throw new Error("X_NOT_FOUND")`.
- **Single-active write-path** (`agents/config/policies.ts` `activateAgentPolicy`): one txn — demote current `active` (no `LIMIT`; assert demoted ≤ 1 → `SingleActiveInvariantViolated`), promote target (assert affected == 1 → `ActivationTargetMismatch`); NULL-aware key matching (`isNull` vs `eq`) for nullable key columns. **This is the exact template for `client_nte_rules` (nullable `client_location_id`).**
- **JSON read-parse** (R-6.19): `metadata` / json columns come back as strings; `JSON.parse` at the read boundary.
- **Audit:** `writeAuditLog(...)` (`server/audit.ts`) for non-txn / best-effort; **direct `tx.insert(auditLogs)`** for in-txn operator actions. `auditLogs` shape: `{ tenantId, userId, action (dot-namespaced), targetType, targetId, metadata }`.
- **Server actions** (`app/(app)/jobs/*-actions.ts`): `"use server"`; `const ctx = await requireTenant()`; `try { await <dataLayerWriter>(...) } catch (err) { map named errors → { error: string } }`; `revalidatePath`. State type `{ error: string } | null`.
- **Role gate ALREADY EXISTS** — `requireRole(...keys)` (`auth-context.ts`): checks tenant+global `roleKeys`, **super_admin auto-passes**, redirects `/forbidden`. **⇒ the user's proposed "8c.10 role-enforcement substrate" is unnecessary** (see §2 note). `requireTenant()` yields `{ user, activeTenant, roleKeys, … }`.
- **Billing data-layer home (decision):** a new **`src/server/billing/`** subdir (mirrors `src/server/agents/` for a large cohesive domain) holding `errors.ts`, `nte.ts`, `totals.ts`, `events.ts`, `proposals.ts`, `change-orders.ts`, `vendor-invoices.ts`, `client-invoices.ts`, `payments.ts`, `close.ts`. *Alternative considered:* flat `src/server/<domain>.ts` files (the `jobs.ts`/`dispatch.ts` convention) — rejected for 9+ tightly-coupled modules; the subdir keeps the billing domain together. **Flag at 8c.1 review.**

---

## §1 — Sub-batch sequence (dependency-ordered)

Foundational substrate first (read/write primitives nothing else can skip), then the per-record data layers (each consumes the primitives), then UI. **11 sub-batches** + the role gate applied inline (not its own sub-batch).

| # | Sub-batch | Depends on | Maps to user's list | Commit |
|---|---|---|---|---|
| **8c.1** | NTE substrate — resolve + activate + rule CRUD | schema 0017 | 8c.1 | 1 |
| **8c.2** | Totals infrastructure — 4 `recalculate*Totals` + rounding helpers | — | 8c.2 | 1 |
| **8c.3** | Billing events — `emitJobBillingEvent` + taxonomy + reader | schema 0023 | 8c.3 | 1 |
| **8c.4** | createJob NTE integration — snapshot + `nte.overridden` audit | 8c.1, 8c.3 | *(new — surfaced)* | 1 |
| **8c.5** | Proposal data layer | 8c.2, 8c.3 | 8c.4 | 1 |
| **8c.6** | Change-order data layer + effective-NTE computed-on-read | 8c.2, 8c.3, 8c.5 | 8c.5 | 1 |
| **8c.7** | Vendor-invoice data layer + `exceeds_nte` + multi-dispatch aggregate | 8c.2, 8c.3, 8c.6 | 8c.6 | 1 |
| **8c.8** | Client-invoice data layer + **1st enforced role gate** (send) | 8c.2, 8c.3 | 8c.7 | 1 |
| **8c.9** | Payment data layer + XOR + writer-derived `job_id` + `payment_status` + **2nd enforced gate** | 8c.7, 8c.8 | 8c.8 | 1 |
| **8c.10** | Billing-close action + **3rd enforced gate** + dual-write | 8c.3, 8c.9 | 8c.9 | 1 |
| **8c.11** | UI (job billing section, screens, merged timeline) | all above | 8c.11 | **multi** (§4) |

**Why this order:** events (8c.3) precede every emitter; NTE substrate (8c.1) precedes its job-create consumer (8c.4) and the CO/vendor NTE math (8c.6/8c.7); totals (8c.2) precede every record writer; proposals (8c.5) precede COs (8c.6, optional link); CO amounts (8c.6) precede the vendor-invoice job-level aggregate check (8c.7); both invoice sides (8c.7/8c.8) precede payments (8c.9); payments precede billing-close readiness (8c.10).

**Deviation from the user's suggested list (flagged):**
1. **No standalone "8c.10 role-enforcement substrate"** — `requireRole` already exists (§0). The three enforced gates are `requireRole("accounting")` applied **inline** in 8c.8 (client-invoice send), 8c.9 (payment record), 8c.10 (billing close). This resolves the "substrate-first vs co-ship" question the brief flagged: **co-ship**, because there is no substrate to ship. (Micro-decision 8c-D2: does `tenant_admin` also pass, or strictly `accounting` + super-admin auto-pass? — §5.)
2. **Added 8c.4 (createJob NTE integration)** — Surface 23 says the NTE *resolves at job creation and snapshots* onto `jobs.not_to_exceed_amount`, with operator override emitting `nte.overridden`. That audit needs `emitJobBillingEvent` (8c.3), so the integration **cannot** ride 8c.1; it is its own slice after 8c.3. It edits the **Phase-4 `createJob`** path — a prior-phase code touch, called out explicitly.

---

## §2 — Per-sub-batch specifications

Each: **files · named writers/resolvers/readers (signatures) · F3 errors · invariants (8a/8b refs) · hold points · commit msg.** All writers are `server-only`, tenant-scoped, txn-wrapped per §0.

### 8c.1 — NTE substrate
- **Files:** `src/server/billing/nte.ts` (new), `src/server/billing/errors.ts` (new — billing error module).
- **Writers/resolvers/readers:**
  - `resolveClientNteRule(tenantId, clientId, tradeId, priorityId, clientLocationId?) → { amount: string; currency: string; source: "location"|"client_wide"|"handyman"|"none" } | null` — the A4/A5 ladder: `(client,trade,priority,location)` → `(client,trade,priority,NULL)` → `(client, HANDYMAN trade, priority[, NULL])` → `null` (operator enters manually). **Never throws.** `HANDYMAN` resolved by `trades.code` (confirm the seed code at review — 8c-D3).
  - `activateClientNteRule({ tenantId, clientId, tradeId, priorityId, clientLocationId, id }) → void` — the `activateAgentPolicy` template verbatim (NULL-aware `clientLocationId` match).
  - `createClientNteRule(...)`, `archiveClientNteRule(...)`, `listClientNteRules(tenantId, clientId)` — admin CRUD.
- **F3 errors:** reuse the generic `SingleActiveInvariantViolated("client_nte_rules", key, n)` + `ActivationTargetMismatch("client_nte_rules", id)` (the policies.ts precedent). *(8c-D1: the 8b-named `NteRuleAlreadyActive` — define a distinct class, or accept it as `SingleActiveInvariantViolated` applied to this table? Lean: reuse the generic, note the mapping. §5.)*
- **Invariants:** **R-7.1 single-active**, data-layer write-path, **no DB unique** (8b §5; verified at 8b — only PRIMARY).
- **Holds:** pre-DB — review the ladder logic + the NULL-aware demote match + the `HANDYMAN` fallback resolution; post — scripted assertions (a 2nd activation at a key supersedes/atomically rejects; ladder picks location over client-wide over handyman; no-match returns `null`).
- **Commit:** `Phase 8: 8c.1 NTE substrate — resolveClientNteRule + activateClientNteRule (R-7.1)`
- **Construction notes (recorded at build — refinements over the pre-DB plan, all approved):**
  - `resolveClientNteRule.source` is a **4-value** enum (`location` / `client_wide` / `handyman_location` / `handyman_client_wide`), not the plan's 3 — precise provenance for the 8c.4 snapshot/audit. (Enum enrichment, not a D-lock change.)
  - The demote is **inlined** in `createClientNteRule` + `activateClientNteRule` (no shared `tx` helper) — matches the inline-in-`db.transaction` convention (`policies.ts`/`publish.ts`); shared bits are the pure `locMatch()`/`tupleKey()` helpers.
  - `activateClientNteRule` requires the target be currently **`archived`** (a `.for("update")` pre-check on the full tuple) → `ActivationTargetMismatch` if missing / wrong-tuple / already-active. This **diverges from `activateAgentPolicy`** (idempotent on an already-active target) on purpose: it makes "activate = promote an archived rule" explicit (createClientNteRule owns new-active) and satisfies the 8c.1-verify group-7c failure mode.
  - Input validation (`INVALID_NTE_AMOUNT` / `INVALID_CURRENCY`) lives in `createClientNteRule` only — `activateClientNteRule` takes no amount/currency.
  - Verify group 9c is **ladder-faithful**: a specific-location request with only a client-wide (NULL) rule for the trade resolves to `client_wide` (rung 2), proving the NULL rule misses the *location* rung but is the client-wide fallback ("falls to handyman" only with no client-wide rule for the actual trade).

### 8c.2 — Totals infrastructure
- **Files:** `src/server/billing/totals.ts` (new).
- **Functions (pure + tx writers):** `roundHalfUp(value): string` (decimal-string, 2dp, round-half-up — **not** float; use a decimal-safe approach); `computeLineExtended(quantity, unitPrice)`; `computeMarkup(extended, markupPercent)`; then the four tx writers, each recomputing line `extended_amount`/`markup_amount` then the header rollups, **in the caller's txn**:
  - `recalculateProposalTotals(tx, tenantId, proposalId)`
  - `recalculateChangeOrderTotals(tx, tenantId, changeOrderId)`
  - `recalculateVendorInvoiceTotals(tx, tenantId, vendorInvoiceId)` — **also** owns `exceeds_nte`/`nte_baseline_amount` (implemented in 8c.7, but the function lives here)
  - `recalculateClientInvoiceTotals(tx, tenantId, clientInvoiceId)`
- **Invariants:** **round-each-line-then-sum**, round-half-up; **totals are a writer-owned cache, never hand-set** (8b §6, 8a #1). AR header `total = subtotal + markup_total + tax_total`; AP `total = subtotal + tax_total` (no markup). *(8c-D4: on a client line, is `unit_price` the **cost basis** with `markup_amount` an uplift — per the #6 formula `markup = extended × pct` — confirm vs "unit_price is already the client price." Lean: cost basis + uplift. §5.)*
- **Holds:** pre-DB — review the decimal rounding approach (no float drift) + the AR-vs-AP total formula; post — **unit tests** on rounding edge cases (penny drift, half-up vs half-even) + a smoke that a multi-line invoice's stored total == hand-computed sum-of-rounded-lines.
- **Commit:** `Phase 8: 8c.2 totals infrastructure — recalculate*Totals + round-half-up (R-7.2)`

### 8c.3 — Billing events
- **Files:** `src/server/billing/events.ts` (new).
- **Functions:** `emitJobBillingEvent(tx, { tenantId, jobId, eventType, actorUserId?, summary, amount?, currency?, proposalId?, changeOrderId?, vendorInvoiceId?, clientInvoiceId?, paymentId?, metadata? }) → void` — **the single shape/taxonomy enforcement boundary** (validates `eventType` against the taxonomy const); always called **inside** the caller's txn. `listJobBillingEvents(tenantId, jobId) → BillingEvent[]` (parses `metadata`, R-6.19). Taxonomy const `BILLING_EVENT_TYPES` (the #17 list incl. `nte.exceeded`, `nte.overridden`).
- **Invariants:** **R-7.2 analog** — one enforcement boundary, distributed callers; **no double-write** to `job_events` (8a #17). Append-only.
- **Holds:** pre-DB — review the taxonomy const + the `emit` signature (does it reject an unknown `eventType`?); post — a smoke that an event row lands with correct typed refs + that `listJobBillingEvents` parses metadata.
- **Commit:** `Phase 8: 8c.3 job_billing_events — emitJobBillingEvent enforcement boundary (R-7.2)`

### 8c.4 — createJob NTE integration *(prior-phase touch — Phase-4 `createJob`)*
- **Files:** edit `src/server/jobs.ts` (`createJob`), edit the job-create action/form path (`app/(app)/jobs/new` + `actions.ts`) — UI part may defer to 8c.11; the **data-layer snapshot** lands here.
- **Logic:** in `createJob`, after the job row is known, call `resolveClientNteRule(...)`; if it returns a value, snapshot it onto `jobs.not_to_exceed_amount` (the **single writer** of that snapshot, R-7.2); if `null`, leave the operator-entered value (manual fallback, A5). If the operator **overrides** the resolved value (job-create or later dispatch), `emitJobBillingEvent(tx, { eventType: "nte.overridden", … ruleDerived vs override, level: "job", … })`.
- **F3 errors:** none new.
- **Invariants:** NTE **snapshot-not-live** at creation (8a #23, the markup/dispatch-snapshot discipline); override audited (A6).
- **Holds:** pre-DB — review the `createJob` edit (does it change existing manual-NTE behavior in a backward-compatible way? existing jobs unaffected); post — a smoke creating a job for a client with an NTE rule snapshots the resolved amount; override emits `nte.overridden`.
- **Commit:** `Phase 8: 8c.4 createJob resolves+snapshots client NTE (Surface 23) + nte.overridden audit`

### 8c.5 — Proposal data layer
- **Files:** `src/server/billing/proposals.ts` (new); add proposal errors to `billing/errors.ts`.
- **Writers/readers:** `createProposal(...)`, `updateProposalDraft(...)` (draft-only), `addProposalLineItem`/`updateProposalLineItem`/`removeProposalLineItem` (each calls `recalculateProposalTotals` in-txn), `sendProposal(...)` (`draft → sent`, sets `sent_at`, emits `proposal.sent`), `recordProposalAcceptance(...)` (operator records offline acceptance, OQ-8 → `proposal_approvals` + `sent → accepted`, emits `proposal.accepted`/`declined`), `withdrawProposal`, `createProposalRevision(...)` (new row, `parent`/`supersedes`, supersede prior → `superseded`, emits `proposal.superseded`), `getProposal`/`listProposalsForJob`.
- **F3 errors:** `ProposalNotFound` (string ok), `ProposalNotDraft` (edit/line-item ops require `draft`), `ProposalNotSent` (acceptance requires `sent`), `ProposalChainHasLiveRevision` (single-live-revision: ≥1 non-terminal in chain blocks a 2nd live revision).
- **Invariants:** **sent = immutable** (#10); **single-live-revision per chain** (8b §5, data-layer, no DB unique); proposal scope is an **independent snapshot — accepting NEVER writes `job_scope_steps`** (#9 / D-7.3, the load-bearing rule — *the writer has no path to scope tables*); totals writer-owned (8c.2).
- **Holds:** pre-DB — review the immutability gate + the single-live-revision check under lock + confirm **no import of `job_scope_steps`**; post — scripted assertions (edit-after-send rejected; revision supersedes; acceptance writes approval + leaves scope untouched).
- **Commit:** `Phase 8: 8c.5 proposal data layer — lifecycle + revision chain (#8/#9/#10)`

### 8c.6 — Change-order data layer
- **Files:** `src/server/billing/change-orders.ts` (new); CO errors to `billing/errors.ts`.
- **Writers/readers:** `createChangeOrder(...)` (job-anchored, optional `proposalId`), line-item CRUD (→ `recalculateChangeOrderTotals`), `submitChangeOrder`, `approveChangeOrder(...)` (→ `change_order_approvals` + `approved`, emits `change_order.approved`), `declineChangeOrder`, `getEffectiveNte(tenantId, jobId) → string` (**computed-on-read**: `jobs.not_to_exceed_amount` + Σ `approved` CO `total`), `listChangeOrdersForJob`.
- **F3 errors:** `ChangeOrderNotFound`, `ChangeOrderNotEditable` (line ops require `draft`).
- **Invariants:** approved CO **does NOT mutate `job_scope_steps`/`approved_scope_of_work`** (R-7.2) nor the proposal (#13); **effective NTE computed-on-read, no write to `jobs.not_to_exceed_amount`** (OQ-14, 8b §6 — *the writer has no path to that column*); CO-vs-revision boundary (forward delta, not re-quote).
- **Holds:** pre-DB — review `getEffectiveNte` (sums only `approved`) + confirm no scope/NTE-column writes; post — assertions (approved CO raises effective NTE on read; base column unchanged).
- **Commit:** `Phase 8: 8c.6 change-order data layer + effective-NTE computed-on-read (#12/#13)`

### 8c.7 — Vendor-invoice data layer (AP)
- **Files:** `src/server/billing/vendor-invoices.ts` (new); implement the `exceeds_nte` arm of `recalculateVendorInvoiceTotals` in `totals.ts`; vendor-invoice errors.
- **Writers/readers:** `recordVendorInvoice(...)` (status `received`, `source_type='manual'`, optional `assignmentId`), line CRUD (→ `recalculateVendorInvoiceTotals`), `approveVendorInvoice(...)` (**operator** validates the amount — `received|under_review → approved`, sets `approved_by_user_id`, emits `vendor_invoice.approved`; OQ-24), `disputeVendorInvoice`, `getJobMargin(tenantId, jobId)` (simple per-job Σclient − Σvendor, #15/OQ-16 — may live in a shared reader), `listVendorInvoicesForJob`.
- **`exceeds_nte` writer (8b §6 pressure-test):** inside `recalculateVendorInvoiceTotals`, **after** totals, **same txn** — resolve the governing baseline (`assignment.agreed_nte_amount` when `assignment_id` set, else `jobs.not_to_exceed_amount`; OQ-20), snapshot into `nte_baseline_amount`, set `exceeds_nte`, and on a crossing emit `nte.exceeded`. **Multi-dispatch job-level aggregate** check (Σ vendor totals vs `getEffectiveNte`) computed-on-read, emitting `nte.exceeded` independently (8b §3/§18). Exceedance **flags, never hard-blocks** approval (OQ-20).
- **F3 errors:** `VendorInvoiceNotFound`, `VendorInvoiceNotApprovable` (status guard).
- **Invariants:** AP carries **no markup** (#6); exceedance flag + baseline snapshot (#18); approval is **operator**-gated, not accounting (OQ-24 — *no `requireRole` here*).
- **Holds:** pre-DB — review the baseline-resolution branch (assignment vs job) + the same-txn ordering (totals → baseline → flag → event); post — assertions (over-NTE invoice flags + emits but still approvable; per-dispatch vs job-level both fire).
- **Commit:** `Phase 8: 8c.7 vendor-invoice data layer + NTE exceedance flag (#3/#18)`

### 8c.8 — Client-invoice data layer (AR) — **1st enforced role gate**
- **Files:** `src/server/billing/client-invoices.ts` (new); client-invoice errors; action in `app/(app)/jobs/billing-actions.ts` (or invoice-actions).
- **Writers/readers:** `createClientInvoice(...)` (snapshots `payment_terms_days` from `client_billing_rules`, #6), line CRUD (→ `recalculateClientInvoiceTotals`, markup defaulted from the resolved `is_default` rule with the **deterministic tie-break** earliest `created_at` then lowest `id`, 8b §6), `sendClientInvoice(...)` (`draft → sent`, sets `issued_at`/`issued_by_user_id`, emits `client_invoice.sent`), `voidClientInvoice`, `listClientInvoicesForJob`.
- **Enforced gate (the platform's FIRST):** the **send/issue** action calls **`requireRole("accounting")`** before `sendClientInvoice` (super_admin auto-passes; 8c-D2 re `tenant_admin`). Authoring (`create`/line edits) stays `requireTenant` (either role).
- **F3 errors:** `ClientInvoiceNotFound`, `ClientInvoiceNotDraft` (send requires `draft`).
- **Invariants:** markup **internal-only** (OQ-6 — render concern, flagged for Phase 11); payment-terms **snapshot** (#6); first enforced gate (#20/OQ-23).
- **Holds:** pre-DB — review the markup-default snapshot + the deterministic tie-break query + the `requireRole` placement (action layer, not data layer); post — assertions (non-accounting send → `/forbidden`; accounting send issues; markup snapshotted at creation, not re-read).
- **Commit:** `Phase 8: 8c.8 client-invoice data layer + first enforced accounting gate (#3/#6/#20)`

### 8c.9 — Payment data layer — **2nd enforced gate**
- **Files:** `src/server/billing/payments.ts` (new); payment errors; payment action.
- **Writers/readers:** `recordPayment({ tenantId, direction, clientInvoiceId?|vendorInvoiceId?, amount, currency, method?, reference?, paidAt, recordedByUserId }) → ...` — **derives `job_id` from the resolved invoice** (8b-D5: **never** a caller param), asserts the **XOR** (exactly one invoice FK set, matching `direction`), recomputes the target invoice's `payment_status` from Σ payments (#16), emits `payment.recorded`. `listPaymentsForInvoice`/`listPaymentsForJob`.
- **Enforced gate:** `requireRole("accounting")` on the record-payment action (the ledger control point).
- **F3 errors:** `PaymentDirectionMismatch` (XOR / direction↔FK violation), `InvoiceNotFound`.
- **Invariants:** **XOR + writer-derived `job_id`** (8b §5/§6); **payment_status derived** (never hand-set, #16); one-payment-one-invoice, partial allowed, allocation deferred (OQ-17); 2nd enforced gate.
- **Holds:** pre-DB — review the XOR assertion + the `job_id` derivation (rejects a caller-passed `job_id`) + the payment_status recompute; post — assertions (mismatched direction/FK → `PaymentDirectionMismatch`; partial payment → `partially_paid`; full → `paid`).
- **Commit:** `Phase 8: 8c.9 payment data layer — XOR + writer-derived job_id + payment_status (#16)`

### 8c.10 — Billing-close action — **3rd enforced gate**
- **Files:** `src/server/billing/close.ts` (new); close action.
- **Writers:** `markBillingClosed({ tenantId, jobId, actorUserId }) → void` — **dual-write** in one txn (parent-before-child): transition `jobs.current_status_id → CLOSED_BILLED` + write `jobs.closed_at` + `job_status_history` row + `job_events` (operational) + `emitJobBillingEvent("…")` (financial) + `auditLogs`. **Explicit** human action (no auto-close, OQ-25). May surface a "ready to close" signal (all client invoices `paid`) but does not require it as a hard gate (operator discretion).
- **Enforced gate:** `requireRole("accounting")`.
- **F3 errors:** `JobAlreadyBillingClosed` (idempotency guard under lock).
- **Invariants:** billing **parallel** to operational status; **explicit** transition through the established dual-write (R-5.8, §2.9); `CLOSED_BILLED` distinct from operational `CLOSED` (OQ-26; both seeded — 8b-D3).
- **Holds:** pre-DB — review the dual-write (status_history + both event tables + audit) + the explicit-transition posture + the readiness *signal* (not a hard block); post — assertions (close writes all rows; re-close blocked; status == `CLOSED_BILLED`).
- **Commit:** `Phase 8: 8c.10 billing-close action — 3rd enforced gate + dual-write (#21)`

### 8c.11 — UI (multi-commit; sub-sequenced in §4)
- **Files:** `app/(app)/jobs/[id]/page.tsx` (job billing section), new components under `src/components/billing/`, `app/(app)/jobs/billing-actions.ts` (+ split), an NTE-rules admin screen.
- **Invariants surfaced:** unified merged timeline (OQ-19 — merge `listJobEvents` + `listJobBillingEvents`); markup **never rendered** to client (OQ-6, internal-only); NTE-exceedance flag display (#18); the three enforced actions gated in UI + action layer.

---

## §3 — Pre-DB / post-apply review pattern (every DB-touching sub-batch)

Mirrors 7c's gate-by-gate rhythm.
- **Pre-DB review (before the writer is applied):** the **planned function signatures**; the **invariant logic** in prose (what each guard checks, what each throws); the **transaction boundaries + lock order** (which rows `.for("update")`, in what order, re-checked under lock); the **error taxonomy** (which named error per failure mode); confirmation that **no writer reaches a forbidden substrate** (proposals/COs must not import `job_scope_steps`; CO/payment must not write `jobs.not_to_exceed_amount`).
- **Post-apply verify review (after):** **scripted assertion count** (the Phase-7 "N/N" style) run via an ephemeral `scripts/` script (deleted before commit, results into the commit message); **audit-trail outputs** (the `job_billing_events` + `audit_logs` rows the action produced); **EXPLAIN** on the hot reads — the `resolveClientNteRule` ladder (uses `cnr_resolve_idx`), the per-job aggregate (`getEffectiveNte`, `getJobMargin` by `job_id`), the merged-timeline reads.
- **Connection-cap discipline:** stop `next dev` before any DB-touching verify; ephemeral scripts run with `--env-file=.env.local` (and `--conditions=react-server` if they import server-only app modules).

---

## §4 — UI sub-batching (8c.11 — multiple commits)

| UI slice | Scope | Depends on | Commit |
|---|---|---|---|
| **8c.11a** | Job **billing section shell** — read-only summary (proposals/COs/vendor+client invoices/payments lists, per-job margin, effective NTE, exceedance flags) + **unified merged timeline** (OQ-19) | all data-layer readers | `8c.11a billing section (read-only) + merged timeline` |
| **8c.11b** | **Proposal** screens — draft editor (line items), send, record-acceptance, revision | 8c.5 | `8c.11b proposal screens` |
| **8c.11c** | **Change-order** screens — create/edit, submit, approve | 8c.6 | `8c.11c change-order screens` |
| **8c.11d** | **Invoice** screens — vendor (record/approve) + client (create/line editor/**send=accounting**) | 8c.7/8c.8 | `8c.11d invoice screens` |
| **8c.11e** | **Payment** recording (accounting) + **billing-close** (accounting) + **NTE-rules admin** + job-create NTE-override surfacing | 8c.9/8c.10/8c.1/8c.4 | `8c.11e payments, close, NTE admin` |

Rationale: the **read-only shell first** (proves the readers + timeline before any write UI); then write screens **per record type in data-layer order**; the enforced-gate actions (client-invoice send, payment, close) land last with the NTE admin.

---

## §5 — Decisions LOCKED at 8c-plan approval (was: deferred to sub-batch review)

All six are now **LOCKED** (operator approval of the 8c plan). Recorded here as the durable trail.

- **8c-D1 — LOCKED: reuse the generic single-active errors.** The NTE activate/create path throws `SingleActiveInvariantViolated("client_nte_rules", key, n)` + `ActivationTargetMismatch("client_nte_rules", id)` (the `policies.ts` precedent); 8b's named `NteRuleAlreadyActive` *is* that invariant applied to this table — no distinct class. `src/server/billing/errors.ts` **re-exports** them (billing code imports from `billing/errors`, not reaching into `agents/config`).
- **8c-D2 — LOCKED: `requireRole("accounting")` only** (super_admin auto-passes) for the three money-commitment actions (8c.8 send / 8c.9 payment / 8c.10 close). `tenant_admin` does NOT pass.
- **8c-D3 — LOCKED + CORRECTED: handyman fallback resolves by `trades.code = 'HANDY'`.** The live seed has `{ name: "General Handyman", code: "HANDY" }` — **NOT `HANDYMAN`**, as 8a/8b/8c loosely wrote. The resolver keys on `'HANDY'`, so the handyman tier is **live** (a `client_nte_rules` row authored against the HANDY trade is reachable). `trades` is **global reference data** (no `tenant_id`) — the code lookup is unscoped by tenant.
- **8c-D4 — LOCKED: client-line `unit_price` is the cost basis; `markup_amount` is an uplift** (`markup = round(extended × markup_percent / 100)`); AR header `total = subtotal + markup_total + tax_total`.
- **8c-D5 — LOCKED: `src/server/billing/` subdir** is the billing data-layer home (created in 8c.1 Turn 2 with the first files).
- **8c-D6 — LOCKED: soft "ready to close" signal** (all client invoices `paid` ⇒ a UI hint), **not** a hard precondition on `markBillingClosed` (OQ-25 explicit-close).

### 8c.2 sub-batch locks + construction notes (recorded at build)

- **9a — LOCKED: `big.js` + `@types/big.js`** (MIT, money-purpose, server-only; bundle size moot). Decimal-string arithmetic; round-half-up.
- **9b — LOCKED: `tax_amount` validation lives at the line-CRUD write boundary (8c.5+), not in recalc.** `recalculate*Totals` trusts stored line values and only sums.
- **9c — LOCKED: the `exceeds_nte` / `nte_baseline_amount` arm of `recalculateVendorInvoiceTotals` is deferred to 8c.7.** 8c.2 ships the totals body only; 8c.7 grafts the NTE arm on (after totals, same txn).
- **Coding rules established (for `02-decisions.md` at closeout):**
  1. **Explicit-mode rounding** — every `Big.round()` passes `Big.roundHalfUp` (via the `HALF_UP` constant / `roundHalfUp` helper); **never rely on the mutable `Big.RM` global** (another module could flip it to banker's). Do not "DRY" the mode away.
  2. **Markup operation order** — `(extended × pct) / 100` (multiply *before* divide; the product is exact, the single division comes last where round-to-2 absorbs it). Do not rewrite as `extended × (pct/100)`.
  3. **Line-CRUD concurrency contract (8c.5+)** — callers that edit lines + recalc MUST hold the **parent row `FOR UPDATE`** for the edit+recalc (serializing per-record recalcs). `recalculate*Totals` itself is lock-free and converges (the line rows are the source of truth).
- **Construction note:** AR vs AP math factored into pure `computeArLines` / `computeApLines` (operate on plain arrays); the Drizzle SELECT/UPDATE stays per-writer (type-safe); line UPDATEs are tenant-scoped (`WHERE id AND tenantId`).

### 8c.3 sub-batch locks + construction notes (recorded at build)

- **9a — LOCKED: `BILLING_EVENT_TYPES` = `const` array `as const`** (→ string-literal union) + a runtime `Set` for O(1) membership.
- **9b — LOCKED: 0-to-many record refs per event, NO XOR.** `payment.recorded` sets 2 (payment + paid invoice); job-level events (`nte.overridden`, `billing.closed`) set 0. The per-type ref convention is documented in an `events.ts` header comment.
- **9c — LOCKED: generic `Error`** on all validation failures (`INVALID_BILLING_EVENT_{TYPE,SUMMARY,AMOUNT,CURRENCY}`) — programmer errors; internal-only writer.
- **9d — LOCKED: merged-timeline reader deferred to 8c.11a (UI).** Data layer ships two separate listers (`listJobEvents` Phase 4 + `listJobBillingEvents` here); the UI merges/sorts (OQ-19).
- **9e — LOCKED: 21-type taxonomy.** Includes `billing.closed`, `vendor_invoice.paid`, `change_order.submitted`, `change_order.withdrawn`, `client_invoice.voided`; **`change_order.created` dropped** (Catch 1 — first CO emit is `change_order.submitted`, matching the proposal "first emit at send" pattern; drafts are operationally transient).
- **9f — LOCKED: trust-caller on `job∈tenant`** (no per-emit read; the FK guarantees the job exists).
- **Construction notes (for `02-decisions.md` at closeout):**
  1. **`events.ts` is a leaf module** — imported BY the record modules (8c.4–8c.10); imports none of them (no `nte`/`totals`/record-module imports). The amount validator is inlined to preserve this.
  2. **Metadata serialization** — `emitJobBillingEvent` passes the **object** to `.values()` and lets Drizzle `json()` serialize; the reader **defensive-parses** on read (`typeof === "string" ? JSON.parse : raw`, R-6.19). This codifies the established pattern from a 20+-site inspection (every metadata write passes an object; zero `JSON.stringify`), not a re-invention.
  3. **Summary trim-before-store** (Catch 2): trim, then validate the *trimmed* length, then store the *trimmed* value.
  4. **Append-only** is enforced by the **absence of mutators** (only `emit` + `list` exported) + the table's missing `updated_at` — verified structurally (Object.keys export check).
  5. **Reader order** `created_at ASC, id ASC` — the `uuidv7` `id` is the deterministic within-second tie-break.

### 8c.4 sub-batch locks + construction notes (recorded at build)

- **9a — LOCKED: no `Big` in `jobs.ts`.** The action canonicalizes the operator NTE to `"d.dd"` (`canonicalizeNte`: shape + strip-leading-zeros + pad + `>0` + ≤10-int-digit overflow); `createJob` compares it to `resolvedNte.amount` (a DB `decimal(12,2)`) with plain `===`. `jobs.ts` does no money arithmetic, so it stays free of a money lib — trust-at-boundary, the 8c.3-9f precedent.
- **9b — LOCKED: action-layer NTE validation/canonicalization** at the boundary (invalid → `{ error }` before `createJob`).
- **9c — LOCKED: 5-case override matrix.** Override = **Case C only** (a rule resolved AND the operator value differs). Case A (rule, no operator) and Case B (operator == resolved, incl. pre-fill acceptance) **snapshot silently — no audit event**. Cases D/E (no rule) are the A5 manual-fallback path — nothing to override.
- **9d — LOCKED: form passes operator value only**; `createJob` re-resolves + compares (no hidden field / no flag).
- **9e — LOCKED: `jobs → billing` dependency direction** (one-way, acyclic). **The first Phase-4 → Phase-8 import**, established here because Surface 23 makes `createJob` the **sole writer of `jobs.not_to_exceed_amount`** (R-7.2 for that column), so resolution + override-emit must live inside `createJob`'s txn for atomicity. *(For `02-decisions.md`: "Phase-4 `createJob` became the sole writer of `jobs.not_to_exceed_amount` as of 8c.4; this required Phase-4 to depend on Phase-8 billing modules, jobs → billing only.")*
- **9f — LOCKED: resolution gated on both `primaryTradeId` AND `priorityId`** present (the resolver needs the full key); else skip → operator value or NULL.
- **9g — LOCKED: UI NTE field + pre-fill deferred to 8c.11e.** `createJob` + the action accept an optional `notToExceedAmount`; the form not sending it yet is the forward-compat path (Case A/E).
- **Construction notes:** `nte.overridden` is **job-level** (no record refs); `metadata.ruleSource` (NOT `source` — `jobs.source_type` already exists, Catch 2); `currency = resolvedNte.currency` (same-currency MVP, Catch 3 → CF-8c.4.1); summary format `Job NTE overridden: <ruleAmount> (rule) → <overrideAmount>`. `createJob`'s existing 7-step txn is unchanged except the added `not_to_exceed_amount` column + an appended step-8 override emit; `job.created` (job_events + audit_logs) still fires alongside.

### 8c.5 sub-batch locks + construction notes (recorded at build)

- **10a — LOCKED: chain root = `parent_proposal_id IS NULL`** (revisions point at root; chain query `parent_proposal_id = root OR id = root`).
- **10b — LOCKED: root `revision_number = 1`; revisions = `max(chain) + 1`.**
- **10c — LOCKED: revision copies the prior's line items** (re-quote intent; extended/markup recomputed).
- **10d — LOCKED: revision copies header** (`scope_snapshot`, `title`, `currency`, `validUntil`, `notes`); **0-live re-open supported** (revise a `declined`/`withdrawn` proposal → new `draft`; the terminal prior is **not** flipped and emits **no** `proposal.superseded`).
- **10e — LOCKED: `lineNumber` auto-assigned `max + 1`** under the parent lock; no caller param (reorder deferred).
- **10f — LOCKED: validators inlined** in `proposals.ts`; a shared `billing/money.ts` is deferred until 3–4 modules duplicate.
- **10h — LOCKED: `sendProposal` twice → `ProposalNotDraft`** (under-lock re-check; no silent no-op).
- **10i — LOCKED: event summary formats** (§6 table).
- **Construction notes (for `02-decisions.md` at closeout):**
  1. **`billing/errors.ts` evolved from re-export shim → MIXED module** (re-exports `SingleActiveInvariantViolated`/`ActivationTargetMismatch` for NTE **+** defines the 4 proposal F3 classes).
  2. **4 F3 classes** (exact names + stable ctor signatures): `ProposalNotDraft(id, status)`, `ProposalNotSent(id, status)`, `ProposalNotWithdrawable(id, status)`, `ProposalChainHasLiveRevision(rootId, liveCount)`.
  3. **Chain-revision serialization = lock the chain ROOT row `FOR UPDATE`** (per-chain mutex); live-count + supersedes-target precondition covers both the 1-live (flip prior → superseded) and 0-live re-open (no flip) cases.
  4. **`accepted`-not-withdrawable reconciliation** (Turn-3): `LIVE_STATUSES` = {draft,sent,viewed,accepted} (revision-chain slot — an accepted proposal can be superseded), but **`WITHDRAWABLE_STATUSES` = {draft,sent,viewed}** — an `accepted` proposal is a **commitment** (revise/change-order, never withdraw → `ProposalNotWithdrawable`). This refined the Turn-1 plan (which had listed `accepted` as withdrawable) to match the Turn-3 test/intent.
  5. **Module-graph isolation = the D-7.3 enforcement.** `proposals.ts` imports **no** scope-substrate / jobs-data-layer / publish-writer; the forbidden symbol names appear **nowhere** in the file (descriptive comments), verified by a **whole-file string-match grep** (verify Group 13) — guards against a future "sync-the-scope" import regression. `recordProposalAcceptance` empirically leaves `job_scope_steps` row count unchanged (verify Group 6).

### 8c.6 sub-batch locks + construction notes (recorded at build)

- **11a — LOCKED: `getEffectiveNte` returns `null` when the base (`jobs.notToExceedAmount`) is null** — honest "no base ⇒ no effective NTE"; 8c.7 skips the job-level aggregate exceedance check on `null` (rather than treat it as `0.00`).
- **11b — LOCKED: CO events set the `proposalId` ref when the CO is linked** (multi-ref correlates the timeline; the ref column, not metadata — Catch 2).
- **11c — LOCKED: separate `approveChangeOrder` + `declineChangeOrder`** (operator-decision; not the unified `recordProposalAcceptance` client-decision shape).
- **11d — LOCKED: read `total` directly** (no `getCoTotal` helper).
- **11e — LOCKED: `approveChangeOrder` does NOT check the linked proposal's state** (the `proposalId` link is informational; no cross-substrate coupling).
- **11f — LOCKED: writer maps approve → `{status:"approved", decision:"accepted"}`** — the `change_order_approvals.decision` enum is the shared `{accepted,declined}` from 8b (→ CF-8c.6.1); no schema change.
- **Construction notes (for `02-decisions.md` at closeout):**
  1. **Two structural guarantees** (both empirically + structurally verified): D-7.3 (no published-scope-substrate touch) **and** the 8c.4 sole-writer (no write to the job's NTE column). Verify Group 9 confirmed `approveChangeOrder` leaves `jobs.not_to_exceed_amount` row-value **and** `job_scope_steps` count unchanged; Group 10 string-matches the file for 8 forbidden tokens (the 6 scope/jobs tokens **+ `.update(jobs)` / `tx.update(jobs)`**).
  2. **First record-module use of `big.js`** — `getEffectiveNte` sums base + Σ approved CO totals via `Big`, reusing **`roundHalfUp` from `totals.ts`** (explicit-mode discipline preserved, not re-invented).
  3. **`getEffectiveNte` is computed-on-read** (OQ-14): only `status='approved'` COs counted; the base column is never mutated.
  4. **`reasonPreview`** truncates the unbounded `reason` to 80 chars + `…` for the `varchar(500)` event summary; the full reason stays in `change_orders.reason`.
  5. **Second line-validator duplication** (after `proposals.ts`); the shared `billing/money.ts` extraction decision is deferred to **8c.7's pre-DB review** (extract if 8c.7's validators are substantially identical; keep inline + re-evaluate at 8c.8 if vendor-invoice validation differs materially).

### 8c.7 sub-batch locks + construction notes (recorded at build)

Vendor-invoice data layer (AP, #6/#18). The second production AP/AR writer module after change-orders; `recordVendorInvoice` / line CRUD / `approveVendorInvoice` / `disputeVendorInvoice` + readers. Verify: **85/85** assertions passed.

- **Decision 1 — LOCKED: `nte.exceeded` is approve-only (column-vs-event split).** `recalculateVendorInvoiceTotals` sets the `exceeds_nte` **column** on record + every line edit (the row is always truthful), but the `nte.exceeded` **event** fires only at `approveVendorInvoice` — the operator's commit-to-pay. A `received` invoice is unvetted inbound data; firing the breach alarm on raw receipt is false-alarm noise.
- **Decision 2 — LOCKED: `approveVendorInvoice` `FOR UPDATE`-locks the parent job row** so the job-aggregate first-crossing is detected exactly once under concurrency. **Lock order: invoice row first, then parent job row** — any future writer (8c.8/9/10) taking both must use this order (deadlock prevention); no current writer takes both.
- **Decision 3 — LOCKED: `billing/money.ts` extracted (Option A).** One definition of `isDecimalStr` + `assertCommonLineFields` (the four shared fields: quantity/unit_price/tax_amount/tax_rate). `proposals.ts` + `change-orders.ts` were **refactored in this same commit** to consume it (their local `isDecimalStr` + the four shared checks deleted; `markup_percent` stays inline in the AR modules). Verify Group 9 proved behavior byte-identical — success **and** failure cases, the `INVALID_LINE_*` strings asserted verbatim (the error string is the contract).
- **Decision 4 — LOCKED: `getJobMargin` deferred to 8c.8** (margin needs the AR side = client invoices). 8c.7 ships only `sumApprovedVendorInvoiceTotals` (the AP cost half) → CF-8c.7.1.
- **Decision 5 — LOCKED: no `startVendorInvoiceReview` writer in 8c.7.** `under_review` is reachable in the schema enum + accepted by the edit/approve/dispute guards (forward-compat), but no 8c.7 writer transitions into it; document in `10-known-limitations.md` at closeout.
- **Decision 6 — LOCKED: `billing/money.ts` is a pure util (no `server-only`)** — regex shape-validation with no DB/env/IO; reusable from any layer.
- **Construction notes (for `02-decisions.md` at closeout):**
  1. **Parameter-passing for `governingNte`.** The AP writer resolves the governing ceiling (the dispatch's `agreed_nte_amount` when an assignment is linked, else the job's effective NTE via `getEffectiveNte`) and **passes it into** `recalculateVendorInvoiceTotals(tx, …, governingNte)`. This keeps `totals.ts` **cycle-free** (it never imports the effective-NTE reader's module → no `totals ↔ change-orders` cycle) and **event-free** (the calling writer emits the breach event). The `exceeds_nte`/`nte_baseline_amount` columns fold into the existing totals `.set` (one UPDATE).
  2. **Two independent NTE ceilings, two events** (both approve-only): per-invoice (`level="dispatch"`|`"job"`, this invoice vs its governing ceiling) and job-aggregate (`level="job_aggregate"`, Σ approved AP totals vs the job's effective NTE, first-crossing only — emitted on the `prior ≤ NTE → new > NTE` step, never re-emitted once over). `getEffectiveNte === null` (no base, 11a) skips the aggregate check entirely.
  3. **`metadata.assignmentId` explicit-null convention** — always present on the per-invoice `nte.exceeded` event: the assignment id for `level="dispatch"`, explicit `null` for `level="job"`. Readers test `=== null`.
  4. **Defensive re-resolution.** Line CRUD **and** approve re-resolve `governingNte` before each `recalc` (never cache from `record`), so `exceeds_nte` stays truthful if an underlying NTE source moves (e.g., a CO approved between record and approve shifts the job's effective NTE). Approve's recalc is idempotent on the money columns (no line change).
  5. **Four structural guarantees** (verified Groups 8 + 10, empirically + by string-match): **D-7.3** (no published-scope-substrate touch), **8c.4 sole-writer** (no write to `jobs.not_to_exceed_amount`), **Phase-5 dispatch-snapshot immutability** (no write to `job_vendor_assignments.agreed_nte_amount` — AP only reads it), and **`totals.ts` cycle-freedom** (post-arm, `totals.ts` string-matches clean for `emitJobBillingEvent` / `billing/events` / `change-orders` / `getEffectiveNte`). New 8c.7 forbidden tokens for `vendor-invoices.ts`: `.update(jobVendorAssignments)` / `tx.update(jobVendorAssignments)`.

### 8c.8 sub-batch locks + construction notes (recorded at build)

Client-invoice data layer (AR, #6/#16/#20) + the platform's **first enforced role gate**. `createClientInvoice` / line CRUD / `sendClientInvoice` / `voidClientInvoice` + readers + `sumApprovedClientInvoiceTotals`; new `margin.ts` (`getJobMargin`); new `role-gates.ts` (the gate predicate); new `billing-actions.ts` (the action). Verify: **86/86** assertions passed.

- **Decision 1 — LOCKED: markup snapshot three-way semantic.** `addClientInvoiceLineItem`: `markupPercent` **omitted (undefined)** → snapshot the default billing rule's markup at creation; **`null`** → explicit "no markup" (stays null → `computeMarkup` treats as 0); **`"d.ddd"`** → operator override. `updateClientInvoiceLineItem` with `markupPercent` **absent from the input leaves the existing value unchanged** (no re-snapshot) — snapshot-at-creation, not live (8c-D4 / 8a #6).
- **Decision 2 — LOCKED: Option 2 (pure predicate).** No test framework exists on the platform (no runner, no `*.test.ts` — see CF-8c.8.3), so the gate policy is extracted into the pure, testable predicate `isAccountingRole(roleKeys, isSuperAdmin)` in `billing/role-gates.ts`. The action (`billing-actions.ts`) is the **live enforcement** (`requireTenant()` + `isAccountingRole(...)` → `redirect("/forbidden")`); the data-layer `sendClientInvoice` has **no** role check (trust-at-boundary). The verify exercises the predicate directly (8-case truth table) + structurally confirms the gate placement. **"The tested code IS the live code."**
- **Two coexisting role-check patterns** (for `02-decisions`): **(1)** `requireRole(role)` directly in actions for simple gates; **(2)** `requireTenant()` + an extracted pure predicate for gates where the policy benefits from independent unit-testing. Choice driven by simple-enough-to-trust-`requireRole` vs complex-enough-to-extract. 8c.8 establishes pattern (2) (and is the first action-layer role enforcement on the platform — `requireRole` had zero call sites before).
- **Decision 3 — LOCKED: `getJobMargin` → `{ revenue, cost, margin }`** structured, always-string, `"0.00"` everywhere for no activity.
- **Decision 4 — LOCKED: AR revenue = `status='sent'` only.** There is no `paid` *status* on client invoices (only the orthogonal `paymentStatus`); a paid invoice is still `status='sent'`. Draft + void excluded. `paymentStatus` does not affect revenue recognition (record in `06-business-rules`).
- **Decision 5 — LOCKED: `getJobMargin` in new `billing/margin.ts`** — the **sole** AR↔AP meeting point. `client-invoices.ts` and `vendor-invoices.ts` never import each other; `margin.ts` imports both aggregators (verified Group 16).
- **Decision 6 — LOCKED: three separate F3 classes** — `ClientInvoiceNotEditable` (line CRUD on non-draft), `ClientInvoiceNotSendable` (send on non-draft), `ClientInvoiceNotVoidable` (void on non-sent).
- **Decision 7 — LOCKED: `client_invoice.created` emitted on create** (in the 21-type taxonomy; the deliberate AR/AP asymmetry — the dropped `vendor_invoice.created` from 8c.3 — because the AR document's *authoring* is a meaningful operator state, vs AP's *receipt*). Metadata: `{ paymentTermsDays, sequenceNumber, isFinal }` (stable shape).
- **Decision 8 — LOCKED: `resolveClientMarkupDefault` exported** for 8c.11d UI pre-fill (operator sees the default; may override).
- **Decision 9 — LOCKED: void requires `status='sent'`.** Drafts can't be voided (or deleted — no header-delete writer in Phase 8 → CF-8c.8.2). **Catch 1:** `voidClientInvoice` does **not** check `payment_status` — voiding an invoice with received payment is allowed; reconciliation/refund is the operator's responsibility (`06-business-rules`).
- **Construction notes (for `02-decisions.md`):**
  1. **Payment-terms + markup snapshots** both resolve the same `defaultBillingRule(tenant, client)` — `is_default=true AND status='active'`, deterministic tie-break **`ORDER BY created_at ASC, id ASC`** (8b §6, no DB unique on `is_default`). Header snapshots `payment_terms_days` at create; lines snapshot `markup_percent` at create.
  2. **AR totals reuse `recalculateClientInvoiceTotals` (8c.2, untouched)** — cost-basis + uplift: `extended = round(qty × unit_price)`, `markup = round((extended × pct)/100)`, header `total = subtotal + markup_total + tax_total`. No 8c.7-style arm (AR has no NTE).
  3. **Module-graph (verified Group 16):** `client-invoices.ts` imports none of the scope substrate, `@/server/jobs`, the sibling billing data layers, or auth; `role-gates.ts` is a pure leaf (no `server-only`/db/schema/auth); the gate is action-layer-only.

### 8c.9 sub-batch locks + construction notes (recorded at build)

Payment data layer (#16) — the convergence sub-batch tying AP + AR payment flows through one `payment_records` table with a `direction` discriminator. `recordPayment` + readers; `recordPaymentAction` (gate #2). Verify: **79/79** assertions passed.

- **Decision 1 — LOCKED: direction mapping** `inbound ↔ clientInvoiceId` (AR, money in), `outbound ↔ vendorInvoiceId` (AP, money out) — resolved by schema inspection (the enum is `["inbound","outbound"]`).
- **Decision 2 — LOCKED: `amount > 0`** required; zero/negative/bad-shape → `PaymentAmountInvalid`.
- **Decision 3 — LOCKED: overpayment allowed** (`Σ > total` → `paid`, no throw) → CF-8c.9.1.
- **Decision 4 — LOCKED: payable preconditions** — vendor invoice `status='approved'`, client invoice `status='sent'`; else `PaymentInvoiceNotPayable`.
- **Decision 5 — LOCKED: payment on already-paid invoice allowed** — the precondition is `invoice.status` (approved/sent), NOT `payment_status` (the overpayment path).
- **Decision 6 — LOCKED: `PaymentAmountInvalid` as F3** (payment-error-family parity).
- **Decision 7 — LOCKED: paid-event crossing semantic** — emit `vendor_invoice.paid`/`client_invoice.paid` iff `oldPaymentStatus !== "paid" && newPaymentStatus === "paid"` (first reach only); `payment.recorded` always fires.
- **Decision 8 — LOCKED: `payments.ts` is the sole post-creation writer of `payment_status`** on both invoice tables; AR↔AP non-coupling preserved via single-sided direction branches.
- **Decision 9 — LOCKED: `recordPaymentAction` (gate #2) reuses `isAccountingRole`** (validates the 8c.8 predicate extraction).
- **Construction notes (for `02-decisions.md`):**
  1. **XOR invoice-ref invariant** (D-7.7) — exactly one of `(vendorInvoiceId, clientInvoiceId)` set, agreeing with direction; validated before the txn (no DB CHECK). `PaymentInvoiceRefInvalid` / `PaymentDirectionMismatch`.
  2. **Writer-derived `job_id` via TYPE-ABSENCE** — `RecordPaymentInput` has **no `jobId` field**, so the compiler forbids forwarding it; `recordPayment` reads `job_id` off the locked invoice. The strongest form of the 8c.4 sole-writer discipline (compiler-enforced, not just runtime-guarded). The action's `jobId` is used only for `revalidatePath` (Catch 3).
  3. **Direction-discriminated single-sided writer** — two **disjoint** branch functions (`applyOutboundPayment` touches `vendor_invoices` only; `applyInboundPayment` touches `client_invoices` only); `recordPayment` dispatches to exactly one. The duplication of the payment insert + `payment.recorded` emit is **intentional**, motivated by structural (grep-provable, per-function) provability of AR↔AP non-coupling — verified by `.update(vendorInvoices)`/`.update(clientInvoices)` each appearing exactly once, in disjoint functions (Group 14), and the `payment.recorded` shape being identical across directions (Group 15 drift guard). `margin.ts` remains the sole AR↔AP meeting point.
  4. **`payment_status` sole-writer** — `payments.ts` owns every `unpaid → partially_paid → paid` transition; the invoice writers never touch `payment_status` post-creation (created at the DB default `'unpaid'`; verified Group 13 — zero `paymentStatus` references in either invoice module).
  5. **Single-invoice paid-crossing** — simpler than the 8c.7 job-aggregate: the invoice-row `FOR UPDATE` (lock order: invoice only — a subset of approve's invoice→job, so no deadlock partner) serializes concurrent payments; the Σ query runs after the insert so it counts the new row (Catch 2).
  6. **Currency snapshots from the invoice** when `input.currency` is omitted (`?? inv.currency`) — the payment currency matches the invoice it pays (same-currency MVP); explicit `input.currency` still wins (Deviation 3).

### 8c.10 sub-batch locks + construction notes (recorded at build) — **CLOSES THE 8c DATA LAYER**

Billing-close data layer (#20/#21) — the **first billing writer into the operational job lifecycle**, and the **last data-layer sub-batch** (8c.1–8c.10 complete; only 8c.11 UI remains). `markBillingClosed` + `getBillingCloseReadiness`; `markBillingClosedAction` (gate #3). Verify: **64/64** assertions passed.

- **Decision 1 — LOCKED: replicate the status-transition dual-write INLINE** via schema imports — no `@/server/jobs` import. Settled by inspection: the existing pattern (`createJob`) is logic-free inserts (no transition matrix), so there is nothing to drift; replicating inline preserves billing's module-graph isolation.
- **Decision 2 — LOCKED: billing close is independent of operational status** — transitions to `CLOSED_BILLED` from ANY status; the only guard is already-`CLOSED_BILLED` (`JobAlreadyBillingClosed` idempotency). Per the seed's authoritative "operational close and billing close are independent" (OQ-26).
- **Decision 3 — LOCKED: `closed_at = COALESCE(existing, now())`** — first-close-wins; preserves an earlier operational-close timestamp.
- **Decision 4 — LOCKED: soft readiness signal** — `getBillingCloseReadiness` returns `{ ready, concerns }` with **7 advisory concern types** (`unpaid_approved_vendor_invoices`, `unpaid_sent_client_invoices`, `unresolved_vendor_invoices`, `disputed_vendor_invoices`, `draft_client_invoices`, `open_proposals`, `open_change_orders`); `ready = concerns.length === 0`; **advisory-only** — `markBillingClosed` never consults it. Reader ships here (8c.10); UI surfacing is 8c.11e.
- **Decision 5 — LOCKED: `billing.closed` captures `finalMargin`** — `getJobMargin` snapshot computed BEFORE the txn (the close mutates no invoices), stored point-in-time in both the `billing.closed` event metadata and the `audit_logs` row.
- **Decision 6 — LOCKED: operational event type = `job.status_changed`** (reuse Phase-4 vocab; billing semantics live in the `billing.closed` billing-domain event).
- **Decision 7 — LOCKED: `audit_logs.action = "billing.closed"`**, direct `tx.insert` (mirrors `createJob` — atomicity over resilience).
- **Decision 8 — LOCKED: file = `src/server/billing/close.ts`.**
- **Construction notes (for `02-decisions.md`):**
  1. **The narrowed sole-writer guarantee.** 8c.10 is the first billing writer to legitimately write `jobs` (`current_status_id` + `closed_at`), so the prior "`.update(jobs)` forbidden" guarantee NARROWS: `.update(jobs)` is now **expected present**, but the `jobs` `.set` is exactly `{ currentStatusId, closedAt }` and the token **`notToExceedAmount` is absent from the whole file** — the 8c.4 sole-writer rule for *that column* persists. Scope substrate (D-7.3) + `job_vendor_assignments` (Phase-5) remain untouched. Verified Groups 4 + 11.
  2. **Four-way atomic dual-domain write** (one txn, verified Group 1): `jobs` (status + closed_at) + `job_status_history` (from→to) + `job_events` (`job.status_changed`) + `billing.closed` (billing event) + `audit_logs` — all land from one call or none.
  3. **Third `isAccountingRole` reuse** — `markBillingClosedAction` is the third accounting gate (send invoice / record payment / close billing), fully validating the 8c.8 predicate extraction across every gate. Unlike the payment action's revalidate-only `jobId`, billing-close's `jobId` is a genuine argument (the job is the close target).
  4. **`job_events` `fromStatusId` is supplementary** — the authoritative from→to transition is the `job_status_history` row; the merged-timeline UI (8c.11a) resolves `fromStatusId` → human label via the `job_statuses` reference table at render.

Phase 8 will NOT build these; they roll into `10-known-limitations.md` (+ the existing `8b §8` flags):
- **No agent** (OQ-27) — L-7.1 resolver stays inert; **Q-7.1** (agent-config seed split) untriggered.
- **No `billing_policies`** / dollar-gated approval thresholds (OQ-21) — role gates + NTE flag only.
- **No line-level vendor↔client rollup / no `job_scope_steps`↔line-item link** (#4/#15) — per-job margin only.
- **Tax** placeholder columns only; `is_tax_exempt` recorded, unenforced (#7).
- **`scope_snapshot`/`scope_delta_snapshot` text-only** — no JSON authoring / format discriminator yet (8b-D5).
- **Markup internal-only** — Phase-11 portal must omit it (OQ-6).
- **`vendor_invoices.source_type='email_ingestion'`** placeholder — Phase 13 wires draft semantics (#5).
- **Emergency-multiplier tenant default is a resolver constant `1.50`** — promote to stored per-tenant config later (8b-D1).
- **Auto-expiry of proposals** (cron) deferred — `valid_until` computed-on-read (OQ-8).
- **Quote-first** deferred — `proposals.job_id NOT NULL` (OQ-12).
- **`closed_at` is "first close"** (operational or billing), not a distinct billing-close timestamp — billing close sets `closed_at` only if null (COALESCE, 8c.10 Decision 3). A separate `billing_closed_at` column is a future addition if the two close moments ever need to be distinguished.
- **CF-8b.1** — scratch-DB fresh-migration verify before tag (`closeout-carryforwards.md`).

---

## §7 — Out of scope for this turn
- **No code, no data-layer, no DB.** Plan only.
- Sub-batch implementation begins **only on go-ahead**, one sub-batch at a time, each with its pre-DB review → apply → verify review → single commit.

**Held for review. Do not begin 8c.1 until the §5 decisions are confirmed and the sub-batch plan is approved.**
