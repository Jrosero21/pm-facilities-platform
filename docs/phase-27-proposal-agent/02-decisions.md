# Phase 27 — Decisions

The load-bearing decisions for `proposal_generator_v1`, with the v2 invariant each one honors.

## D1 — An internal proposal is a real, per-job RECORD (not straight-to-invoice)

When the work is within the agreed ceiling, the agent could have written straight to a client invoice.
We chose instead to keep the **proposal** as the unit and add an `internal` flavor: a per-job,
operator-only billing-intent record on the existing `proposals` table. This preserves the proposal's
own scope snapshot and revision chain, keeps one auditable commercial document per intent (not a
shadow path), and lets the **same** review/price gate serve both flavors. The bill-issuance question
(proposal → invoice) is deliberately deferred — see **CF-27.2**. **Honors §2.1** (a reviewable record,
not a silent write) and the source-agnostic / one-record discipline.

## D2 — A NUMERIC NTE send-gate; a null effective-NTE is a DESIGNED fail-safe path

The flavor is decided by arithmetic, not by the operator picking a type up front:
`decideProposalKind(total, effectiveNte, forceClientReview)` (Big.js decimal-string compare). The gate
basis is the **client/job** effective NTE — `getEffectiveNte` = `jobs.not_to_exceed_amount` + Σ
approved change orders — **not** the vendor-cost axis (`job_vendor_assignments.agreed_nte_amount`).
Crucially, `getEffectiveNte` **can** return `null` (a job with no ceiling), and that is a **designed
path**, not an edge case: a null NTE routes **client** (fail-safe to the human review flow — never
auto-bill without a ceiling to check against). **Honors §2.5** (the hard floor: do not auto-commit
money you cannot bound) and the source-agnostic NTE model.

## D3 — Money authoring is a HUMAN affordance; the bridges are banked

The draft is number-free; the operator authors every dollar at the gate (`edited_content`). Two
adjacent capabilities are explicitly **banked**, not half-built: a **vendor-initiated NTE-increase**
record (**CF-27.1** — today an operator change order serves) and a **proposal→invoice link**
(**CF-27.2** — no FK basis today; only `job_billing_events` correlation). **Honors §5.4** (stay inside
the phase; flag scope creep).

## Fork-1 — `kind` lives on the existing `proposals` table (option a)

We added `kind enum('client','internal')` (default `'client'`) **to the existing `proposals` table**
rather than creating a parallel `internal_proposals` table or overloading `status`. The default
preserves all 121 pre-27 rows as client-facing untouched; the existing revision-chain, totals, and
line-item machinery are reused as-is (`recalculateProposalTotals` is **kind-agnostic** — no
status/kind branch). A revision **inherits** the prior row's kind (an internal revision stays
internal). **Honors §5.4** (extend, don't fork) and the one-record discipline.

## The four 27a divergences from the invoice template (resolved)

The proposal agent mirrors the invoice agent, but four places **had** to diverge — each resolved
explicitly:

1. **Markup resolved EXPLICITLY at publish.** `addProposalLineItem` lacks the invoice writer's
   `undefined → resolve-default` markup semantic, so the publish path calls
   `resolveClientMarkupDefault` **once** and passes the concrete value to both the gate total and
   every line — so the gate basis is byte-identical to what `recalculateProposalTotals` persists.
2. **`getEffectiveNte` returns `string | null`, compared with Big.js.** Not a float; the gate is a
   decimal-string comparison (the `recalculateVendorInvoiceTotals` precedent).
3. **Kind is decided AT PUBLISH; `internal` transitions to `internal_billed` + emits an event.**
   Unlike the invoice publish (which lands a `draft`), an internal proposal lands terminal at
   `internal_billed` via a direct status set under the draft lock, and emits a
   `proposal.internal_billed` job-billing event (there is no other downstream emitter — §2.2).
4. **No `client_id` on `proposal_drafts`.** The job→client linkage is canonical via
   `proposals.job_id → jobs`; the draft carries no denormalized client id (unlike `invoice_drafts`).

**Honor §2.5-v1 / §2.2 / §2.6** respectively; recorded so the divergence from the invoice template is
intentional, not drift.

## D4 — Permissive eligibility (progress billing), excluding only the not-billable states

A proposal may be drafted on any **live, billable** job. The eligibility gate excludes only the
not-billable status codes — `NEW` (draft-intake; nothing scoped yet), `CANCELLED` (work won't
happen), `CLOSED` / `CLOSED_BILLED` (terminal; post-close billing needs a deliberate reopen, not an
agent draft). Eligible set: `DISPATCHED, SCHEDULED, IN_PROGRESS, ON_HOLD, COMPLETED`. We do **not**
gate on `COMPLETED`/approved-scope because **progress billing** (deposits/draws) is drafted *before*
completion. **Honors §2.5** (a hard but permissive floor) and the real-world billing cadence.

## D5 — `forceClientReview`: always able to "send a bill"; promote-later banked

`publishProposalDraft` takes `forceClientReview`. It only ever forces **toward** the client review flow
(an under-NTE proposal the operator wants the client to see — e.g. a deposit/draw) — it can never push
toward auto-billing (§2.1-safe). The inverse — promoting an already-`internal_billed` proposal to a
client proposal later — is **not** supported (`internal_billed` is terminal); banked as **CF-27.5**.
**Honors §2.1** (the human can always choose the more-reviewed path).

## D6 — The feedback signal is PHRASING edit-distance (numbers stripped)

Because a valid proposal publish always has operator-authored pricing, `edited_content` is **never
null** — so the invoice creator's "null edit = approved-as-is = positive" classification cannot be
reused (every proposal would look gold). The proposal signal is the **normalized Levenshtein distance**
between the **phrasing-only projection** (`phrasingOnly`, numbers dropped) of the draft vs the edited
content: `d ≤ gold_max (0.15)` → positive (phrasing kept ~as-is), `d ≥ negative_min (0.5)` → negative
(heavy rewrite, excluded), in between → gold (refined; the teaching example). The pair's stored
`draftContent`/`editedContent` are the phrasing-only projections, so **few-shot is number-free by
construction** (a gold example carries no dollar). Thresholds are conservative MVP defaults,
single-sourced in `proposal-phrasing.ts`, tunable once real data exists. **Honors the Phase-25
mechanism** (same buckets/selector/`buildFewShotMessages`, unchanged) and the money-safety rule.

## D7 — `decideProposalKind` is a PURE helper, single-sourced

The NTE kind decision is extracted into `src/server/billing/proposal-routing.ts` (pure, no DB, Big.js)
so the **publish path** and the **read-only routing preview** call the same function and can never
drift. **Honors §2.5** (preview ≡ publish — the operator's preview is truthful).

## D8 — Phase-number swap (Option A): proposal takes v2.10.0; dispatch shifts later

The v2 roadmap §5 named Phase 27 "AI-assisted dispatch (Tier 3)". Dispatch is data-blocked on B-16.4
(`vendor_performance_scores` empty). Per the §6 new-agents ordering (invoice → proposal → NTE
negotiator), we shipped the **proposal generator** in the v2.10.0 / Phase-27 slot and shifted dispatch
later — **data dependency unchanged** (dispatch still needs Phase-20 performance data + B-16.4). The
bank's B-16.4 note is corrected at closeout. **Honors the source-of-truth order** (roadmap §6 ordering
+ the live bank win over a stale §5 row).

## D9 — UI scope matches Phase 26 (server actions + harness; no rendered review surface)

We authored the six server actions (generate/approve/reject/discard/publish + a read-only routing
preview) but **no rendered review screen**, exactly as Phase 26 shipped the invoice actions
referenced-only. The cross-agent draft-review UI (invoice + proposal) is banked as **CF-27.6** — a
natural single surface pass. **Honors §5.4** (don't build a one-off UI when a shared surface is the
right home).

## Invariants honored (summary)

- **§2.1 fail-safe gated** — no policy default → `requiresReview:true`; AI output is a reviewable
  draft; `forceClientReview` only forces toward review.
- **§2.2 not-silent** — every run/tool-call/decision logged; the `internal_billed` terminal emits a
  `proposal.internal_billed` job-billing event.
- **§2.5 hard floor** — billable-job eligibility; a null NTE fails safe to client; publish fails closed
  without pricing.
- **§2.5-v1 draft-review gate** — intact; the operator authors the money here.
- **§2.6 idempotency** — publish guarded on `published_proposal_id` (pre-flight + under the finalize lock).
