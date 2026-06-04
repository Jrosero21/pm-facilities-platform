# Phase 27 — Business Rules

Authoritative rules for `proposal_generator_v1`. Each cites the invariant it honors.

## Kind & status

- **BR-27.1** — Every proposal has a `kind`: `client` (client-facing priced document) or `internal`
  (operator-only billing-intent record). Default `client`; all pre-27 rows are client.
- **BR-27.2** — A proposal's `kind` is decided **at publish** by the NTE send-gate, not chosen up
  front by the operator (except the `forceClientReview` override toward client).
- **BR-27.3** — `internal_billed` is a **terminal** proposal status. It is NOT live (cannot occupy a
  revision chain's single-live slot) and NOT withdrawable.
- **BR-27.4** — A proposal **revision inherits the prior row's `kind`** (an internal revision stays
  internal; a client revision stays client).

## The client-visibility seal (load-bearing)

- **BR-27.5** — A proposal reaches a client **only** if `status = 'sent'` **AND** `kind = 'client'`
  (both ANDed, in `listClientJobProposals`). This is the single client-visibility path. *(§2.1 — an
  internal record can never leak to a client.)*
- **BR-27.6** — An `internal` proposal is excluded from every client surface regardless of status.

## Money safety (number-free both ways)

- **BR-27.7** — The LLM output schema is **number-free by construction**: a line carries only
  `category`, `description`, `scopePhrasing`. No quantity/unit-price/markup/tax field exists, so the
  model cannot emit a dollar. *(money-safety as a type constraint.)*
- **BR-27.8** — Every dollar on a published proposal traces to the operator's `edited_content` or the
  rule-resolved markup — **never** to the model.
- **BR-27.9** — Markup is resolved **once** at publish (`resolveClientMarkupDefault`) and applied to
  every line; the gate total and the persisted total use the same value.
- **BR-27.10** — **Publish fails closed on missing pricing.** If a content line lacks a well-formed
  decimal quantity/unit price, `publishProposalDraft` throws `ProposalRequiresPricing` and materializes
  **no** `proposals` row — never a `$0` proposal. *(§2.5.)*
- **BR-27.11** — Totals are computed by the canonical `computeArLines` / `recalculateProposalTotals`
  money primitives; the totals path is **kind-agnostic** (no status/kind branch).

## The NTE send-gate

- **BR-27.12** — The kind decision is one pure function,
  `decideProposalKind(total, effectiveNte, forceClientReview)` (Big.js decimal compare), shared by
  publish AND the read-only routing preview. *(§2.5 — preview ≡ publish.)*
- **BR-27.13** — Gate basis = the **client/job** effective NTE (`getEffectiveNte` =
  `jobs.not_to_exceed_amount` + Σ approved change orders), **not** the vendor `agreed_nte_amount` axis.
- **BR-27.14** — `total ≤ NTE` → `internal`; `total > NTE` → `client`; `effectiveNte === null` →
  `client` (fail-safe); `forceClientReview === true` → `client` (toward-review only).
- **BR-27.15** — **MVP limit:** the gate compares **each proposal on its own** against the job NTE; it
  does **not** subtract already-published proposals' totals (no cumulative/remaining-NTE check).
  *(CF-27.4; mitigation = `forceClientReview`.)*

## Generation & eligibility

- **BR-27.16** — A proposal may be generated only on a **billable** job; the agent excludes `NEW`,
  `CANCELLED`, `CLOSED`, `CLOSED_BILLED` (→ `JOB_NOT_BILLABLE`). It is **not** gated on
  `COMPLETED`/approved-scope (progress billing). *(§2.5.)*
- **BR-27.17** — A job may carry **multiple** proposals (deposit, draws, final).
- **BR-27.18** — The agent **always queues** at `pending_review`; there is no auto-execute path.
- **BR-27.19** — Fail-safe gated: absent policy → `requiresReview:true`. *(§2.1.)*

## Audit & feedback

- **BR-27.20** — The `internal_billed` terminal transition emits a `proposal.internal_billed`
  job-billing event (auto-billing is never silent). *(§2.2.)*
- **BR-27.21** — Publish is idempotent: `published_proposal_id` non-null → `ProposalAlreadyMaterialized`
  (pre-flight **and** under the finalize lock). *(§2.6.)*
- **BR-27.22** — The Phase-25 correction signal is **phrasing edit-distance** (numbers stripped); a
  gold pair's stored content is phrasing-only, so few-shot examples are number-free. Thresholds are
  conservative MVP defaults, single-sourced in `proposal-phrasing.ts`.
