# Phase 7 — Known Limitations & Carry-Forward

Limitations introduced or made explicit in Phase 7. Each entry: **what** (the boundary), **why** (the deliberate reason), **what lights it up** (the future trigger), and **refs**. Phase 1–6 limitations carry forward unchanged; the *how* of lighting these up is in `SOP-7.G`.

---

## L-7.1 — The policy resolver is wired but inert
**What:** Every scope generation resolves a policy and always disposes `queued_for_review`. There is no auto-execute branch in `runScopeGenerator` — the policy's `requiresReview` is effectively always-true under Phase 7's seeded defaults.
**Why:** §2.9 / OQ-locks: AI output is a reviewable draft this phase; per-client / auto-publish trust is a later, deliberate decision, not a Phase 7 default. The resolver + `agent_policies`/`agent_policy_defaults` tables + the `auto_executed`/`policy_blocked` decision dispositions are built **now** so the wiring exists, but no policy that skips review is seeded.
**Lights up:** Phase 8+, when a tenant/client earns auto-publish — seed a non-review `agent_policies` row + implement the auto-execute branch in the disposition mapping.
**Refs:** D-7.7, R-7.3, K-7.11, SOP-7.G.

## L-7.2 — Priority reaches the prompt as a bare label
**What:** `buildScopeUserPrompt` passes the job's priority as its display label (e.g. "Emergency", "Routine") with no SLA-tier / response-time semantics attached.
**Why:** Self-describing labels carry enough meaning for the LLM to weight urgency; encoding SLA tiers would couple scope generation to the (still-evolving) priority model prematurely.
**Lights up:** when a label→SLA-tier mapping is introduced and scope steps should reflect response-time obligations — extend the prompt builder.
**Refs:** 09-api-routes.md (data layer), 7a-design-proposal.md.

## L-7.3 — `source` on published steps is whole-set, not per-step delta
**What:** When an operator edits before publishing, **every** published `job_scope_steps` row is marked `source='edited'` — not just the rows that actually changed. A no-edit publish marks all rows `ai_generated`.
**Why:** The per-step delta is reconstructable after the fact (compare the draft's immutable `proposed_steps` against the published rows), so storing a per-row diff was unnecessary weight for Phase 7.
**Lights up:** AI-quality analytics that need a true per-step accept/edit rate — compute the delta from `proposed_steps` vs published, or add per-row provenance.
**Refs:** D-7.3, K-7.8.

## L-7.4 — Edited-publish two-column divergence — **RESOLVED (verified 7d.3)**
**What:** On an edited publish, `jobs.generated_scope_of_work` (the AI's original, from the draft's immutable `proposed_steps`) and `jobs.approved_scope_of_work` (the operator's edited set, from `edited_steps`) diverge — by design. This was carried as a tracked open item through the build (the "two-column divergence" question) and is **not a standing limitation**: it was confirmed empirically in 7d.3 against Job #2 (generated 14 / approved 8, `columns_equal=0`) and the no-edit case against Job #1 (`columns_equal=1`).
**Why it was tracked:** the divergence is intended (it preserves the AI's original for the record while the job carries the operator's truth), but the write-path had to be verified to actually populate both columns from the correct sources.
**Refs:** D-7.2, D-7.3, R-7.2, WF-7.4, SOP-7.E. (Resolved — listed here so the carry-forward record is complete, not as an outstanding gap.)

## L-7.5 — The rewriter's `review_not_required` branch is unreachable in Phase 7
**What:** After the retrofit, `update_rewriter_v1` resolves its policy via `resolveAgentPolicy`; the `requiresReview=false` (`review_not_required`) disposition exists in code but no seeded policy reaches it.
**Why:** Same as L-7.1 — Phase 7 seeds only review-requiring defaults; the branch is built for forward-use, not exercised.
**Lights up:** the first non-review-requiring rewriter policy (Phase 8+).
**Refs:** D-7.7, SOP-7.F.

## L-7.6 — `jobs.scope_generation_status='pending_review'` is reserved-unused
**What:** The job-level status moves `not_started` → `approved` (on publish) and never sits at `pending_review`. The UI derives "a draft is pending" from `job_scope_drafts`, not from this column.
**Why:** A denormalized job-level pending flag would need revert-on-discard bookkeeping (a discarded sole draft would have to roll the job back to `not_started`); deriving pending state from the draft rows avoids that entirely (D-7.5).
**Lights up:** analytics/list-filtering that wants a denormalized job-status filter — add the status transitions **plus** the revert-on-discard logic.
**Refs:** D-7.5, D-4.6, L-7.1.

## L-7.7 — No re-scope of a published job
**What:** Once a job has a published scope, the **Generate scope** trigger is hidden and a second `publishScopeDraft` is refused (`ScopeAlreadyPublished`). One published scope per job.
**Why:** Re-scope needs replace-semantics (retire-or-supersede the existing `job_scope_steps`, decide what happens to dispatch reads) — a workflow decision deferred out of Phase 7.
**Lights up:** a deliberate re-scope feature — add replace-semantics to `publishScopeDraft` + a path to retire the existing scope.
**Refs:** WF-7.6, SOP-7.6, SOP-7.G.

## L-7.8 — Publishing does not auto-discard sibling drafts
**What:** Publishing one draft leaves other pending/approved drafts on the job intact; the operator discards leftovers manually. The hotfix (D-7.8) gives a **gated approved** sibling (one blocked by `ScopeAlreadyPublished`) a discard path so it can't strand.
**Why:** Mirrors the Phase 6 rewriter's manual-cleanup posture; auto-discard-on-publish is a convenience deferred, and the hotfix closes only the *stranding* (an approved draft the UI previously offered no action on).
**Lights up:** an auto-cleanup-on-publish convenience — discard sibling drafts inside the publish txn.
**Refs:** D-7.8, WF-7.6, SOP-7.6, the 7d hotfix (`b53fbcf`).

---

## Carry-forward (active deferrals → future phases)
- **Scope templates** — `scope_templates`/`scope_template_steps` are empty schema (OQ #2); no apply-template / few-shot path. Light up per SOP-7.G when empirical results justify it.
- **Per-client / auto-execute policy** (L-7.1, L-7.5) → Phase 8+.
- **Historical-scope grounding / cross-job learning / RAG** → overlaps Phase 16 (OQ #6; `getJobDetail` is the only tool surface today).
- **Admin activation UI** over `activatePromptTemplate`/`activateAgentPolicy` (data-layer-only today — SOP-7.C).
- **Per-agent seed-file split** of `db/seeds/agent-config.ts` (Q-7.1).
- **Operator-facing cost/usage view** — runs are logged in the agent substrate but unsurfaced (Phase 9 analytics).
- **Role-gating** on generate/approve/publish, and **async/background** generation → future.

## Inherited gotchas (still apply)
- **Connection cap:** stop `next dev` before `db:migrate` / DB-touching verify scripts (`ER_TOO_MANY_USER_CONNECTIONS`) — SOP-7.A.
- **MariaDB `json()`-as-longtext:** read paths must parse JSON columns (R-6.19); the scope draft I/O follows this.
- **Server-only imports** in scripts need `--conditions=react-server` — SOP-7.D and the ephemeral-script discipline.
