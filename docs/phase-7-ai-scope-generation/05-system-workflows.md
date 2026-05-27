# Phase 7 — System Workflows

How scope generation, the config substrate, and the publish path flow at runtime, and **why** each step is shaped the way it is. Mechanics-only descriptions live in `09-api-routes.md`; table shapes in `08-db-changes.md`; this file is about reasoning. Builds on the Phase 6 agent runner (`openRun → registerTool → logDecision → closeRun`, WF-6.6/6.7) and the draft→review→publish gate (WF-6.8/6.9). The new shapes: **runtime config resolution**, the **second agent on the shared runner**, the **structured-steps draft→publish substrate**, and the **single-active activate** write.

## WF-7.1 — Resolve config at run time (prompt + policy)
```
resolveActivePrompt(tenantId, agentId, variant='default')
   → (tenant row, status='active')?  else (defaults row, status='active')?  else THROW NoActivePromptError
resolveAgentPolicy(tenantId, agentId, clientId?)
   → (tenant, client, agent)?  else (tenant, NULL, agent)?  else defaults(agent)?  else { requiresReview: true }
```
**Why this shape:**
- *Defaults via sibling tables, not nullable `tenant_id` (OQ #3):* a platform-provided agent works for every tenant with no per-tenant row, and every tenant-scoped query stays clean (no `OR tenant_id IS NULL`). The fall-through is the only place "global default" lives.
- *Opposite fail-modes because opposite risks (R-7.3):* a **missing prompt fails closed** (the run can't honestly proceed — a stale code constant would make `prompt_version` lie); a **missing policy fails safe** to `requiresReview:true` (absence must never mean auto-execute, §2.9). The **mock path is a third branch** — it skips prompt resolution and records `prompt_version='mock'`, so fail-closed never fires in dev.
- *Parse at the boundary (R-6.19):* `policy` is `longtext` on MariaDB; `resolveAgentPolicy` `JSON.parse`s it, so `policy.requiresReview` is read against a real object, not a truthy string.

## WF-7.2 — Generate a scope (`scope_generator_v1`, the second agent)
```
GenerateScopeButton → generateScopeAction(jobId) → runScopeGenerator({ tenantId, jobId, triggeredByUserId })
  ctx = openRun(agent_id='scope_generator_v1', triggerSource='operator_manual')
  try:
    job = getJobDetail (read tool — auto-logged)           ← current-job context ONLY (OQ #6)
    routing = resolveScopeRouting()
    if real: prompt = resolveActivePrompt(...) → systemPrompt, version, temperature   else: promptVersion='mock'
    { object, usage, model } = generateScope({ routing, systemPrompt, job, temperature })   ← generateObject(scopeSchema)
    policy = resolveAgentPolicy(tenantId, 'scope_generator_v1', job.clientId)
    logDecision('scope_proposal', confidence, policyCheck, disposition='queued_for_review', metadata={stepCount, assumptions})
    createScopeDraft (write tool — the ONE write; proposed_steps, status='pending_review')   ← auto-logged
    closeRun(succeeded, model, promptVersion, tokens)
  catch e: closeRun(failed, errorMessage=e.message); throw   ← surfaced inline by the action, not crashed
```
**Why this shape:**
- *Fixed pipeline, read-broad/write-narrow (inherits D-6.12):* identical spine to the rewriter (WF-6.7) — context in, transform, one draft out. The agent's only write is `job_scope_drafts` at `pending_review`; it has **no path** to `job_scope_steps` or job columns (R-7.2, generalizing R-6.15). Tool surface is narrow (one read) because OQ #6 scoped the inputs to the current job.
- *Disposition is always `queued_for_review`:* the policy is resolved (proving the wiring + failing safe), but Phase 7 implements **no auto-execute path**, so the agent always queues (§2.9). The dormant `auto_executed`/`policy_blocked` dispositions are L-7.1.
- *Manual trigger only:* no auto-generate on job creation (Surface #10) — that would need policy gating + intake-review semantics outside this phase.

## WF-7.3 — Review / edit / approve / reject / discard
```
ScopeDraftsSection (Pending review) → expand → step-list editor (reorder/add/remove/rewrite/category/expectsPhoto)
approve: approveScopeDraftAction(jobId, draftId, prev, formData)
   → resolveEditedSteps(serialize(steps), draft.proposedSteps):  validate (≥1 step w/ instruction → SCOPE_DRAFT_REQUIRES_STEPS)
                                                                  → editedSteps = changed-vs-proposed ? steps : NULL
   → createScopeReview(approve, editedSteps)   (2-row txn: lock draft → review + advance + audit INSIDE)
reject:  require reviewNotes → createScopeReview(reject, reviewNotes)
discard: discardScopeDraft (single-row + writeAuditLog OUTSIDE)
```
**Why this shape:**
- *Edit on the review, draft immutable (OQ #5):* `proposed_steps` stays the "what the AI produced" audit; the operator's edits land in `job_scope_reviews.edited_steps` (NULL when unchanged — carries "the operator touched it"). Effective published steps = `edited_steps ?? proposed_steps`. This is the rewriter's edit-on-review discipline (D-6.15) generalized from a text body to an ordered list.
- *Null-if-unchanged across the full affordance set (R-6.x edit-discipline):* `resolveEditedSteps` (pure, testable) compares length + per-position instruction/category/expectsPhoto, so any of the six affordances flips it to non-null (→ `source='edited'` at publish). The comparison is doc-commented as load-bearing — a future affordance must extend it in lockstep (else real edits misclassify as no-edit).
- *Validation server-side:* an empty list or empty-instruction step is refused (`SCOPE_DRAFT_REQUIRES_STEPS`) — a zero-step publish would render an empty `approved_scope_of_work`, and the operator's intent ("no scope" vs mis-edit) is ambiguous.

## WF-7.4 — Publish (the only `job_scope_steps` path)
```
PublishScopeForm → publishScopeDraftAction(jobId, draftId) → publishScopeDraft({ tenantId, draftId, actorUserId })
  guards: getScopeDraft (status='approved' else DraftNotApproved); getJob; effective = editedSteps ?? proposedSteps
  txn (parent-before-child, R-5.7/R-6.21):
    1. lock job FOR UPDATE
    2. lock draft FOR UPDATE (re-check 'approved' else DraftNotApproved)
    3. GATE: active job_scope_steps for the job?  → throw ScopeAlreadyPublished   (L-7.7, under the job lock)
    4. INSERT N job_scope_steps (source = edited ? 'edited' : 'ai_generated'; contiguous step_order)
    5. UPDATE jobs: generated_scope_of_work = flatten(proposed_steps); approved_scope_of_work = flatten(effective);
                    scope_generation_status = 'approved'
    6. UPDATE draft → 'published', published_at = now
    7. INSERT audit_logs (scope_draft.published)   ← INSIDE the txn
```
**Why this shape:**
- *The single human-gated path (R-7.2 / §2.9):* this is the **only** code that writes `job_scope_steps`, and it refuses anything not `approved`. The agent can never reach it.
- *Both job columns, derived, written here (D-7.2/D-7.3):* `generated_` is the raw AI artifact (flat of immutable `proposed_steps`); `approved_` is the operator-approved final (flat of effective). They diverge on an edited publish (verified, L-7.4). The flat text is a derived **view** — numbered, instruction-only; `job_scope_steps` is canonical.
- *The gate under the job lock (L-7.7 / D-7.7):* `publishScopeDraft` appends, so a second publish would duplicate the scope; checking active steps under the job lock serializes concurrent publishes and enforces one-scope-per-job at the write boundary (re-scope is deferred).

## WF-7.5 — Activate a config row (the single-active write-path invariant)
```
activatePromptTemplate / activateAgentPolicy ({ key, id }):
  txn:
    demote = UPDATE … SET status='archived' WHERE <key matches> AND status='active'   (NO LIMIT)
    assert demote.affectedRows <= 1   else SingleActiveInvariantViolated   (pre-existing corruption surfaces)
    promote = UPDATE … SET status='active' WHERE id=:id AND <key matches>
    assert promote.affectedRows == 1  else ActivationTargetMismatch
```
**Why this shape (R-7.1):**
- *No DB safety net on policies:* the nullable `client_id` + MariaDB NULL-as-distinct rule out a unique index, so single-active is **100% a write-path invariant**. The demote's `WHERE status='active'` excludes the new value, making `affectedRows` driver-mode invariant (a count-then-update would open a within-txn race the no-LIMIT-demote-and-assert shape doesn't have).
- *Invariant-preservation, not loser-detection (Dec-3b):* concurrent activations serialize on the row locks → last-writer-wins, exactly one active. A high-concurrency future (bulk onboarding/migration) should reconsider an optimistic-version loser-detection upgrade.
- Phase 7 seeds only platform **defaults** (single-row per key, F1), so the tenant-table activate path is built + verified but not exercised by seeds.

## WF-7.6 — Gated-sibling discard (the disposal path)
```
A job is published; a sibling draft was approved before the gate (e.g. two approved, one published). Publish
does NOT auto-discard siblings (L-7.8), so the approved sibling is left stranded — can't publish (L-7.7 gate),
and (pre-hotfix) couldn't be discarded either.
ApprovedScopeRow (publishDisabled) → note + DiscardScopeForm → discardScopeDraftAction → discardScopeDraft (approved → discarded)
```
**Why this shape (D-7.8):** a gated approved sibling can neither publish (L-7.7) nor — before the 7d hotfix — be discarded (discard was pending-only). The scope state machine therefore allows discard from `pending_review` **or** `approved` (`DRAFT_NOT_DISCARDABLE` for terminals); the UI shows the gate note **plus** the Discard control (the note names two options, the control makes one real — D-7.6). The rewriter's discard stays pending-only (no stranding case). Substrate-driven divergence.

## WF-7.7 — The rewriter retrofit (historical — one-time migration, 7c step 3 / `d0bcf95`)
*The only Phase 7 workflow that describes a **one-time operation**, not a recurring runtime flow: the migration ran once. Its result — `update_rewriter_v1` resolving prompt + policy from the substrate on **every** run — is permanent (and is the steady-state shape WF-7.1 describes for both agents).*
```
runRewriter: … routing = resolveRewriterRouting(); if real: prompt = resolveActivePrompt(tenantId,'update_rewriter_v1')
             generateRewrite({ routing, systemPrompt, temperature, note, job, vendorNames })
             policy = resolveAgentPolicy(...); logDecision(policyCheck from policy, disposition='queued_for_review')
```
**Why this shape:** Surface #8's staged retrofit moved the rewriter onto the **same** config substrate as the scope generator — its system prompt now lives in `ai_prompt_template_defaults` (relocated verbatim from `prompt.ts`), its policy in `agent_policy_defaults`; the inline `requires_review` literal and the in-code `SYSTEM_PROMPT`/`PROMPT_VERSION` are gone. The runner spines are now **structurally parallel** across both agents (the abstraction's payoff). One visible change: `agent_runs.prompt_version` records `"1"` (the DB version) for new runs, where it was `"v1"` — the DB-resolution provenance signal (D-7.4). Behavior is unchanged vs the Phase 6 keeper run (verified via layered assertions, 7c step 3).
