# Phase 7 — API Routes & Server Actions

## Pages (under the authenticated `(app)` route group)
Phase 7 adds **no new routes** — scope generation is a new **"Scope of work" section on the existing `/jobs/[id]` detail page** (server component), placed after *Problem description* and before *Dispatch*. The page's `Promise.all` now also loads **`listScopeDraftsForJobDetailed`** (the draft queue + its decision metadata) and **`listScopeStepsForJob`** (the published scope). Published-state (`scopeSteps.length > 0`) and pending-state are **derived from these substrate reads, not from `jobs.scope_generation_status`** (D-7.5).

## Server actions (`jobs/scope-actions.ts`)
All `requireTenant()` first, use `ctx.activeTenant.tenantId` + `ctx.user.id`, `revalidatePath('/jobs/[id]')`, and return `ScopeActionState = { error: string } | null`. Mirror `rewriter-actions.ts` one-to-one where the substrate matches.
- **`generateScopeAction(jobId)`** — calls `runScopeGenerator`; **LLM/provider errors caught and surfaced** (the run is already recorded `failed`); maps **`NoActivePromptError`** (instanceof) → "isn't configured (no active prompt)", `JOB_NOT_FOUND`, + generic `Scope generation failed: …`.
- **`approveScopeDraftAction(jobId, draftId, prev, formData)`** — reads the editor's serialized `editedSteps` JSON; `resolveEditedSteps` validates (≥1 step, each with instruction → `SCOPE_DRAFT_REQUIRES_STEPS`) and computes **null-if-unchanged** vs `proposed_steps`; `createScopeReview(approve)`. Maps `DRAFT_NOT_PENDING_REVIEW`/`DRAFT_NOT_FOUND` + the requires-steps message.
- **`rejectScopeDraftAction(jobId, draftId, prev, formData)`** — requires `reviewNotes`; `createScopeReview(reject)`.
- **`discardScopeDraftAction(jobId, draftId)`** — `discardScopeDraft`; maps **`DRAFT_NOT_DISCARDABLE`** (D-7.8) / `DRAFT_NOT_FOUND`.
- **`publishScopeDraftAction(jobId, draftId)`** — `publishScopeDraft`; maps **`ScopeAlreadyPublished`** (instanceof, L-7.7) / **`DraftNotApproved`** / `DRAFT_NOT_FOUND` / `JOB_NOT_FOUND`.

## Data layer (server-only modules)
- **`src/server/agents/llm-routing.ts`** (D4 extraction) — **`resolveAgentRouting(opts)`** (shared by both agents): mock if `opts.mockEnvVar` or global `AGENT_MOCK` → gateway (`AI_GATEWAY_API_KEY`) → direct (`ANTHROPIC_API_KEY`) → mock; `recordedModel` provider-qualified (D-7.1).
- **`src/server/agents/config/prompts.ts`** — **`resolveActivePrompt(tenant→default)`** (read; **fail-closed**, throws `NoActivePromptError`, R-7.3); **`activatePromptTemplate`** (write; single-active txn — demote-no-LIMIT + affected≤1 assert, then promote + affected==1 assert — R-7.1).
- **`src/server/agents/config/policies.ts`** — **`resolveAgentPolicy((tenant,client,agent)→(tenant,agent)→defaults)`** (read; **fail-safe** to `{requiresReview:true}`; **JSON.parse** at the boundary, R-6.19/R-7.3); **`activateAgentPolicy`** (write; single-active, NULL-aware `client_id` match — R-7.1).
- **`src/server/agents/config/errors.ts`** — `NoActivePromptError`, `SingleActiveInvariantViolated`, `ActivationTargetMismatch` (named, so the closeout test asserts the specific failure — R-6.23).
- **`src/server/agents/scope-generator/index.ts`** — `AGENT_ID`, **`runScopeGenerator`** (the fixed pipeline; the agent's only write is `createScopeDraft`).
- **`src/server/agents/scope-generator/llm.ts`** — `generateScope` (`generateObject` + `scopeSchema`), `resolveScopeRouting`, `buildScopeUserPrompt` (current-job context only, OQ #6), the `SCOPE_GEN_MOCK` stub.
- **`src/server/agents/scope-generator/tools.ts`** — `getJobDetailTool` (read), `createScopeDraftTool` (write) — registered through the runner (auto-logged).
- **`src/server/agents/scope-generator/drafts.ts`** — `createScopeDraft` (the agent write — **not** `audit_logs`), `getScopeDraft`, `listScopeDraftsForJob`, **`listScopeDraftsForJobDetailed`** (joins the `scope_proposal` decision; **parses `proposed_steps` + metadata**), **`discardScopeDraft`** (pending_review **or** approved → discarded; `DRAFT_NOT_DISCARDABLE`; single-row + `writeAuditLog` outside — D-7.8).
- **`src/server/agents/scope-generator/reviews.ts`** — `getScopeReview`, `getApproveReviewForScopeDraft` (parses `edited_steps`), **`createScopeReview`** (2-row txn: lock draft → review + advance + audit inside — R-6.7/R-6.21).
- **`src/server/agents/scope-generator/edits.ts`** — **`resolveEditedSteps`** (pure, testable: parse → validate `SCOPE_DRAFT_REQUIRES_STEPS` → null-if-unchanged across the full D3 affordance set; the comparison contract is doc-commented as load-bearing).
- **`src/server/agents/scope-generator/publish.ts`** — **`publishScopeDraft`** (the **only** `job_scope_steps` writer — R-7.2; parent-before-child txn: lock job → lock draft → re-check `approved` → **gate `ScopeAlreadyPublished`** → insert N steps + write both `jobs` text columns + `scope_generation_status='approved'` + advance draft + audit inside).
- **`src/server/agents/scope-generator/steps.ts`** — `listScopeStepsForJob` (active rows, ordered).
- **`src/server/agents/scope-generator/errors.ts`** — `DraftNotApproved`, `ScopeAlreadyPublished` (the publish-path named errors).
- **`src/server/agents/registry.ts`** — adds `scope_generator_v1` (`testOnly:false`, `inputSourceTypes:['job']`, `outputType:'job_scope_draft'`).
- **Rewriter retrofit (`src/server/agents/update-rewriter/`)** — `llm.ts` now exports `resolveRewriterRouting` and `generateRewrite({ routing, systemPrompt, temperature, … })` (resolution moved to the runner); `index.ts`'s `runRewriter` resolves prompt + policy from the substrate (drops the inline literal); `prompt.ts` is now `buildUserPrompt`-only (`SYSTEM_PROMPT`/`PROMPT_VERSION` deleted — relocated to the seed).

## Components
- **`GenerateScopeButton`** (per-job trigger; `useActionState`; "Generating…"; hidden when a scope is published — D-7.6).
- **`ScopeDraftsSection`** ("use client") — the three-group queue (Pending review / Ready to publish / Dismissed; published excluded) + the **step-list editor** (reorder ▲▼ bounded / remove × / rewrite / category select / expectsPhoto checkbox / + Add step; serializes to a hidden JSON input on Approve). Gated `ApprovedScopeRow` shows the note **+** a Discard control (D-7.6/D-7.8). Reuses `ConfidenceBadge`; imports `ScopeDraftDetailed`/`ScopeStep` as **types** (erases the server-only import).

## Conventions reinforced / added
- **Substrate invariants at the data-layer write boundary, not the action wrapper (D-7.7):** `DraftNotApproved`, `ScopeAlreadyPublished`, and the F3 single-active assertions all live inside the data-layer transactions; actions only surface the error code.
- **Fail-closed (prompts) / fail-safe (policies) / mock-skips (R-7.3)**; **single-active is a write-path invariant (R-7.1)**; **`job_scope_steps` single-writer (R-7.2)**.
- **Parent-before-child lock order (R-5.7/R-6.21)** reused for `createScopeReview` + `publishScopeDraft`; audit-inside-vs-outside by row count (R-6.7).
- **No-extra-param** actions stay `useActionState`-compatible; the LLM stays isolated behind `llm-routing.ts` + the per-agent `llm.ts` + the mock gate.

## Forward pointers
- **Phase 8** NTE negotiator — likely the first LLM-native tool-use agent; would seed a real `agent_policies` with auto-execute thresholds (exercising the dormant `auto_executed`/`policy_blocked` dispositions, L-7.1).
- **A scope-templates feature** would add an "apply template" path + few-shot grounding in `runScopeGenerator` (OQ #2 deferred).
- **A re-scope workflow** adds replace-semantics to `publishScopeDraft` (L-7.7) and a new write path that must honor R-7.2's UI-visible-state contract.
- **Q-7.1** — a 3rd agent triggers the `db/seeds/agent-config.ts` per-agent-file split.
