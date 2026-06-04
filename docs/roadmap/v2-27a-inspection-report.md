# v2 — 27a Inspection Report

**Status:** read-only inspection sweep (v2 sub-batch 27a + 27a-bis + the per-batch pre-author reads). No
build / schema / migration performed during the inspection passes. **Branch:** `phase-27-proposal-agent`.
**Scope of this doc:** the live-state findings that firmed the Phase-27 proposal generator on facts before
any code was authored. File paths + row/column facts cited. The agent design (these reports → manifests →
6 batches) is recorded in `docs/phase-27-proposal-agent/`.

---

## 1. The proposal record as it exists today (Phase 8, no kind axis)

- `proposals` / `proposal_line_items` / `proposal_approvals` live in `src/server/schema/proposals.ts`
  (Phase 8, migration 0018). `proposals.job_id` is **NOT NULL** (job-attached, not quote-first);
  revision chain via `parent_proposal_id` / `supersedes_proposal_id` / `revision_number`.
- Status vocab is **entirely client-facing**: `draft, sent, viewed, accepted, declined, expired,
  superseded, withdrawn`. **Confirmed (live): NO `kind` / `type` / `visibility` / `flavor` column**
  (`information_schema` count = 0) — the internal-vs-client axis is net-new.
- `proposal_line_items` = `baseLineItemColumns()` + `arMarkupColumns()` (the SAME shared shape as
  `client_invoice_line_items`); totals owned by `recalculateProposalTotals` (`billing/totals.ts`,
  kind-agnostic). `proposal_approvals` models the **CLIENT's** acceptance (offline or portal), **not**
  an operator-reviews-AI-draft gate — there is no draft/review substrate on proposals today.

## 2. The NTE send-gate data (the D2 mechanism)

- `client_nte_rules` (`billing/nte.ts`) resolves at **client × trade × priority[× location]** via the
  A4/A5 ladder, with a **HANDY** (general) fallback rung; the resolved value snapshots onto
  `jobs.not_to_exceed_amount` solely in `createJob`. `resolveClientNteRule` never throws (null → manual).
- `getEffectiveNte(tenantId, jobId)` (`billing/change-orders.ts:307`) returns **`string | null`** =
  `jobs.not_to_exceed_amount` + Σ approved change-order totals; **it CAN return null** (a job with no
  ceiling) — a designed path, not an edge case.
- Gate basis = the **client/job** NTE (`jobs.not_to_exceed_amount`), **distinct** from the vendor-cost
  axis `job_vendor_assignments.agreed_nte_amount` (both live, both `decimal(12,2)`, both nullable).

## 3. The proven agent pattern (the Phase-26 template)

The invoice creator is the exact template: registry entry; the shared runner
(`openRun/registerTool/logDecision/closeRun`); specialized `invoice_drafts` + `invoice_reviews`
(migration 0047); `resolveAgentPolicy` fail-safe to `requiresReview:true` with no policy seeded; a
**number-free** LLM schema; `publishInvoiceDraft` with an idempotency guard on
`published_client_invoice_id`; and the Phase-24/25 adapters (`invoiceApproveAsIs`,
`invoiceCorrectionPairs` with the `CAST(... AS CHAR)` JSON path, few-shot in the agent index).

## 4. Net-new gaps for Phase 27 (→ migration 0048)

- `proposal_drafts` / `proposal_reviews` **do not exist** (confirmed live) — migration 0048 needed.
- `proposals` has **no `kind`** and its status vocab is entirely client-facing — the internal-proposal
  path is net-new.
- Migration tip at inspection: **0047_military_lucky_pierre**; next free **0048**; live table count
  **121**.

## 5. The 27a-bis consumer map (the seal = one predicate)

Every `proposals` reader outside the billing data layer was enumerated. The **only** client-facing
path is `listClientJobProposals` (`server/client/list-client-job-proposals.ts`), gated `status='sent'`
— so the client seal is **one predicate**: add `kind='client'` (both ANDed). The operator job-detail
list (`listProposalsForJob`) and the close-readiness `open_proposals` count (`billing/close.ts`) are
operator surfaces; the write paths (`createProposal`, `createProposalRevision`) must carry/inherit
`kind`. Totals are kind-agnostic (no change). No analytics rollup reads proposals.

## 6. The four 3A divergences from the invoice template (resolved in build)

1. **Markup at publish** — `addProposalLineItem` lacks the invoice writer's `undefined → resolve`
   semantic → the publish path resolves `resolveClientMarkupDefault` explicitly, once.
2. **`getEffectiveNte` returns `string | null`** → Big.js decimal-string comparison, not float.
3. **Kind decided at publish** → an internal proposal transitions to `internal_billed` (no existing
   writer) and emits a `proposal.internal_billed` event (net-new in `BILLING_EVENT_TYPES`).
4. **No `client_id` on `proposal_drafts`** → job→client is canonical via `proposals.job_id`.

## 7. The 4A correction-signal divergence

The Phase-25 invoice signal ("null `edited_content` = approved-as-is = positive") **does not translate**:
a valid proposal publish always has operator-authored pricing, so `edited_content` is **never null**.
The proposal signal is **phrasing edit-distance** (`normalizedLevenshtein` over the `phrasingOnly`
projection, numbers stripped) — and because the stored pair content is phrasing-only, **few-shot stays
number-free by construction**. `buildFewShotMessages` / `selectFewShotPairs` / `latestReviewPerDraft`
are reused **unchanged**.

## 8. The 5A / 5B-inspect findings

- **Phase 26 shipped NO rendered agent UI** — the invoice actions exist but no component imports them and
  no `invoice-drafts-section.tsx` exists. The rendered template is the **scope** agent
  (`scope-drafts-section.tsx`). → proposal ships server actions + harness only (CF-27.6).
- **The invoice harness never tested publish/idempotency** — so the proposal harness's publish + NTE-gate
  + idempotency group is net-new (modelled on the publish data-layer directly).
- **Mock strategy:** the invoice harness uses the **env mock** (`INVOICE_CREATOR_MOCK=1`), not a
  `PROVIDER_REGISTRY` override (that is Phase-25-only) → the proposal harness mirrors the env mock
  (`PROPOSAL_GENERATOR_MOCK=1`).
- **`db:check:feedback` (13/0) and `db:check:observability` (28/0) are tenant-isolated** → the new
  proposal roster/aggregate entries are empty for their seed tenants; neither harness needs a fixture
  change.

## Outcome

Firmed entirely on live facts. The proposal generator was built across **6 batches** (0048 → consumer
seal → agent + NTE gate → analytics → actions + preview → harness) and proven by `db:check:proposal`
**15/0** (money-safety + NTE gate + idempotency + harvest/approve-as-is/volume), with the other two
ledgers green and unchanged. This sweep is the v2 analogue of `v2-17a-inspection-report.md` for the
proposal arc.
