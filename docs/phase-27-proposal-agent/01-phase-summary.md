# Phase 27 — Phase Summary

**New Agents (arc): the Proposal Generator** · v2.10.0-phase-27 · branch `phase-27-proposal-agent`.

> **Phase-number note (read first).** The v2 roadmap §5 named Phase 27 "AI-assisted dispatch (Tier 3,
> data-blocked on Phase 20)". That dispatch agent is **data-blocked on B-16.4** (`vendor_performance_scores`
> is empty — no performance history to score). The roadmap §6 new-agents ordering is explicit —
> *invoice creator → **proposal generator** → NTE negotiator* — so the **proposal generator took the
> v2.10.0 / Phase-27 slot**, and AI-assisted dispatch shifts to a later phase. The data dependency is
> unchanged (dispatch still needs Phase-20 performance data + B-16.4). The live carry-forward bank's
> B-16.4 note is corrected accordingly (`closeout-carryforwards.md`).

## Goal

Continue the v2.9.0 "new agents" arc with the **second** agent — `proposal_generator_v1`, the 5th LLM
agent on the platform — following the proven pattern: register in the agent registry → run through the
shared runner → produce a reviewable draft → land at the §2.5-v1 review gate → policy-able via Phase 23
→ feedback-fed by Phase 25. The proposal generator follows the invoice creator on the roadmap's
stake-ordering: routine first, then the priced commercial document, then (later) the highest-stakes NTE
negotiator.

## What it does

The agent reads a **job's context** and drafts a reviewable **proposal** — the priced commercial
document an operator would otherwise write by hand. Two things make it distinctive:

- **Two flavors, one record, via `proposals.kind`.** A **client** proposal is the existing
  client-facing priced document the client approves (the Phase-8 lifecycle). An **internal** proposal
  is an **operator-only billing-intent record** that is **never client-visible** — the bill the
  operator can issue without a client round-trip when the work is within the agreed ceiling. Which
  flavor a published proposal becomes is decided by the **NTE send-gate**, not by the operator picking
  a type up front.
- **Number-free BOTH ways.** The LLM's structured-output schema carries only `category`,
  `description`, and `scopePhrasing` — **no quantity / unit-price / markup / tax field exists**, so the
  model is *structurally unable* to emit a dollar figure (money-safety as a type constraint, the
  invoice creator's D2 carried forward). Going the other direction, **publish fails closed**: if the
  operator never authored pricing, `publishProposalDraft` throws `ProposalRequiresPricing` rather than
  materializing a `$0` proposal. Every dollar on a published proposal therefore traces to the
  **operator's `editedContent`** (the gold correction signal) or the **rule-resolved markup** — never
  to the model.

## The NTE send-gate (the routing decision)

At publish, the proposal's total (computed with the shared `computeArLines` money primitive over the
operator's priced content + the resolved markup) is compared to the job's **effective NTE** by one
pure function, `decideProposalKind(total, effectiveNte, forceClientReview)` — a Big.js decimal-string
comparison (no float):

- `forceClientReview === true` → **client** (the override only ever forces *toward* review — §2.1-safe).
- `effectiveNte === null` → **client** (no ceiling → fail-safe to the client review flow).
- `total ≤ NTE` → **internal** (within the ceiling → auto-billed; the proposal lands terminal at
  `internal_billed` and emits a `proposal.internal_billed` job-billing event — §2.2 autonomy-never-silent).
- `total > NTE` → **client** (over the ceiling → the client-facing `draft` → send lifecycle).

The **same** `decideProposalKind` backs the read-only routing **preview**, so the "will route
INTERNAL/CLIENT" indicator and the actual publish can never drift. The gate basis is the **client/job
NTE** (`jobs.not_to_exceed_amount` + approved change orders, via `getEffectiveNte`), **not** the
vendor-cost axis (`job_vendor_assignments.agreed_nte_amount`).

## The arc: generate → review+price → publish (route)

1. **Generate.** `runProposalGenerator` opens a run, reads the job context (auto-logged tool calls),
   enforces a **permissive billable-job eligibility gate**, generates number-free phrasing, logs the
   decision at `queued_for_review`, and writes a `proposal_drafts` row at `pending_review`. It
   **always** queues — no auto-execute path.
2. **Review + price (the §2.5-v1 gate).** The operator approves/edits/rejects, and — because the draft
   is number-free — the operator **authors the pricing** here. Edits land on
   `proposal_reviews.edited_content`; the draft's `proposed_proposal` stays immutable.
3. **Publish (route via the NTE gate).** Publishing an approved, **priced** draft materializes it into
   a canonical `proposals` row (+ `proposal_line_items`) via the existing billing writers, at the kind
   the NTE gate decides. Idempotency-guarded on `published_proposal_id`. The client-visibility seal
   stays `status='sent'` **AND** `kind='client'`.

## How it plugs into the platform

- **Phase-24 observability:** volume and cost surface for free (GROUP BY `agent_id`); a new
  `proposalApproveAsIs` adapter + a 5th row in `agentApproveAsIs` surface approve-as-is.
- **Phase-25 feedback:** because a valid proposal publish **always** has operator-authored pricing,
  `edited_content` is **never null** — so the invoice creator's "null edit = approved-as-is" signal
  does not translate. The proposal signal is **phrasing edit-distance** (numbers stripped via
  `phrasingOnly`), so few-shot examples are **number-free by construction**. Thresholds (gold ≤ 0.15 /
  negative ≥ 0.5) are conservative MVP defaults, single-sourced in `proposal-phrasing.ts`.

## The build sequence (6 batches)

1. **Batch 1** — migration 0048 (`proposal_drafts` + `proposal_reviews`; `proposals.kind`; status +=
   `internal_billed`; `prop_tenant_kind_status_idx`).
2. **Batch 2** — consumer write-path fixes (the client-visibility seal; `kind` on the proposal write
   paths; status buckets for `internal_billed`; operator kind badge).
3. **Batch 3** — the agent (`proposal_generator_v1`): number-free LLM, edits, drafts/reviews, the
   `publishProposalDraft` + NTE gate.
4. **Batch 4** — analytics wiring (`proposalCorrectionPairs`, `proposalApproveAsIs`,
   `normalizedLevenshtein`, `phrasingOnly`).
5. **Batch 5** — server actions + `decideProposalKind` extraction + the read-only routing preview; the
   phase-blocking harness.
6. **Closeout** — these 11 docs + the carry-forward bank + the 27a inspection report.

## Verification

`db:check:proposal` (sandbox) **15/0** — money-safety (number-free draft; published total derives only
from operator pricing + markup; approve-as-is fails closed with `ProposalRequiresPricing`), the NTE
gate (all four paths + the `internal_billed` event), idempotency, harvest buckets + gold-first
selector, approve-as-is, and volume. `db:check:feedback` **13/0** and `db:check:observability` **28/0**
stayed **unchanged** (both tenant-isolated — the new roster/aggregate entries are empty for their seed
tenants). Migration 0048 applied to prod via the sandbox → `-E` contract-verify → prod-confirm cadence
(121 → 123).

## What this retires

This phase retires **B-16.5** ("LLM-assisted draft phrasing — provider seam + `ai_prompt_templates`")
**further** — the **proposal generator's** per-agent share is now delivered. **Residual = the NTE
negotiator only** (not yet built). B-16.5 stays OPEN with that reduced residual; it does **not** fully
discharge this phase.

## Out of scope (banked)

Vendor-initiated NTE-increase record (**CF-27.1**); a proposal→invoice link (**CF-27.2**); the publish
non-atomic window (**CF-27.3**); a cumulative/remaining-NTE gate (**CF-27.4** — today the gate is
per-proposal); promote-an-internal-proposal-to-client-later (**CF-27.5** — `internal_billed` is
terminal); and a **rendered** cross-agent draft-review UI (**CF-27.6** — the server actions exist but
no screen, matching Phase 26). Enabling any autonomy is **not** done this phase (still needs a Phase-23
policy + a live trigger that does not exist — CF-24.2).
