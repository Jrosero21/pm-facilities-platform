# Phase 8 — Closeout Carry-Forwards

Items that must be resolved or recorded **before** the Phase 8 closeout (`11-closeout.md`) and the `v0.9.0-phase-8` tag. Accumulated across the 8b/8c gates; each entry names what must happen and who/what gates it. Distinct from deferred-feature forward-flags (those live in `8b-schema-plan.md §8` and will roll into `10-known-limitations.md`).

---

## CF-8b.1 — Run §7.5 fresh-migration verification against a scratch DB before tagging

**What.** The 8b verify (this gate) substituted a **non-destructive drift check** (`pnpm db:generate` → "No schema changes, nothing to migrate") for §7.5's full byte-identical from-scratch rebuild, because the live dev DB carries the Phase 4–7 worked-example data (Jobs #1–3, dispatch, scope) and a real drop-and-rebuild would wipe it.

**Obligation (before closeout / tag).** Run the full **from-scratch migration rebuild** (`0000`→`0023`) against a **scratch/throwaway database** and confirm the resulting schema is byte-identical to the worked-DB schema — the Phase-7-precedent verification (`docs/phase-7-ai-scope-generation/11-closeout.md`: "the three applied byte-identically from-scratch"). Capture the result in `11-closeout.md`.

**Blocker condition.** If the from-scratch rebuild **diverges** from the worked-DB schema, that is a **blocker for the `v0.9.0-phase-8` tag** — investigate and reconcile before closeout.

**Refs.** `8b-schema-plan.md §7.5`; 8b verify-review (drift-check substitution flagged at apply).

---

## CF-8c.1.1 — NTE-rule archive should emit a billing event (audit trail)

**What.** In 8c.1, `archiveClientNteRule` is a **silent state change** (`active|archived → archived`) — no audit/event row. NTE-rule lifecycle changes (create / activate-supersede / archive) are tenant billing-config edits that should eventually be auditable.

**Obligation (closeout-tracked, NOT 8c.1 scope).** Add a `billing_config.*` taxonomy entry (e.g. `billing_config.nte_rule_archived` / `.created` / `.activated`) emitted on NTE-rule lifecycle changes. The natural home for the emit is **wherever NTE-rule admin lives** (8c.11e UI) or a future config-audit follow-on — decide there. `emitJobBillingEvent` is job-scoped, so a config-level event may need a different sink (config events are not job-scoped); flag that shape question when implemented.

**Refs.** 8c.1 pre-DB review (archive is a silent state change); 8c-construction-plan §2 (8c.1).

---

## CF-8c.4.1 — Multi-currency NTE override comparison not handled

**What.** 8c.4's override detection compares `operatorNte !== resolvedNte.amount` (a plain `===` on canonical `"d.dd"` strings) and **does not consider currency**. The override event records `currency = resolvedNte.currency`. This is correct under the **same-currency MVP** (OQ-2 — `'USD'` everywhere), where amount comparison alone is sufficient.

**Obligation (if multi-currency lands later).** When per-record currency diverges from `'USD'`, the override comparison boundary in `createJob` must compare **both amount AND currency** (an operator value in a different currency than the rule is an override regardless of the numeric amount), and the `nte.overridden` metadata must record **both** the rule currency and the override currency explicitly. Until then this is a documented same-currency assumption, not a bug.

**Refs.** 8c.4 Catch 3; OQ-2 (same-currency MVP); `8c-construction-plan §5` (8c.4 construction notes).

---

## CF-8c.6.1 — Vocabulary alignment opportunity for `change_order_approvals.decision`

**What.** `change_order_approvals.decision` uses the **`{accepted, declined}`** enum (shared with `proposal_approvals` at the 8b parallel-shape), while `change_orders.status` uses **`{draft, submitted, approved, declined, withdrawn}`**. The 8c.6 writer maps operator **approve → `{status:"approved", decision:"accepted"}`** to satisfy both. The data is coherent ("the approver accepted it" → CO `approved`), but the `approved`/`accepted` words differ across the two columns.

**Obligation (optional cleanup, NOT a blocker).** A future schema migration could align the CO approvals `decision` enum to **`{approved, declined}`** for vocab consistency with `change_orders.status`, at the cost of diverging from the shared approval-shape with `proposal_approvals`. Pursue only if the mismatch causes confusion in code review or for downstream/agent readers.

**Refs.** 8c.6 lock 11f; `8c-construction-plan §5` (8c.6 construction notes); 8b §3 (shared approval-shape).

---

## CF-8c.7.1 — `getJobMargin` (OQ-16) deferred to 8c.8

**What.** Job margin = AR revenue − AP cost. The AP cost half shipped in 8c.7 as the reader **`sumApprovedVendorInvoiceTotals(tenantId, jobId)`** (Σ `status='approved'` vendor-invoice totals, keyed by `job_id`). The AR revenue half (client invoices) does not exist until 8c.8, so the full margin reader was deliberately **not** built in 8c.7 (Decision 4) — building it would have reached forward into the not-yet-existent AR substrate.

**Obligation (8c.8).** Implement `getJobMargin(tenantId, jobId)` as **`sumApprovedClientInvoiceTotals(tenantId, jobId) − sumApprovedVendorInvoiceTotals(tenantId, jobId)`**, both keyed by `job_id`, summed with `big.js` + `roundHalfUp` (explicit-mode). `sumApprovedVendorInvoiceTotals` is already exported and ready to consume; 8c.8 adds the AR-side aggregator + the subtraction.

**Refs.** 8c.7 Decision 4; OQ-16; `8c-construction-plan §5` (8c.7 construction notes).

**RESOLVED (8c.8).** `getJobMargin` shipped in `src/server/billing/margin.ts` exactly as specified (`revenue − cost`, both `job_id`-keyed, `big.js` + `roundHalfUp`); `margin.ts` is the sole AR↔AP meeting point. AR revenue = `status='sent'` only (8c.8 Decision 4). Verified Group 11 (7-case matrix).

---

## CF-8c.8.1 — Runtime role-gate integration test deferred to 8c.11d

**What.** 8c.8 ships the platform's first enforced role gate (`sendClientInvoiceAction` → `requireTenant()` + `isAccountingRole(...)` → `redirect("/forbidden")`). The **policy** is empirically verified at the data/predicate layer (8c.8 verify Group 15: `isAccountingRole` 8-case truth table) + the gate placement is confirmed structurally. But the **end-to-end action path** (real session → `requireTenant` cookie/redirect behavior → `redirect("/forbidden")` for a non-accounting user, success for accounting/super_admin) cannot run in the ephemeral `tsx` verify (it has no request context; `next/headers` throws outside a request) — see CF-8c.8.3.

**Obligation (8c.11d, UI/integration).** When the issue-invoice UI lands, add an integration test (or manual QA scriptable steps recorded in the closeout) exercising the live action with seeded accounting / non-accounting / super_admin sessions, asserting the `/forbidden` redirect vs success.

**Refs.** 8c.8 Decision 2; `8c-construction-plan §5` (8c.8 notes); CF-8c.8.3.

---

## CF-8c.8.2 — Client-invoice drafts have no header-delete / discard writer

**What.** 8c.8 exposes no writer to delete or discard a `draft` client invoice (void requires `status='sent'`, 8c.8 Decision 9). A draft created in error is operator scratch space with no removal path — it lingers as a `draft` row (excluded from revenue, so harmless to margin, but it is clutter).

**Obligation (future revision, NOT a Phase-8 blocker).** Add a `discardClientInvoiceDraft` writer (draft → hard-delete or a `discarded` status) when the issue-invoice UI (8c.11d) surfaces the need, mirroring the Phase-7 batch-7d "gated approved-scope drafts are discardable" close-the-stranding precedent.

**Refs.** 8c.8 Decision 9; Phase-7 batch-7d discardable-draft precedent.

---

## CF-8c.8.3 — Platform has no test framework

**What.** As of 8c.8 the repo has **no test runner** (`package.json` has no `vitest`/`jest`/`test` script) and **no test files** (`*.test.ts`, `__tests__/`). The per-sub-batch **ephemeral `scripts/verify-8cN.ts`** scripts (written, run with `--conditions=react-server`, results captured in the commit + docs, then deleted) are the platform's de-facto empirical test layer.

**Obligation (future infrastructure, NOT a Phase-8 blocker).** Standing test infrastructure (a runner + retained tests) could elevate the policy-critical pure units (e.g., `isAccountingRole`, `billing/money.ts` validators, `billing/totals.ts` math) from per-sub-batch verification to standing CI — which would also unblock the CF-8c.8.1 integration test.

**Refs.** 8c.8 Decision 2 inspection; `8c-construction-plan §5` (8c.8 notes).

---

## CF-8c.9.1 — Overpayment allowed but not specially tracked

**What.** 8c.9 allows overpayment: when `Σ payments > invoice.total`, the invoice's `payment_status` caps at `'paid'` (8c.9 Decision 3) — the payment is recorded at its full amount, the excess is not rejected. But overpayment is **not specially tracked**: there is no `overpaid` status, no credit-balance concept, and no overpayment-reconciliation workflow in Phase 8. The over-amount lives only as the recorded `payment_records.amount` summing above the invoice total.

**Obligation (future feature, NOT a Phase-8 blocker).** If overpayment handling becomes an operational need — vendor credits, duplicate-payment refunds, client credit balances applied to future invoices — it is a future feature (a credit-balance ledger + reconciliation workflow). Until then, overpayment is permitted and visible only via the payment-vs-total arithmetic; operators reconcile manually (paired with the CF-8c.8 void/refund operator-responsibility note in `06-business-rules`).

**Refs.** 8c.9 Decision 3 + Decision 5; `8c-construction-plan §5` (8c.9 notes); OQ-17 (no cross-invoice allocation).
