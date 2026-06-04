# Phase 27 Closeout — New Agents: the Proposal Generator

## Phase Goal
Continue the v2.9.0 "new agents" arc with the second agent — `proposal_generator_v1` (the 5th LLM
agent) — following the proven pattern: register → shared runner → reviewable draft → §2.5-v1 gate →
policy-able (Phase 23) → feedback-fed (Phase 25). The agent drafts a **number-free** proposal from a
job's context; the operator authors the pricing at the gate; at publish an **NTE send-gate** routes the
proposal to one of two flavors (`proposals.kind`): **internal** (operator-only billing record, within
the ceiling) or **client** (the client-facing priced document). v2.10.0-phase-27 · branch
`phase-27-proposal-agent`.

## Phase-number note
The v2 roadmap §5 named Phase 27 "AI-assisted dispatch (Tier 3, data-blocked on Phase 20)". That
dispatch agent is **data-blocked on B-16.4** (`vendor_performance_scores` empty). Per the roadmap §6
new-agents ordering (invoice → **proposal** → NTE negotiator), the **proposal generator took the
v2.10.0 / Phase-27 slot**; AI-assisted dispatch shifts to a later phase with its **data dependency
unchanged**. The live bank's B-16.4 note is corrected at this closeout.

## Completed Deliverables
- **Schema + migration (0048).** `proposal_drafts` + `proposal_reviews` (FK parity with the invoice
  pair); `proposals.kind enum('client','internal')` default `client`; `status += internal_billed`; the
  composite `prop_tenant_kind_status_idx`. Applied to prod with contract + FK verification (121 → 123).
- **Consumer write-path fixes (Batch 2).** The client-visibility **seal** (`status='sent'` AND
  `kind='client'`); `kind` on the proposal write paths (create + revision-inherits-kind); status
  buckets for `internal_billed` (not-live, not-withdrawable, terminal badge); an operator
  Client/Internal kind badge; the close-readiness `open_proposals` count gated to `kind='client'`.
- **The agent (`proposal_generator_v1`).** Registry entry; `runProposalGenerator` pipeline on the
  shared runner; a **number-free** zod schema; the **permissive billable-job eligibility gate**; always
  queues at `pending_review`. Draft/review/edits data layers (`createProposalDraft` — immutable
  `proposed_proposal`; `createProposalReview` — 2-row txn gate, audit inside; `resolveEditedProposal` —
  validates ≥1 **priced** line, null-if-unchanged).
- **Publish = materialize + NTE route.** `publishProposalDraft`: resolve markup once → **pricing guard
  (fails closed, `ProposalRequiresPricing`)** → `computeArLines` total → `decideProposalKind` →
  `createProposal({kind})` + `addProposalLineItem` → finalize txn (internal → `internal_billed` +
  `proposal.internal_billed` event; idempotency-guarded on `published_proposal_id` under the lock).
- **`decideProposalKind`** extracted as a pure helper (`billing/proposal-routing.ts`), shared by
  publish AND the read-only `previewProposalRoutingAction` (preview ≡ publish).
- **Phase-24 + Phase-25 wiring.** `proposalApproveAsIs` (+ a 5th `agentApproveAsIs` row);
  `proposalCorrectionPairs` (phrasing edit-distance signal, numbers stripped) wired into
  `correctionPairsForAgent`/`allCorrectionPairs`; few-shot wired into the agent. New pure utils
  `normalizedLevenshtein` + `phrasingOnly` (+ thresholds). Volume/cost free.
- **Server actions.** Six referenced-only actions (generate/approve/reject/discard/publish + the
  read-only routing preview).
- **Phase-blocking harness.** `scripts/check-phase-27.ts` (`db:check:proposal`) — real agent-under-mock
  for money-safety + the NTE gate + idempotency, direct-seed for harvest/approve-as-is.

## Files Created or Changed (by batch)
- **Batch 1 (schema):** new `src/server/schema/agents-proposal.ts`; changed
  `src/server/schema/proposals.ts` (kind/status/index), `src/server/schema/index.ts` (barrel);
  `db/migrations/0048_glorious_iron_patriot.sql`.
- **Batch 2 (consumers):** `src/server/billing/proposals.ts` (kind on create + revision; status-bucket
  comments), `src/server/client/list-client-job-proposals.ts` (the seal), `src/server/billing/close.ts`
  (`open_proposals` kind gate), `src/components/proposal-actions.tsx` (internal_billed terminal),
  `src/components/proposal-list.tsx` (kind badge + status style),
  `src/app/(app)/jobs/[id]/proposals/[proposalId]/page.tsx` (status style).
- **Batch 3 (agent):** new `src/server/agents/proposal-generator/{drafts,reviews,edits,tools,llm,prompt,errors,index,publish}.ts`;
  changed `src/server/agents/registry.ts` (entry), `src/server/billing/totals.ts` (export `computeArLines`).
- **Batch 4 (analytics):** new `src/server/analytics/{text-distance,proposal-phrasing}.ts`; changed
  `src/server/analytics/correction-pairs.ts`, `src/server/analytics/agent-observability.ts`.
- **Batch 5 (actions):** new `src/server/billing/proposal-routing.ts`,
  `src/app/(app)/jobs/proposal-actions.ts`; changed `src/server/agents/proposal-generator/publish.ts`
  (decideProposalKind extraction); new `scripts/check-phase-27.ts`; changed `package.json`
  (`db:check:proposal`).
- **Docs:** `docs/phase-27-proposal-agent/01..11` + `closeout-carryforwards.md`;
  `docs/roadmap/v2-27a-inspection-report.md`.

## Database Changes
Migration **0048** (`0048_glorious_iron_patriot.sql`) — two new tables + the `proposals` ALTER (kind,
status, composite index); applied to prod (121 → 123). FK on-delete: tenant/job/agent_run **CASCADE**,
published_proposal **SET NULL** (reviews: tenant/draft CASCADE, reviewer SET NULL). JSON columns
`proposed_proposal` / `edited_content` (MariaDB `longtext` + `json_valid`). Full detail in
`08-db-changes.md`.

## API Routes / Server Actions Added
No HTTP routes. Agent entrypoint `runProposalGenerator`; actions `generateProposalAction`,
`approveProposalDraftAction`, `rejectProposalDraftAction`, `discardProposalDraftAction`,
`publishProposalDraftAction`, and the read-only `previewProposalRoutingAction`. Pure helper
`decideProposalKind`. See `09-api-routes.md`.

## User-Facing Workflows Added
Generate on a billable job → review and **price** the draft (the operator authors the money; the AI
never does) → optional routing preview → approve/reject/discard → **publish** (under-NTE → internal
billing record; over-NTE/no-NTE/forced → client proposal). The AI output is a reviewable draft
throughout. (Rendered UI deferred — CF-27.6.) See `03-user-sop.md`.

## Admin/Internal Workflows Added
The agent is **gated by default** (`requiresReview` — no policy seeded) and always queues. NTE/HANDY
defaults to verify; markup default; observability (`applicable:true`, approve-as-is = approve AND
phrasing-distance ≤ gold); feedback thresholds single-sourced in `proposal-phrasing.ts`. See
`04-admin-sop.md`.

## Business Rules Added
BR-27.1 … BR-27.22 — kind/status; the client-visibility seal; number-free both ways (incl. publish
fails closed); the NTE send-gate (incl. the per-proposal-not-cumulative MVP limit, BR-27.15);
permissive eligibility; multiple-per-job; always-queues; the `internal_billed` event (§2.2);
idempotency; the phrasing feedback signal + number-free few-shot. See `06-business-rules.md`.

## Chatbot Knowledge Added
What the proposal generator is; the two flavors; the AI never prices; internal can't leak to a client;
can't publish without pricing; the NTE compare is per-proposal; always queues; what it does NOT do;
where the data lives. See `07-chatbot-knowledge.md`.

## Verification Performed

```bash
pnpm exec tsc --noEmit            # exit 0 (0 errors) — across all batches
pnpm lint                         # new/changed files clean (0 warnings/errors)

pnpm db:check:proposal            # PHASE-27 PROPOSAL LEDGER GREEN ✓ — passed: 15, failed: 0
                                  #   run 1 (fresh) 15/0; run 2 (idempotent re-run) 15/0
                                  #   GROUP M (money-safety): M1 number-free draft; M2 published total
                                  #     === computeArLines(editedContent + markup); M3 markup === rule;
                                  #     M4 approve-as-is (unpriced) → ProposalRequiresPricing, NO row
                                  #   GROUP N (NTE gate): N1 ≤NTE→internal+internal_billed event;
                                  #     N2 >NTE→client/draft; N3 null NTE→client; N4 force→client
                                  #   GROUP I: I1 double-publish → ProposalAlreadyMaterialized, 1 row
                                  #   GROUP H/A/V: buckets 2/2/1, gold-first selector, gold editedContent
                                  #     number-free; approve-as-is reviewed=5/approvedAsIs=2; volume free
pnpm db:check:feedback            # PHASE-25 FEEDBACK LEDGER GREEN ✓ — 13/0 (unchanged; tenant-isolated)
pnpm db:check:observability       # PHASE-24 OBSERVABILITY LEDGER GREEN ✓ — 28/0 (unchanged; tenant-isolated)

# Migration: sandbox apply → -E contract-verify → prod-confirm gate → prod apply.
#   Sandbox 121→123; prod 121→123; SHOW CREATE + REFERENTIAL_CONSTRAINTS matrix verified;
#   proposals.kind enum('client','internal') default 'client' + status internal_billed confirmed on prod.
```

The other two harnesses passing **unchanged** proves the additive correction-pairs/observability edits
did not disturb the shared `latestReviewPerDraft` primitive, and that the proposal harness tears down
cleanly (fully tenant-scoped — including the **published** `proposals`/`proposal_line_items`/
`job_billing_events`/`audit_logs` and the agent-child tables deleted explicitly under `FK_CHECKS=0`).

## Known Limitations
L-27.1 no rendered review UI (CF-27.6); L-27.2 per-proposal not cumulative NTE (CF-27.4); L-27.3 publish
non-atomic window (CF-27.3); L-27.4 phrasing edit-distance is a coarse quality proxy; L-27.5
scopePhrasing not a per-line column; L-27.6 no vendor NTE-increase (CF-27.1); L-27.7 no proposal→invoice
link (CF-27.2); L-27.8 no promote-internal-later (CF-27.5); L-27.9 single-shot until corrections
accumulate. See `10-known-limitations.md`.

## Carry-Forward Items
**Retires (further):** **B-16.5** ("LLM-assisted draft phrasing — provider seam +
`ai_prompt_templates`") — the **proposal generator's** per-agent share is now delivered. **Residual =
the NTE negotiator ONLY.** B-16.5 stays OPEN with that reduced residual; it does **not** fully
discharge. **Corrected:** the bank's **B-16.4** note (it pinned "Tier-3 AI dispatch, Phase 27" — the
proposal generator took that slot; dispatch shifts later, data dependency unchanged). **New:**
**CF-27.1** (vendor-initiated NTE-increase), **CF-27.2** (proposal→invoice link), **CF-27.3** (publish
non-atomic window, §2.6 accepted), **CF-27.4** (cumulative/remaining-NTE gate), **CF-27.5**
(promote-internal-to-client-later), **CF-27.6** (cross-agent draft-review UI — invoice + proposal).
Everything else rolls forward OPEN unchanged (CF-26.1/26.2, CF-25.1–25.4, CF-24.2, CF-23.1 [dep =
**CF-12.4**], CF-23.2, CF-22.x … the full bank). Full ledger in `closeout-carryforwards.md`.

## Recommended Next Phase Focus
**The NTE negotiator** — the last per-agent B-16.5 share, buildable now on the proven pattern
(highest-stakes / adversarial — gate longest, possibly forever). **OR** **AI-assisted dispatch (Tier
3)** once B-16.4 is dischargeable (Phase-20 vendor performance data accumulated) — late by necessity,
not just priority. Orthogonally, **CF-27.6** (the cross-agent draft-review UI for invoice + proposal) is
the natural surface pass that gives both agents a rendered home, and the **live autonomy trigger**
(CF-24.2) remains the standing "permission ≠ readiness" decision.
