# Phase 27 — API Routes / Server Actions

**No HTTP routes.** Everything is server actions + server functions. The actions are **referenced-only**
this phase (no component imports them yet — a rendered surface is CF-27.6), exactly as Phase 26 shipped
the invoice actions.

## Server actions — `src/app/(app)/jobs/proposal-actions.ts`

All `"use server"`; all resolve identity via `requireTenant()` →
`ctx.activeTenant.tenantId` + `ctx.user.id`; `{ error: string } | null` state; `revalidatePath`.

| action | calls | key error mapping |
|---|---|---|
| `generateProposalAction(jobId)` | `runProposalGenerator` | `JOB_NOT_FOUND`, **`JOB_NOT_BILLABLE`**, `NoActivePromptError` (fail-closed config msg) |
| `approveProposalDraftAction(jobId, draftId, _prev, formData)` | `resolveEditedProposal` → `createProposalReview(decision:"approve", editedContent)` | `PROPOSAL_REQUIRES_LINES`, `INVALID_LINE_NUMBERS`, `MALFORMED_PROPOSAL`, `DRAFT_NOT_PENDING_REVIEW`/`NOT_FOUND` — records the review only; does NOT publish |
| `rejectProposalDraftAction(jobId, draftId, _prev, formData)` | `createProposalReview(decision:"reject", reviewNotes)` | required reason; pending/not-found |
| `discardProposalDraftAction(jobId, draftId)` | `discardProposalDraft` | `DRAFT_NOT_DISCARDABLE`/`NOT_FOUND` |
| `publishProposalDraftAction(jobId, draftId, _prev, formData)` | `publishProposalDraft({…, forceClientReview})` | `ProposalAlreadyMaterialized`, `DraftNotApproved`, **`ProposalRequiresPricing`**, `DRAFT_NOT_FOUND`/`JOB_NOT_FOUND`. `forceClientReview` parsed from formData (`"true"`/`"on"`/`"1"`). |
| `previewProposalRoutingAction(jobId, draftId, serializedLines)` | read-only: `resolveEditedProposal` → `resolveClientMarkupDefault` → `computeArLines` → `getEffectiveNte` → `decideProposalKind` | returns `{ ok, total, effectiveNte, willRoute, willRouteIfForced:"client" }`; **no writes** |

## Server functions (the data + agent layer)

- **Agent entrypoint** — `runProposalGenerator(tenantId, jobId, triggeredByUserId?)`
  (`src/server/agents/proposal-generator/index.ts`): the fixed pipeline on the shared runner; always
  queues.
- **LLM** — `generateProposal(...)` (`.../llm.ts`): the number-free zod schema + `generateProposal`;
  routing `PROPOSAL_GENERATOR_ROUTING` (mock/gateway/direct); reuses `buildCandidates` /
  `runWithFailover` / `buildFewShotMessages`.
- **Drafts** — `getProposalDraft`, `createProposalDraft`, `listProposalDraftsForJob[Detailed]`,
  `discardProposalDraft` (`.../drafts.ts`).
- **Reviews** — `getApproveReviewForProposalDraft`, `createProposalReview` (`.../reviews.ts`).
- **Edits** — `resolveEditedProposal(rawJson, proposed)` (`.../edits.ts`, pure): validates ≥1 priced
  line, computes `edited_content` null-if-unchanged.
- **Publish** — `publishProposalDraft({...})` (`.../publish.ts`): the NTE gate + materialize.
- **Errors** — `DraftNotApproved`, `ProposalAlreadyMaterialized`, `ProposalRequiresPricing`
  (`.../errors.ts`).
- **NTE routing (pure)** — `decideProposalKind(total, effectiveNte, forceClientReview)`
  (`src/server/billing/proposal-routing.ts`) — shared by publish + the preview.

## Reused billing/job functions (not authored this phase)

`createProposal` (now kind-aware), `addProposalLineItem`, `recalculateProposalTotals`,
`resolveClientMarkupDefault`, `getEffectiveNte`, `computeArLines` (newly **exported** from
`billing/totals.ts`), `getProposal`, `listProposalLineItems`, `getJobDetail`.

## Analytics readers (Phase-24 / Phase-25 wiring)

- `proposalApproveAsIs(tenantId)` + a 5th `agentApproveAsIs` row (`agent-observability.ts`).
- `proposalCorrectionPairs(tenantId)` + `AgentId` union / `correctionPairsForAgent` /
  `allCorrectionPairs` arms (`correction-pairs.ts`).
- New pure utils: `normalizedLevenshtein` (`analytics/text-distance.ts`); `phrasingOnly` +
  `PROPOSAL_PHRASING_GOLD_MAX` / `PROPOSAL_PHRASING_NEGATIVE_MIN` (`analytics/proposal-phrasing.ts`).

## Harness

`scripts/check-phase-27.ts` (`pnpm db:check:proposal`) — sandbox-only, 15/0.
