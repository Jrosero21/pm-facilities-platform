# Phase 7 — Closeout

**Phase:** 7 — AI-Assisted Scope Generation
**Version / tag:** `v0.8.0-phase-7`
**Branch:** `phase-7-scope-generation`
**Status:** Complete.

---

## Phase Goal (roadmap §8)
> Help operators generate structured technician scopes from short issue descriptions.

Delivered: the platform's **second agent** (`scope_generator_v1`) turns a job's problem description into a reviewable, editable, ordered scope of work — built on a **generalized agent-config substrate** (DB-stored versioned prompts + policies) that also now backs the Phase 6 rewriter. AI output stays a **draft** until an operator approves and publishes (§2.9).

## Completed Deliverables (roadmap §8 deliverable list)
| Roadmap deliverable | Delivered as |
| --- | --- |
| scope template model | `scope_templates` + `scope_template_steps` (migration `0014`, empty schema — OQ #2) |
| scope steps model | `job_scope_steps` (migration `0015`, relational published scope) |
| AI scope generation endpoint or service | `scope_generator_v1` (`runScopeGenerator`) on the shared runner + `generateObject` LLM path |
| operator review/edit/approve flow | the **Scope of work** section on `/jobs/[id]` (generate → review/edit → approve → publish) |
| approved scope saved to job | `publishScopeDraft` → `job_scope_steps` + `jobs.approved_scope_of_work` / `scope_generation_status='approved'` |
| AI generation logging | `agent_runs`/`agent_tool_calls`/`agent_decisions` (Phase 6 substrate, reused) |
| generic agent infrastructure reusable by future AI workflows | the agent-config substrate (`ai_prompt_templates`/`_defaults` + `agent_policies`/`_defaults`) + the config resolvers + shared LLM routing; **rewriter retrofitted onto it** |
| phase docs | this set (01–11 + `7a-design-proposal.md` + `manual-smoke-7d.md`) |

## Literal-Acceptance-Criterion Review (R-6.23)
Each roadmap §8 acceptance line, quoted verbatim, against shipped evidence:

| # | Acceptance criterion (verbatim) | Met? | Evidence |
| --- | --- | --- | --- |
| 1 | "Operator can generate draft scope from problem description." | ✅ | **Generate scope** trigger → `generateScopeAction` (→ `runScopeGenerator`) → a pending `job_scope_drafts` row (Job #1/#2/#3 generated). |
| 2 | "Operator can edit generated scope." | ✅ | The step-list editor (reorder/add/remove/rewrite/category/expectsPhoto); verified 7d.2 (13/13) + 7d.3 (Job #2 edited 14→8). |
| 3 | "Operator can approve scope." | ✅ | `approveScopeDraftAction` → `job_scope_reviews` + draft `approved`; reject/discard paths verified 7d.2. |
| 4 | "Approved scope is stored on job." | ✅ | `publishScopeDraft` writes `job_scope_steps` + `jobs.approved_scope_of_work` + `scope_generation_status='approved'` (3 jobs published). |
| 5 | "Generation is logged." | ✅ | Each run = an `agent_runs` row + `agent_tool_calls` (`getJobDetail`) + `agent_decisions` (disposition); keeper run `019e6653-…` documented. |
| 6 | "AI output is not treated as final until reviewed." | ✅ | The agent has **no write path** to `job_scope_steps` (R-7.2 / §2.9); disposition is always `queued_for_review` (L-7.1); publish is operator-gated. |
| 7 | "Phase docs updated." | ✅ | This 11-doc set + design proposal + smoke checklist. |

**No literal gap this phase.** (Contrast Phase 6, where criterion #3 had a literal gap.) The one item tracked through the build — the edited-publish two-column divergence — was **resolved + verified** in 7d.3 (L-7.4), not deferred.

## Files Created / Changed
**Schema (7b):** `src/server/schema/{agent-config,scope-templates,job-scope}.ts` + barrel exports; migrations `0013_dark_nemesis`, `0014_yummy_wong`, `0015_salty_katie_power`.
**Agent + config (7c):** `src/server/agents/config/{prompts,policies,errors}.ts`, `src/server/agents/llm-routing.ts`, `src/server/agents/scope-generator/{index,llm,tools,drafts,reviews,publish,steps,edits,errors}.ts`, `src/server/agents/registry.ts`, `db/seeds/agent-config.ts`.
**Rewriter retrofit (7c step 3):** `src/server/agents/update-rewriter/{index,llm,prompt}.ts`.
**UI (7d + hotfix):** `src/app/(app)/jobs/scope-actions.ts`, `src/components/{generate-scope-button,scope-drafts-section}.tsx`, `src/app/(app)/jobs/[id]/page.tsx`.
**Cross-phase correction (rides this docs commit):** `src/server/schema/jobs.ts:36` comment `D-4.2`→`D-4.6` — a miscitation that originated in Phase 4 code and propagated into a Phase 7 doc draft; caught by inbound-reference verification (see Process Observations).

## Database Changes
3 migrations, **9 new tables**, **0 `jobs` column changes** (the scope columns predate this phase — D-4.6). Full detail in `08-db-changes.md`. After Phase 7: **16** recorded migrations (`0000`–`0015`). Seed: `db:seed:agent-config` (platform defaults only). Single-active write-path invariant (R-7.1) on prompts + policies, enforced in the data layer (no DB unique on `agent_policies`).

## API / Server Actions
5 server actions (`generateScopeAction` / `approveScopeDraftAction` / `rejectScopeDraftAction` / `discardScopeDraftAction` / `publishScopeDraftAction`) + the data layer (the `createScopeDraft` → `createScopeReview` → `publishScopeDraft` substrate) + the rewriter retrofit deltas. Full detail in `09-api-routes.md`.

## Workflows, Rules, Knowledge
- Workflows: `05-system-workflows.md` (WF-7.1 … WF-7.7).
- Business rules: `06-business-rules.md` (R-7.1 single-active write-path; R-7.2 `job_scope_steps` single-writer; R-7.3 config-resolution fail modes).
- Chatbot knowledge: `07-chatbot-knowledge.md` (K-7.1 … K-7.11 + worked examples).
- Operator SOP: `03-user-sop.md` (SOP-7.1 … SOP-7.6). Admin SOP: `04-admin-sop.md` (SOP-7.A … SOP-7.G).

## Verification Performed (the chronicle)
Gate-by-gate, every gate verified before the next opened:

| Gate | Commit | Verification |
| --- | --- | --- |
| 7a — design proposal | `609bfc5` | 10 surfaces settled + 6 open questions locked under review (no code). |
| 7b — schema gate (0013–0015) | `c459696` | migrations-only; the three applied **byte-identically from-scratch** (fresh-migration check); FK prefixes ≤ 64 chars. |
| 7c steps 1–2 — `scope_generator_v1` + config layer + F3 + D4 routing extraction | `ed3b669` | **32/32** scripted assertions. Keeper = **Job #1** (`019e603a-…`), 9-step no-edit scope, run `019e6653-de85-753c-8b6b-48145f0b5bcd`. |
| 7c step 3 — rewriter retrofit | `d0bcf95` | **10/10** scripted assertions; `prompt_version` `"v1"`→`"1"` provenance boundary confirmed (D-7.4). |
| 7d.1 — generate + draft queue | `0c589a2` | **5/5**. Job #2 (`019e61b8-…`) draft `019e66f7-9f74-737e-869b-4f2c2b8de465`. |
| 7d.2 — review / edit / approve / reject / discard | `0c589a2` | **13/13**. |
| 7d.3 — publish + the two-column divergence (L-7.4) | `0c589a2` | **14/14**. Job #2 published **8 edited** steps; `columns_equal`: #1=1 (no-edit), #2=0 (edited). |
| 7d hotfix — gated-approved-sibling discard (D-7.8) | `b53fbcf` | **5/5**. |
| Manual operator smoke | (run on `b53fbcf`) | **All pass** (`manual-smoke-7d.md`). Created a fresh job — **Job #3** — and published a **16-step** AI-generated scope end-to-end. |

**Total scripted assertions across the phase: 79**, in six runs (32 + 10 + 5 + 13 + 14 + 5), plus the all-pass operator manual smoke. Final job states: **#1** approved / 9 / `ai_generated` · **#2** approved / 8 / `edited` · **#3** approved / 16 / `ai_generated`.

## Known Limitations & Carry-Forward
See `10-known-limitations.md` — L-7.1 … L-7.8 (L-7.4 resolved). Highest-leverage carry-forwards: per-client / auto-execute policy (L-7.1, the resolver is inert today), scope-template use (OQ #2, empty schema), and re-scope of a published job (L-7.7).

## Process Observations — PO-7.1 (the gate rhythm caught three errors before they shipped)
The strict design→schema→staged-build→UI→docs gate cadence, plus a final inbound-reference verification pass on the docs, surfaced three distinct errors **before** any reached the published tag:

1. **The DEC-D planning error (7d.3).** A "third fresh job" instruction contradicted the locked fixture decision (only two jobs existed, and the second's reserved draft was the intended edited-publish fixture). I halted and surfaced the contradiction rather than improvising a third job; the user confirmed Option A (use Job #2's reserved draft) and retracted DEC-D as a planning slip.
2. **The DEC-C stranded-sibling gap (checklist finalization).** A "Discard" gate-note promised an operator action the UI didn't actually offer for an *approved* sibling draft (one gated by `ScopeAlreadyPublished`) — it would strand with no control. Caught while finalizing the smoke checklist → closed by a hotfix (D-7.8: `discardScopeDraft` accepts an approved draft; `DRAFT_NOT_DISCARDABLE`).
3. **The propagated miscitation (docs batch, cluster B).** The inbound-reference verification, applied to cluster B's draft, surfaced a propagated miscitation **originating in Phase 4 code**: `08-db-changes.md` cited `D-4.2` ("nullable description") for the no-`jobs`-column-change fact, when the governing decision is `D-4.6` ("`scope_generation_status` varchar; Phase 7 owns the rest"). The same wrong citation lived in the source comment at `jobs.ts:36`. Fixed in `08` **and** at the root in `jobs.ts:36` (rides this docs commit with a message callout) — so the correction lands at its origin, not just downstream.

Cluster D drafting itself caught one additional author-error (an arithmetic miscount in the cluster D spec — a partial sum, "37", mistaken for the assertion total; the actual total is 79). The recurrence is consistent with PO-7.1's pattern rather than expanding it — same defense-layer dynamic, fourth instance — so the formal count stays at three (the three above establish the pattern across three distinct defense layers; a fourth instance of the same pattern adds bulk without new insight).

Takeaway for future phases: keep the hold-at-each-gate rhythm and run an explicit inbound-reference pass on the docs — two of these three would have shipped silently otherwise.

## Recommended Next Phase Focus (Phase 8)
- **Activate the policy substrate** — the resolver, tables, and decision dispositions are built but inert (L-7.1/L-7.5); Phase 8 is the natural place to seed a real per-client policy and implement the auto-execute branch.
- Build the **admin activation UI** over `activatePromptTemplate`/`activateAgentPolicy` (data-layer-only today — SOP-7.C) so prompt/policy versioning isn't a developer-only operation.
- Carry the **R-7.1 single-active write-path** discipline and the **gate-rhythm + inbound-reference** verification practice (PO-7.1) into Phase 8.
