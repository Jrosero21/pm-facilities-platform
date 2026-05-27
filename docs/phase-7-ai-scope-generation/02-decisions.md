# Phase 7 — Decisions

Decisions locked during Phase 7. Builds on Phase 0–6 decisions. The phase's **design** decisions (the 10 surfaces + 6 open questions) were settled up front in `7a-design-proposal.md` and are summarized first with pointers; the **construction** decisions that accumulated as the substrate, agent, retrofit, and UI were built are recorded as **D-7.1 … D-7.8** with full rationale. Identifiers use the established 6-phase numeric registry convention (the lettered forms used informally in gate review are aligned here).

## Design-proposal locks settled in 7a (full rationale in `7a-design-proposal.md`)

These are the architectural locks settled **before any code was written**; full options-considered + recommendation + consequences live in the design proposal's surface sections. Summarized here with pointers (not re-numbered) — they belong to the design artifact.

- **Specialized scope-draft substrate** — `job_scope_drafts` + `job_scope_reviews`, *not* a shared `agent_drafts` table and *not* a thin header-table-plus-payload variant. The generic cross-agent layer is the **agent substrate** (`agent_runs`/`tool_calls`/`decisions`), already inherited; draft I/O diverges structurally (text-blob→comm vs ordered-steps→job), so specialization is confirmed. **This resolves the deferred D-6.16.** (Surface #1.)
- **DB-stored versioned prompts** (`ai_prompt_templates`) replace Phase 6's in-code `prompt.ts`; **`agent_policies`** replace the inline `requires_review` literal. (Surfaces #2/#3.)
- **Defaults live in sibling tables, not via nullable `tenant_id`** — tenant config keeps `tenant_id` NOT NULL; platform defaults live in `ai_prompt_template_defaults` / `agent_policy_defaults`; the resolver falls through tenant → defaults. Preserves the multi-tenancy invariant (no `OR tenant_id IS NULL` polluting every query). (OQ #3.)
- **`scope_templates` / `scope_template_steps` shipped empty-schema only** — roadmap §9 core tables created as forward-decls; **no seed, no UI, no code path reads them** in Phase 7. (OQ #2; the D-6.17 forward-decl precedent. See L-7.* for what's deferred.)
- **`job_scope_drafts.status` mirrors `update_rewrite_drafts.status` 1:1**; `jobs.scope_generation_status` is a reduced job-rollup vocab (`not_started`/`pending_review`/`approved`). (Surface #5 / OQ #4.)
- **Draft = JSON working memory; published = relational child** — `proposed_steps`/`edited_steps` are JSON on the draft/review; `job_scope_steps` is the canonical relational record at publish. (OQ #5.)
- **Current-job-context-only reads** — the scope agent reads problem description + client/location/trade/priority via `getJobDetail`; no historical-scope retrieval, no template grounding, no RAG. (OQ #6.)
- **Staged rewriter retrofit** — build+seed scope-gen → wire+verify on the new agent → *then* migrate the rewriter onto the substrate; abortable to a 7.x follow-up with a documented paper trail. (OQ #1 / Surface #8; executed in 7c steps 1–3.)

## Implementation decisions surfaced during construction

Decisions that emerged mid-build, with consequences the design proposal didn't anticipate (`AGENT_MOCK` precedence, the `v1`→`1` provenance shift, substrate-table UI derivation, the discard state-machine divergence). Full entries, in the established `D-N.x` registry form.

## D-7.1 — `AGENT_MOCK` is a global mock override; per-agent mock vars unchanged
- **Why:** the D4 routing extraction (`resolveAgentRouting`) needed a way to mock all agents at once (CI/dev) without disturbing each agent's existing knob.
- **How to apply:** precedence is *any* of the per-agent mock var (`REWRITER_MOCK` / `SCOPE_GEN_MOCK`) **or** the global `AGENT_MOCK` set to `"1"` → mock path; else gateway (`AI_GATEWAY_API_KEY`) → direct (`ANTHROPIC_API_KEY`) → mock. The rewriter's behavior is **byte-identical to pre-extraction only when `AGENT_MOCK` is unset** (the default) — documented at the resolver and asserted in the D6 routing-parity matrix. (R-6.25 inherited.)

## D-7.2 — `generated_scope_of_work` and `approved_scope_of_work` are distinct, both written at publish
- **Why:** the job needs both the **raw AI artifact** (for audit / future learning) and the **operator-approved final** (for dispatch / downstream), and they differ whenever the operator edits.
- **How to apply:** `publishScopeDraft` writes **both** at publish — `generated_` = flat-render of the draft's immutable `proposed_steps`; `approved_` = flat-render of `edited_steps ?? proposed_steps`. The agent never writes either (R-6.15 / R-7.2): both are written by the human-gated publish. On a no-edit publish they are identical by construction; on an edited publish they **diverge** (verified, see L-7.4).

## D-7.3 — `approved_scope_of_work` is a derived view, not a source of truth
- **Why:** forecloses the failure mode where a future read path parses the flat text to reconstruct steps.
- **How to apply:** the **canonical** structured record is `job_scope_steps`. The flat `jobs` text columns are human-readable mirrors (numbered, instruction-only — no category/photo markers) for consumers that can't read structured data (dispatch display, future vendor email, external portal sync). Any consumer needing per-step structure reads `job_scope_steps` directly; reconstructing structure from the text is unsupported. (R-7.2.)

## D-7.4 — The rewriter's `prompt_version` transitions `"v1"` → `"1"` at the retrofit boundary
- **Why:** pre-retrofit, the rewriter recorded the code constant `PROMPT_VERSION="v1"`; post-retrofit it records the DB row's `version` (an int, serialized `"1"`). This is the **correct provenance signal** that the rewriter now resolves from the substrate — backfilling old runs to `"1"` would falsely claim they resolved from a substrate they didn't.
- **How to apply:** accept the discontinuity; the keeper re-verification asserts **output behavior unchanged**, not `prompt_version` string-identity. Analytics filtering rewriter runs by `prompt_version` must accommodate the `"v1"`→`"1"` boundary. (7c step 3 / S1.)

## D-7.5 — The operator UI derives scope state from the substrate tables, not the status rollup
- **Why:** `jobs.scope_generation_status` would need `draft_pending_review` written + revert-on-discard bookkeeping to be a reliable pending-state source (L-7.6); the substrate already holds the truth.
- **How to apply:** the Scope-of-work section reads **`job_scope_drafts`** for pending/approved/dismissed state and **`job_scope_steps`** for published state (`length > 0` ⇒ published). It does **not** read `scope_generation_status`. Name this as a Phase 7 UI principle — one convention, not per-feature decisions. (Depends on R-7.2; relates to L-7.6.)

## D-7.6 — Hidden trigger / gated state is *explained*, not silently hidden
- **Why:** an absent "Generate scope" button on a published job, or a gated approved sibling, would otherwise read as a mystery — the operator can't tell intent from bug.
- **How to apply:** when a job has a published scope, the section shows a one-line note (*"Scope published. Re-scope is not yet supported."*) instead of just dropping the trigger; a gated approved sibling shows *"Scope already published for this job. This draft can no longer be published. Discard or leave as history."* + a Discard control. Discoverability over minimalism for state-explanation cases. (L-7.7.)

## D-7.7 — Substrate invariants are enforced at the data-layer write boundary, not the action wrapper
- **Why:** any future write path (CLI, re-scope workflow, migration, repair script) must inherit the invariant by virtue of reaching the substrate — not re-implement it per caller.
- **How to apply:** F3 single-active (R-7.1), `DraftNotApproved` (re-check after the draft lock), and `ScopeAlreadyPublished` (re-check after the job lock, L-7.7) all live **inside the data-layer transaction**. The action wrapper's role is to surface the resulting error code with operator-facing messaging. (R-7.1, R-7.2.)

## D-7.8 — The scope-generator's discard accepts `pending_review` OR `approved`; the rewriter's stays pending-only
- **Why:** a scope **approved** draft can become non-publishable after a sibling publishes (the L-7.7 gate) — a stranded approved sibling needs a disposal path. The rewriter has no equivalent stranding case (its approved drafts are always publishable).
- **How to apply:** `discardScopeDraft` allows `pending_review`→`discarded` and `approved`→`discarded`; terminal states (`rejected`/`discarded`/`published`) throw the new `DRAFT_NOT_DISCARDABLE`. The rewriter's `discardDraft` is unchanged (`pending_review` only, `DRAFT_NOT_PENDING_REVIEW`). Distinct error codes for distinct state machines — **substrate-driven divergence, not UX-creative.** (7d hotfix.)

## Q-7.1 — When does `db/seeds/agent-config.ts` split into per-agent seed files? (open)
- Two agents' prompts + policies fit one file cleanly; three is borderline; five+ wants per-agent files. **Lean: split when a third agent lands** — decide at the triggering agent, not pre-decide here. (Captured in a code comment in the seed; surfaced as the phase's one open question.)
