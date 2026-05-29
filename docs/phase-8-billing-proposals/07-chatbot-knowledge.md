# Phase 8 — Chatbot Knowledge (Billing Domain Primer)

The billing-domain primer for the future Phase-16 chatbot — a Claude instance that answers usage questions, summarizes job billing state, drafts client/vendor updates, recommends next actions, and flags anomalies. **Fact-density over narrative** (this is an index, not a tutorial). Scope = Phase 8 billing only; other domains (auth/tenancy P1, jobs P4, dispatch P5, communications/agent substrate P6, scope P7) have their own primers. Operator-facing phrasings are canonical in `03-user-sop.md`/`06-business-rules.md`; rationale in `02-decisions.md`; hard boundaries in `10-known-limitations.md`.

## Mental model

- **Three-party platform.** The *aggregator* (the tenant) sits between *clients* (who pay) and *vendors* (who do the work). AR = money the aggregator bills clients; AP = money vendors bill the aggregator. Margin = AR − AP.
- **Billing records hang off a job.** Five types: **proposals** (pre-commitment AR quote), **change orders** (post-commitment AR scope delta), **vendor invoices** (AP, from vendors), **client invoices** (AR, to clients), **payments** (against either, direction-discriminated).
- **NTE (not-to-exceed)** is the spending ceiling: snapshotted onto each job at creation from a per-client rule; raised by approved change orders (computed on read); vendor invoices are checked against it.
- **Everything is human-gated.** No agent runs in Phase 8. AI output (including this chatbot's, in P16) is always a draft pending review — never auto-executed.

## Record lifecycles (states + reachable transitions)

- **Proposal:** `draft → sent → {accepted | declined} | withdrawn`; plus revisions (`superseded` when a revision supersedes it). Editable only in `draft`. Withdrawable from `draft/sent/viewed` (NOT `accepted` — accepted is a commitment). `accepted` and terminal states → **revise** (a new draft revision in the same chain; one live revision per chain).
- **Change order:** `draft → submitted → {approved | declined} | withdrawn`. Editable in `draft`. **No revision concept** — a redo is a new CO. `approved` is terminal (raises effective NTE).
- **Vendor invoice (AP):** `received → {approved | disputed}` (`under_review` exists in the enum but has no Phase-8 transition writer). Editable in `received/under_review`. `disputed` is terminal in Phase 8. Payment via the payments flow (separate from status).
- **Client invoice (AR):** `draft → sent | void`. Editable in `draft`. `sent` = issued (revenue). `void` from `sent` only (drafts can't be voided and have no discard — CF-8c.8.2).
- **Payment:** no lifecycle; one immutable row, `direction ∈ {inbound (AR, client→us), outbound (AP, us→vendor)}`.

## Status semantics (the critical distinctions)

- **`client_invoice.status='sent'` = revenue.** AR revenue counts when issued (sent), not when paid. Drafts and voids don't count.
- **`vendor_invoice.status='approved'` = committed cost.** AP cost counts when approved.
- **`payment_status` (unpaid/partially_paid/paid) is ORTHOGONAL to `status`.** A fully-paid client invoice is still `status='sent'`, `payment_status='paid'`. Never conflate them — revenue recognition is `status`, collection is `payment_status`.
- **`CLOSED_BILLED` is independent of operational `CLOSED`.** It's the financial-close terminal, reached by an explicit accounting action from any status; it does not require operational close, and operational close does not trigger it.
- **Effective NTE is computed on read** (`base + Σ approved-CO totals`), never stored. A NULL base = no ceiling.

## The 21 billing-event types (`job_billing_events.event_type`)

The chatbot reads these to interpret a job's financial timeline:
`proposal.{sent, accepted, declined, withdrawn, superseded}` · `change_order.{submitted, approved, declined, withdrawn}` · `vendor_invoice.{received, approved, disputed, paid}` · `client_invoice.{created, sent, paid, voided}` · `payment.recorded` · `nte.{exceeded, overridden}` · `billing.closed`.
Notes: `change_order.created` and `vendor_invoice.created` are **deliberately absent** (first CO emit is `.submitted`; an AP invoice's meaningful event is `.received`). `client_invoice.created` **is** emitted (authoring an AR document is meaningful). `nte.exceeded` carries `metadata.level` = `dispatch` / `job` (per-invoice) or `job_aggregate`. Each event has an `actorName` (resolved), `summary` (self-describing), optional `amount`, and 0-to-many record refs.

## Where to read what

- `job_billing_events` — the **financial timeline** (the 21 types above). Primary source for billing summaries.
- `job_status_history` / `job_events` — operational transitions / operational timeline (billing close also writes here as `job.status_changed`).
- `audit_logs` — platform-wide: `billing.closed`, `client_nte_rule.{created,activated,archived}` (config-scoped, NOT in the job timeline).
- Live reads: `getJobMargin` (revenue/cost/margin), `getEffectiveNte`, `getBillingCloseReadiness`, the per-record `get*`/`list*` readers + `list*LineItems`.

## Roles

- **Operator** (`requireTenant`): proposals, change orders, vendor-invoice record/approve/dispute, client-invoice authoring (create + lines), NTE-rule admin.
- **Accounting** (`accounting` role or super-admin): **issue** (send) a client invoice, **void** it, **record a payment**, **close billing** — the four money-moving/revenue-defining actions. Non-accounting users can't perform these.

## Structural guarantees (citable with confidence)

The chatbot can state these as facts: one canonical writer per money column (totals, payment_status, NTE); a payment references exactly one invoice matching its direction; a payment's job is derived from its invoice; billing close never touches NTE/scope/dispatch data; AR and AP never cross except in margin; money is exact decimal (no float). (Detail in `02-decisions.md`.)

## Questions the chatbot should answer

- **"Why can't I send/issue this invoice?"** → A client invoice sends only from `draft`. If it's already `sent` or `void`, it can't be re-sent. Issuing requires the accounting role. (Translate the underlying guard to this; never surface the class name.)
- **"Why can't I pay this invoice?"** → A vendor invoice is payable only when **approved**; a client invoice only when **sent**. ("Approve it / send it first.")
- **"Why is this invoice flagged over NTE?"** → Two causes: it exceeds *its own* ceiling (its dispatch's agreed amount, else the job's effective NTE) → per-invoice; or the job's *total approved AP* crossed the job's effective NTE → aggregate (fires once, on first crossing). State the baseline and what crossed.
- **"What does CLOSED_BILLED mean?"** → Billing is finalized for the job (an explicit accounting action), independent of operational close; the final margin was snapshotted at that moment.
- **"Why did revising a proposal create a new row?"** → Revisions are a chain — the original is preserved (audit) and superseded; the new revision is editable. Editing the old row in place would lose the as-sent record.
- **"Approve vs accept on a change order?"** → Operator-facing, it's just **approve** / **approved**. (Internally the decision is stored as `accepted` to share the proposal-approval shape — the chatbot should use operator vocabulary and only mention the internal term if explicitly asked about the schema.)
- **"Why can't I edit this approved change order / accepted proposal?"** → It's a committed record; alter it via a new change order (CO) or a revision (proposal).

## Drafting patterns

- **Billing-state summary** (read the records + live readers): *"Proposal P1 ($X) was sent {date} and accepted {date}. Change order CO1 ($Y) is submitted, awaiting approval. Two vendor invoices total $Z (one approved, one received); one client invoice ($W) was sent {date}, partially paid ($P of $W). Effective NTE: $E; current margin: $M."* Use `status`/`payment_status` precisely (sent = issued; paid = collected).
- **Client update** (rewrite an operator note for the client; P6 rewriter pattern): operator "vendor finished punchlist, billed us $400" → client *"The punchlist work is complete; we've received the vendor's invoice and will issue your final invoice shortly."* **Strip internal/AP figures** (the $400 cost, vendor identity, markup) — clients see AR only; markup is internal (OQ-6).
- **Anomaly flag** (draft for the operator, never act): *"This job has approved vendor invoices exceeding its NTE; an override was recorded ({date}) but no change order has been submitted — consider whether a CO is needed."* Or: *"A client invoice was voided after a payment was recorded against it — verify reconciliation"* (voiding doesn't auto-refund).

## Bounds — what the chatbot must NOT do

- **Never auto-execute.** Recommend/draft only; the operator acts. (P16 design: AI output is a reviewable draft.)
- **Never surface internal error-class names or schema vocabulary** in operator-facing text — use the SOP translations (`03`/`06`). The `approved`/`accepted` CO mismatch stays internal.
- **Never invent flows or claim a deferred feature works.** Respect the boundaries in `10-known-limitations.md`: no dispute *resolution* (disputed is terminal), no client-invoice draft *discard*, no overpayment *reconciliation* (overpayment is allowed but untracked), vendor invoices are *assignment-anchored* (dispatch first), the **emergency NTE multiplier is stored but inert** (don't claim emergency jobs get a higher NTE — they don't, in Phase 8; CF-8c.docs.1), no multi-currency (same-currency MVP).
- **Never claim NTE is enforced as a hard block.** An over-NTE vendor invoice can still be approved (the breach is flagged/audited, not prevented) — the NTE is an advisory ceiling, not a gate.
