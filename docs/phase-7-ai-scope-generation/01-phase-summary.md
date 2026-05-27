# Phase 7 — Phase Summary

## Phase Name
AI-Assisted Scope Generation

## Version
`v0.8.0-phase-7`

## Phase Goal
Help operators turn a job's short problem description into a structured, reviewable **scope of work** — and, doing so, **generalize the §2.9 agent substrate** into reusable per-tenant configuration (DB-stored prompts + policies) that every agent resolves at runtime. Ship the platform's **second agent** (`scope_generator_v1`) on the Phase 6 runner, retrofit the Phase 6 rewriter onto the same config substrate, and keep everything **draft-then-review-then-publish** (the agent never writes operational state).

## In Scope
- **Agent-config substrate (7b, migration `0013`):** `ai_prompt_templates` + `ai_prompt_template_defaults` + `agent_policies` + `agent_policy_defaults` — DB-stored, versioned prompts + policies, per-tenant with platform **defaults** (sibling tables, not nullable `tenant_id` — OQ #3). Replaces Phase 6's in-code `prompt.ts` + the inline `requires_review` literal.
- **Scope template forward-decls (7b, migration `0014`):** `scope_templates` + `scope_template_steps` — schema only, **no code path** (OQ #2 / the D-6.17 precedent).
- **Scope generation I/O (7b, migration `0015`):** `job_scope_drafts` + `job_scope_reviews` + `job_scope_steps` — specialized (settling D-6.16); draft = JSON working memory, published = relational child (OQ #5). **Zero `jobs` column changes** (the scope columns predate this phase — D-4.6).
- **The scope generator (7c steps 1–2):** `scope_generator_v1` on the shared runner — seed (`db:seed:agent-config`), the generic config **resolvers** (`resolveActivePrompt` fail-closed / `resolveAgentPolicy` fail-safe) + **single-active activate** write-fns (R-7.1), the narrowed `getJobDetail` tool surface (OQ #6), the `createScopeDraft`→…→`publishScopeDraft` substrate, and the **shared LLM routing** extracted from the rewriter (D-7.1).
- **The rewriter retrofit (7c step 3):** `update_rewriter_v1` migrated onto the same config substrate — its system prompt relocated to the seed, its inline policy replaced by `resolveAgentPolicy`; runner spines now parallel across both agents. `prompt_version` shifts `"v1"`→`"1"` (D-7.4).
- **The operator UI (7d + hotfix):** the **Scope of work** section on `/jobs/[id]` — generate trigger, three-group draft queue, the step-list editor (reorder/add/remove/rewrite/category/expectsPhoto), approve/reject/discard, publish, the published-scope display, and the gated-sibling discard (D-7.8 hotfix).

## Out of Scope (deferred)
- **Scope-template use** (apply-template path, few-shot grounding) → post-Phase-7, evaluated empirically (OQ #2; tables are empty schema).
- **Re-scope of a published job** → future workflow; the trigger is hidden + the `ScopeAlreadyPublished` gate refuses a second publish (L-7.7).
- **Auto-trigger on job creation** → generation is operator-manual only.
- **Per-client / auto-execute policy** → Phase 8+; the policy resolver is wired but **inert** in Phase 7 (always `queued_for_review`; no auto-execute branch — L-7.1).
- **`jobs.scope_generation_status='pending_review'`** → reserved-unused; UI derives pending state from `job_scope_drafts` (L-7.6 / D-7.5).
- **Historical-scope grounding / cross-job learning / RAG** → overlaps Phase 16 (OQ #6).
- **Role-gating** on generate/approve/publish, and **async/background** generation → future.

## Status
Complete. Branch `phase-7-scope-generation`, tag `v0.8.0-phase-7`. Builds on Phase 6 (`v0.7.0-phase-6`). **All seven literal §8 Phase 7 acceptance criteria met** — no literal gap this phase (the one tracked gap, the edited-publish two-column divergence, was **resolved + verified** in 7d.3 — L-7.4). The literal-acceptance review is in `11-closeout.md`. Verified across **six scripted runs (79 assertions)** + an all-pass operator manual smoke.

## Pointers
- Decisions: `02-decisions.md` — the 7a design-proposal locks (summary + pointer) + implementation decisions D-7.1 … D-7.8 + Q-7.1.
- The "why" behind the flows: `05-system-workflows.md` (WF-7.1 … WF-7.7), `06-business-rules.md` (R-7.1 … R-7.3).
- Chatbot source-of-truth: `07-chatbot-knowledge.md` (K-7.1 … K-7.11).
- DB changes (migrations 0013–0015): `08-db-changes.md` · API/actions/data-layer: `09-api-routes.md`.
- Operator + admin procedures: `03-user-sop.md`, `04-admin-sop.md`.
- Known limitations + carry-forwards: `10-known-limitations.md` (L-7.1 … L-7.8).
- Closeout, the verification chronicle, the literal-acceptance review, and process observations: `11-closeout.md`.
- The pre-implementation design: `7a-design-proposal.md`.
