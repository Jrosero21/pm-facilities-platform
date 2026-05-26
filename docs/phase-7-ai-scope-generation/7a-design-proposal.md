# Phase 7 — 7a Design Proposal: AI-Assisted Scope Generation

**Status:** design-proposal-only · **no code / no SQL / no migration in this batch** · **revised after 7a review — six open questions now locked** · hold for final read.
**Batch rhythm:** mirrors 6a/6g — settle the surfaces, lock the decisions, *then* schema → data layer → agent → UI.
**Goal (roadmap §8 Phase 7, §2.5):** help operators turn a short problem description ("toilet clog") into a structured, reviewable technician scope, on the generic agent substrate built in Phase 6.

This document enumerates and settles 10 surfaces. Each is: **(a) question · (b) options · (c) recommendation + rationale · (d) Phase 6 retrofit consequence.** The six review-gate decisions are recorded under *Resolved decisions (7a review — locked)* and folded into their surfaces below.

---

## Inheritance from Phase 6 — reuse, do not redesign

Confirmed against the live repo (source-of-truth §5.2), these are inherited unchanged unless a surface says otherwise:

- **Agent runner** — `openRun → registerTool(auto-logs) → logDecision → closeRun`, `RunContext`, `AgentTool<I,O>` (`src/server/agents/runner.ts`). Generic; the inheritance vehicle (D-6.10, WF-6.6).
- **Substrate tables** — `agent_runs` / `agent_tool_calls` / `agent_decisions` (immutable audit, no soft-delete `status`, R-6.11). `agent_decisions.disposition` **already** includes `policy_blocked` — the documented Phase 7 policy seam (`agents-substrate.ts` comment). `agent_runs.prompt_version varchar(64)` is the prompt-provenance column, "implicitly `(agent_id, prompt_version)` today; Phase 7+ may add `prompt_id`."
- **Draft → review → publish gate** — agent writes only a draft at `pending_review`; a separate human-gated publish action is the *only* path to operational state (R-6.15, §2.9, WF-6.9).
- **Audit split** — agent actions land in the substrate; only operator actions hit `audit_logs` (R-6.12 / D-6.19). Audit-inside-vs-outside decided by **row count** (R-6.7).
- **`agent_id = {name}_v{major}`**, bumped only on output-semantic change (R-6.16); finer provenance per-run.
- **Registry + `testOnly`** — `AGENT_REGISTRY`, `listProductionAgents()` filters fixtures (R-6.20).
- **LLM integration** — `resolveRouting()` (mock > gateway > direct > mock), `generateObject` + zod, `recordedModel` provider-qualified, mock gate (D-6.18, R-6.25). Currently rewriter-local; see surface #6/#8.
- **Parent-before-child publish txn** — lock job → lock child, re-check under lock, write rows + audit inside (R-5.7 / R-6.21).
- **Pre-fill discipline** (R-5.11), semantic palettes (R-5.13/R-6.9), explicit-workflow-transitions (R-5.8), no-extra-param action pattern.
- **MariaDB JSON read-parse rule** — Drizzle `json()` is `longtext`; parse at the read boundary (R-6.19).
- **Literal-acceptance review at closeout** (R-6.23).
- **FK-prefix-under-64-chars convention** (R-6.22), enforced by `scripts/check-migration-identifiers.mjs` on `db:generate`.

Two naming corrections to the brief, surfaced from the live repo:
- The Phase 6 draft table is **`update_rewrite_drafts`**, not `communication_drafts`. All retrofit reasoning below uses the real name.
- There is **no literal `REWRITER_POLICY` constant**. The "policy" is the inline literal `policyCheck: "requires_review"` + `disposition: "queued_for_review"` in `update-rewriter/index.ts:62-64`. D-6.13/R-6.15 call this the *seam*; the retrofit is a **call-site refactor**, not a named-constant swap (re-graded in surface #8 per review-check B).

---

## Surface 1 — Draft substrate: shared `agent_drafts` vs specialized `scope_drafts`

**(a) Question.** D-6.16 shipped `update_rewrite_drafts` specialized and *explicitly deferred* the shared-vs-specialized call to Phase 7, with the scope generator as the second data point. With two data points in hand, decide: one polymorphic `agent_drafts` table for all agents, or a specialized scope-draft table?

**(b) Options & criteria.** Three poles, not two:

| Criterion | Rewriter draft (data point 1) | Scope draft (data point 2) | Verdict |
|---|---|---|---|
| **Content shape** | one `draft_content TEXT` blob | an **ordered list of N steps** | **divergent** |
| **Output cardinality** | 1 draft → 1 `client_update_logs` + 1 `communication_logs` | 1 draft → **N `job_scope_steps`** + job columns | **divergent** |
| **Publish FK target** | `published_communication_id → communication_logs` | explodes into `job_scope_steps` (N rows) + flat text on `jobs` — **no single child link** | **divergent** |
| **Edit semantics** | edit one text body (`edited_content`) | reorder / add / remove / rewrite steps | **divergent** |
| **Downstream joins** | join to comm spine & decision | join to job_scope_steps & decision | parallel but not shared |
| **Generic reuse already provided?** | — | — | **yes — by the substrate** |

- **Option A — monolithic shared `agent_drafts`.** Forces the divergence *into the columns*: a `draft_kind` discriminator, a JSON-or-text `content` column that means different things per kind, and a polymorphic `published_target` (a comm id for one kind, nothing coherent for the other since scope publishes to N rows). Every query gains `WHERE draft_kind = …`. Polymorphism cost is high; the only thing unified is two columns (`tenant_id`, `status`) that are trivial to repeat.
- **Option B — fully specialized `job_scope_drafts` (+ `job_scope_reviews`).** Mirrors `update_rewrite_drafts` / `update_rewrite_reviews` structurally but stays a distinct table with scope-shaped content and a scope-shaped publish path.
- **Option C — thin `agent_drafts` header + specialized payload tables via FK** (the middle option, addressed per review-check A). A skinny header (`id`, `tenant_id`, `agent_run_id`, `draft_kind`, `status`, timestamps) records *that a draft exists*; specialized payloads (`update_rewrite_draft_payloads`, `job_scope_draft_payloads`) hang off it via FK and hold the kind-specific content.

**Why Option C (the header table) is rejected.** Its lead problem is structural; the other three are practical consequences of that structural mistake:
- **It creates ambiguity about which layer is authoritative for "what drafts exist."** `agent_runs` filtered by `agent_id` (with its `ar_tenant_agent_created_idx`) is *already* the cross-agent enumeration layer, and the substrate is its deliberate home (D-6.10). A draft header doesn't merely *duplicate* that enumeration — it stands up a second, competing answer to "list all drafts," and every future query then has to know which one is canonical. That ambiguity is the root mistake; the three consequences below all follow from it.
- **Divergence isn't actually contained** — the header's `status` enum would still have to span both lifecycles, and the publish *target* (a single comm id vs a fan-out to N `job_scope_steps`) stays on the payload side. The header centralizes only the columns that were already cheap to repeat, while the expensive divergence stays exactly where Option B already puts it.
- **It forces churn on shipped Phase 6 code** — to be coherent, the header would have to absorb `update_rewrite_drafts`, splitting a working, tested table into header + payload. If we *don't* retrofit the rewriter, the header table only ever holds one kind (scope), defeating its purpose; if we *do*, we take on a migration risk surface #1 otherwise avoids entirely.
- **Every draft read/write becomes two-table** — for a workflow that almost always needs header + payload together, the join is pure overhead.

The header variant stands up a second enumeration layer competing with `agent_runs` while leaving the real divergence on the payload tables. Rejected deliberately.

**(c) Recommendation — Option B, fully specialized.** The generic, cross-agent layer the platform actually reuses is the **agent substrate** (`agent_runs`/`tool_calls`/`decisions`) — already generic, already inherited, already proven across `update_rewriter_v1` + `test_stub_v1`. D-6.10's architecture is explicit: *substrate generic, agent I/O specialized.* The two data points now **confirm** that draft I/O diverges structurally (text-blob→comm vs ordered-steps→job), so neither a monolithic `agent_drafts` (Option A) nor a header table (Option C) earns its complexity. **Specialization is the settled answer, not another deferral.**

Proposed shape (settled at schema time, not here):
- **`job_scope_drafts`** (`jsd_`) — one row per generation attempt: `id`, `tenant_id`, `job_id`, `agent_run_id` (all cascade, NN), `proposed_steps json` (the AI's ordered steps — **immutable**, the "what the AI produced" audit, parsed at read per R-6.19), `status enum(pending_review,approved,rejected,discarded,published)`, `published_at datetime` (set on publish — *not* a single child FK, since publish fans out to N rows), timestamps. Directly parallels `update_rewrite_drafts`.
- **`job_scope_reviews`** (`jsr_`) — `id`, `tenant_id`, `draft_id` (cascade, NN), `reviewer_user_id` (set null), `decision enum(approve,reject)`, `edited_steps json` (operator's edited list, NULL when unchanged — same information-carrying nullability as `update_rewrite_reviews.edited_content`), `review_notes text`, `reviewed_at`. Directly parallels `update_rewrite_reviews`. Effective published steps = `edited_steps ?? proposed_steps`.

**Draft-vs-published storage asymmetry (OQ #5 — locked).** Steps live as **JSON on the draft/review** (`proposed_steps`, `edited_steps`); the published steps live as a **relational child table** `job_scope_steps` (surface #5). Locked rationale: the **draft is working memory** — edited as a unit, never queried by step, written/read atomically — so JSON is the right fit and keeps the draft a clean 1:1 mirror of the rewriter's draft/review pair (JSON working memory → canonical substrate at publish). The **published table is the canonical record** that dispatch scope, the future vendor portal, and future analytics will query and reference by step, and per-step richness (notes, completion tracking, future photo attachments) can be added there **without reshaping the draft**.

**(d) Phase 6 retrofit consequence — NONE.** `update_rewrite_drafts` stays exactly as shipped: **no rename, no migration, no view, no split into header + payload.** The deferred D-6.16 resolves as "specialization confirmed." This is the cleanest possible retrofit outcome for surface #1 and removes the only open structural question Phase 6 left behind.

---

## Surface 2 — `ai_prompt_templates`: schema, versioning, runtime resolution

**(a) Question.** Replace Phase 6's in-code `prompt.ts` (`SYSTEM_PROMPT`, `PROMPT_VERSION="v1"`, `buildUserPrompt()`) with DB-stored, versioned prompts. Settle fields, version semantics, runtime fetch, caching, missing-row fallback, and mock-mode behavior.

**(b) Scoping model (OQ #3 — locked: do not deviate; use a defaults table).** Tenant-scoped rows keep `tenant_id` **NOT NULL**; global defaults live in a **separate non-tenant table** `ai_prompt_template_defaults`. The multi-tenancy invariant is foundational and not worth chipping at for two new tables' convenience: a nullable `tenant_id` would pollute every tenant-scoped query downstream with `AND (tenant_id = ? OR tenant_id IS NULL)` and weaken the audit story. A separate defaults table keeps the tenant table cleanly tenant-scoped and gives defaults a deliberate, queryable home.

**(c) Recommendation.**

`ai_prompt_templates` (`apt_`, tenant-scoped):

| Field | Type | Notes |
|---|---|---|
| `id` | uuid v7 PK | |
| `tenant_id` | varchar(36) **NN** | → tenants, cascade |
| `agent_id` | varchar(64) NN | e.g. `scope_generator_v1`, `update_rewriter_v1` |
| `variant` | varchar(64) NN default `default` | lets one agent hold multiple prompt variants without a new `agent_id` |
| `version` | int NN | monotonic per `(tenant_id, agent_id, variant)` |
| `status` | enum(`draft`,`active`,`archived`) | exactly one `active` per `(tenant_id, agent_id, variant)` |
| `system_prompt` | text NN | |
| `user_prompt_template` | text | Mustache `{{…}}` (same convention as `email_templates.body_template`); NULL ⇒ agent assembles its user prompt in code |
| `model_hint` | varchar(64) | optional provider-qualified model id |
| `temperature` | decimal(3,2) | optional |
| timestamps | | |

`ai_prompt_template_defaults` (`aptd_`, global, **no `tenant_id`**): same columns minus `tenant_id`, keyed `(agent_id, variant)` with one `active` row each.

- **Versioning semantics.** A behavior-affecting change to `system_prompt`/`user_prompt_template` = **new row, `version+1`, status `draft → active`**; the prior `active` row flips to `archived` in the same write. Cosmetic edits may overwrite in place (no bump) — same threshold philosophy as R-6.16, one level finer. `agent_runs.prompt_version` records the `version` that ran; this finally makes `prompt_version` real lineage.
- **Runtime resolution** — `resolveActivePrompt(tenantId, agentId, variant='default')`: `(tenant_id=T, agent_id=A, variant=V, status='active')` → fall through to `ai_prompt_template_defaults(agent_id=A, variant=V, status='active')`.
- **Caching.** In-process `Map` keyed by `(tenantId, agentId, variant)`, invalidated on write, short TTL backstop. No new infra.
- **Missing-row fallback — fail-closed.** No resolvable prompt ⇒ the run closes `agent_runs.status='failed'`, `error_message='NO_ACTIVE_PROMPT'`. **Not** a silent fall-back to a code constant: a stale code prompt would make `prompt_version` *lie* about what ran (provenance integrity over convenience). The seed guarantees rows exist; the migration deploy must run the seed.
- **Mock mode.** Under mock the LLM isn't called and the prompt body isn't needed. Still attempt to resolve to record `version`; if resolution fails *in mock*, record `prompt_version='mock'` and proceed (dev never hard-fails — D-6.18). Fail-closed applies to **real** runs only.

**(d) Phase 6 retrofit consequence.** Per the staged sequencing locked in OQ #1 (surface #8), the **scope generator's** default prompt is seeded into `ai_prompt_template_defaults` **first** and wired end-to-end; the **rewriter's** `prompt.ts` text is seeded as *its* default and `generateRewrite` switched to `resolveActivePrompt` **only after** the new agent is proven. Behavior intended identical (same text, "v1" → version 1), verified by the Phase 6 keeper run.

---

## Surface 3 — `agent_policies`: schema, scope, resolution

**(a) Question.** Replace the hardcoded `requires_review` inline. Settle scope keys, policy JSON shape, the constraint vocabulary, versioning, specificity ordering, no-match behavior, and how policies compose with prompts at runtime.

**(b) Scoping model (OQ #3 — locked: do not deviate; use a defaults table).** Tenant-scoped `agent_policies` keeps `tenant_id` **NOT NULL**; global defaults live in `agent_policy_defaults`. Same rationale as surface #2.

**(c) Recommendation.**

`agent_policies` (`ap_`, tenant-scoped):

| Field | Type | Notes |
|---|---|---|
| `id` | uuid v7 PK | |
| `tenant_id` | varchar(36) **NN** | → tenants, cascade |
| `client_id` | varchar(36) **nullable** | NULL = tenant-wide for the agent; set = per-client override (→ clients, cascade) |
| `agent_id` | varchar(64) NN | |
| `policy` | json NN | constraint document (below); parsed at read (R-6.19) |
| `version` | int NN | |
| `status` | enum(`draft`,`active`,`archived`) | one `active` per scope key |
| timestamps | | |

`agent_policy_defaults` (`apd_`, global, **no `tenant_id`**): `id`, `agent_id` NN, `policy json` NN, `version`, `status`, timestamps; one `active` per `agent_id`.

Policy JSON vocabulary (forward-declared; Phase 7 *exercises* only `requiresReview`):
```
{
  "requiresReview": true,            // §2.9 — the only field Phase 7 enforces
  "autoExecuteThreshold": null,      // schema-supported, NOT exercised (out of scope)
  "forbiddenPhrases": [],            // future: post-generation guardrail
  "tone": null,                      // future: compose with prompt
  "lengthCaps": { "maxSteps": null },
  "requiredFields": [],              // future: per-client justification fields
  "escalationTriggers": []           // future
}
```

- **Resolution ladder (OQ #3 — locked)** — `resolveAgentPolicy(tenantId, agentId, clientId?)`, most-specific match wins:
  1. `agent_policies(tenant_id=T, client_id=C, agent_id=A)` — per-client-per-agent
  2. `agent_policies(tenant_id=T, client_id=NULL, agent_id=A)` — per-tenant-per-agent
  3. `agent_policy_defaults(agent_id=A)` — global default
- **No-match behavior — fail-SAFE to review.** If *no* row resolves, the effective policy is `{ requiresReview: true }`. Absence of policy must **never** mean auto-execute — this preserves §2.9 even with empty tables, and is the inverse of the prompt's fail-closed (a missing prompt blocks; a missing policy defaults to the *safest* posture).
- **Composition with prompts.** Orthogonal axes resolved independently per run: the **prompt** shapes *what* the agent generates; the **policy** governs the *disposition* (`queued_for_review` vs `auto_executed` vs `policy_blocked`) and post-hoc constraints. Pipeline: `resolveActivePrompt` → generate → `resolveAgentPolicy` → set `agent_decisions.policy_check` + `disposition`. For Phase 7 the resolved policy is always `requiresReview:true` ⇒ `queued_for_review`, exactly Phase 6's behavior. `policy_blocked` becomes structurally reachable but is **not emitted** in Phase 7.
- **Versioning.** Same `draft→active→archived` bump as prompts.

**(d) Phase 6 retrofit consequence.** Per OQ #1 staging (surface #8): the scope generator's default policy is seeded into `agent_policy_defaults` first; the rewriter's inline `requires_review` / `queued_for_review` literal is replaced with `resolveAgentPolicy('update_rewriter_v1', clientId)` **only after** the new agent is proven. Effective behavior identical (always review). Re-graded for risk in surface #8.

---

## Surface 4 — `scope_templates` and `scope_template_steps`: purpose and shape

**(a) Question.** Roadmap §9 lists these as Phase 7 core tables. Decide their actual role and whether they're acceptance-blocking for Phase 7 or deferrable.

**(b) Analysis.** The **primary output** the agent populates is `job_scope_steps` (surface #5), *not* templates. The §2.5 worked example ("toilet clog" → 9 steps) generates from the problem description **with no template**, so templates are **not** required by any Phase 7 acceptance line (§8 Phase 7: generate / edit / approve / store / log / not-final).

**(c) Recommendation — empty schema only (OQ #2 — locked).** Ship `scope_templates` and `scope_template_steps` as **schema only**, so the FK target exists for future seed work. **No authoring UI, no seed data, and no LLM template-grounding logic in Phase 7.** Locked rationale: the core Phase 7 loop is *problem description → AI → draft → review → publish*; AC-1…AC-6 (roadmap §8 verbatim) do not require templates. Template grounding is a quality improvement to evaluate **empirically after Phase 7 ships**, not pre-decided into scope. This honors §9's table inventory without committing to a feature path that would balloon the phase — the same "create now, manage later" precedent as D-6.17 (`vendor_update_logs`/`portal_update_queue` shipped schema-only).

Proposed shape (mirrors `job_scope_steps` so a future template explodes 1:1 into it, and so a future few-shot example is structurally identical to the output). Per OQ #3, `tenant_id` is **NOT NULL** (no platform-library-via-NULL); if a platform-shared template library is ever wanted, it follows the defaults-table pattern, decided then.
- **`scope_templates`** (`st_`) — `id`, `tenant_id` (**NN**, cascade), `name`, `trade_id → trades` (set null; applicable trade for future matching), `description`, `status`, timestamps.
- **`scope_template_steps`** (`sts_`) — `id`, `tenant_id`, `template_id` (cascade, NN), `step_order int NN`, `instruction text NN`, `category` (nullable), `expects_photo boolean`, timestamps.

**(d) Phase 6 retrofit consequence — NONE.** New tables, no touch to Phase 6.

---

## Surface 5 — `job_scope_steps`: schema and publish target

**(a) Question.** The final, durable output substrate (roadmap §9 Jobs domain). Settle fields, ordering, relationship to the Phase 4 job columns, and the write path.

**(b)/(c) Recommendation.**

`job_scope_steps` (`jss_`):

| Field | Type | Notes |
|---|---|---|
| `id` | uuid v7 PK | |
| `tenant_id` | varchar(36) NN | cascade |
| `job_id` | varchar(36) NN | cascade |
| `step_order` | int NN | display/execution order |
| `instruction` | text NN | the step text |
| `category` | varchar(32) | optional (assess / perform / cleanup / verify / document) |
| `expects_photo` | boolean | optional photo-evidence hint |
| `source` | enum(`ai_generated`,`template`,`manual`,`edited`) | per-step provenance |
| `source_draft_id` | varchar(36) | → `job_scope_drafts` (set null) — which generation produced it |
| `status` | enum (soft-delete) | active/inactive (it *is* operational state, unlike the immutable substrate) |
| timestamps | | |

Index `jss_tenant_job_order_idx(tenant_id, job_id, step_order)`.

**Status vocabulary (OQ #4 — locked: mirror the rewriter where semantics are parallel; diverge only with documented reason).** The rewriter's draft status vocabulary, stated explicitly for the mapping:

> `update_rewrite_drafts.status` = `pending_review → approved → published` (terminal); `pending_review → rejected` (terminal); `pending_review → discarded` (terminal); default `pending_review`.

Mapping to the scope generator:

| Rewriter `update_rewrite_drafts.status` | Scope `job_scope_drafts.status` | Relationship |
|---|---|---|
| `pending_review` | `pending_review` | **identical** |
| `approved` | `approved` | **identical** |
| `rejected` | `rejected` | **identical** |
| `discarded` | `discarded` | **identical** |
| `published` | `published` | **identical** |

So `job_scope_drafts.status` **mirrors the rewriter draft vocabulary 1:1** — a future contributor reading either agent's draft lifecycle sees the same shape (the OQ #4 priority: cross-agent recognizability over per-agent perfection).

The **job-level** rollup `jobs.scope_generation_status` is the one place semantics genuinely diverge, and the divergence is documented here (to be repeated in `02-decisions.md` at build): it is a **per-job rollup**, not a draft lifecycle, and the rewriter has **no job-column analog** (its output rolls into `communication_logs`, never a job status column). Proposed values reuse the parallel tokens where they apply and drop the rest:

| `jobs.scope_generation_status` | Meaning | vs draft vocab |
|---|---|---|
| `not_started` | no draft has been generated (Phase 4 default) | rollup-only |
| `pending_review` | a draft exists awaiting review, none approved yet | **reused token** |
| `approved` | an approved scope is stored on the job (post-publish) | **reused token** |

`rejected`/`discarded`/`published` are **not** job-rollup states — they are per-draft terminals (a job with a rejected draft is back to `not_started`/`pending_review` depending on its other drafts, since re-running creates new drafts per R-6.18). Divergence is therefore deliberate and minimal.

**Relationship to the Phase 4 job columns** — steps are the structured truth; the job columns are denormalized flat renders for backward-compat and downstream consumers:
- `jobs.generated_scope_of_work TEXT` ← flattened AI draft (provenance).
- `jobs.approved_scope_of_work TEXT` ← flattened *approved* steps. **Phase 5 already lets dispatch use `approved_scope_of_work` as dispatch scope** — writing the flat render keeps dispatch working with zero Phase 5 change.
- `jobs.scope_generation_status varchar(32)` — Phase 4 seeded only `not_started` and left the rest to Phase 7 (D-4.2); the three-value vocabulary above fills it.

**Write path — the agent NEVER writes `job_scope_steps`.** Per §2.9 + R-6.15 the agent has no path to operational state; it writes **only** `job_scope_drafts` (proposed steps) at `pending_review`. `job_scope_steps` is operational job data, written **only** by the human-gated `publishScopeDraft` action — exactly mirroring how `publishRewriteDraft` is the only writer of `client_update_logs` (WF-6.9). This generalizes R-6.15 to a second agent.

**(d) Phase 6 retrofit consequence — NONE** for Phase 6 tables. A small Phase 7 *read-layer addition*: `getJobDetail`'s `JobDetail` type exposes `scopeOfWork` + `approvedScopeOfWork` but not `generatedScopeOfWork`; Phase 7 adds the generated field + a `listScopeStepsForJob` reader (a Phase 7 addition, not a Phase 6 change).

---

## Surface 6 — Scope generator agent surface

**(a) Question.** `agent_id`, tool surface, decision surface, and trigger.

**(b)/(c) Recommendation.**

- **`agent_id = scope_generator_v1`** (R-6.16). Registry entry: `testOnly:false`, `inputSourceTypes:['job']`, `outputType:'job_scope_draft'`.
- **Tool surface (read-broad, write-narrow — D-6.12), narrowed per OQ #6 (locked: defer historical grounding).** The scope generator reads **only current-job context** — problem description, client, client location, primary trade, priority — **all of which `getJobDetail` already returns** (it joins client/location/trade/priority/status names). So:
  - Reads: **`getJobDetail`** (the single read tool; reused as-is from the rewriter's tool set, `update-rewriter/tools.ts`).
  - Write (the ONE write): `createScopeDraft` → `job_scope_drafts` + `proposed_steps` at `pending_review`. **Never** writes `job_scope_steps` / job columns.
  - **Explicitly NOT read in Phase 7** (locked): historical scopes from other jobs (`listHistoricalScopes`), client billing/preferences context, per-location access notes/hours, and scope templates (`getScopeTemplate`). No cross-job retrieval, no cross-tenant learning, no embedding/RAG. Rationale: it's a quality improvement, not a core requirement; tenant-isolation for cross-job grounding is non-trivial; and it overlaps substantively with Phase 16's chatbot/RAG work, so building it now risks doing it twice. AC-1…AC-6 are satisfied without it.
- **Decision surface (`agent_decisions`):** one `scope_proposal` decision per run — `proposed_action="Draft a scope of work from the problem description"`, `reasoning=<LLM rationale>`, `confidence`, `policy_check=<from resolveAgentPolicy>`, `disposition='queued_for_review'`, `metadata={stepCount, assumptions}`.
- **Trigger — manual operator action ONLY in Phase 7** (`trigger_source='operator_manual'`). Auto-on-job-creation is out (surface #10): it would need both policy gating and intake-review semantics (§2.6/§2.9) outside Phase 7's scope.
- **Pipeline (mirrors WF-6.7):** `openRun` → `getJobDetail` (auto-logged) → `resolveActivePrompt` → `generateScope` (LLM `generateObject`, structured-steps schema) → `logDecision` → `createScopeDraft` → `closeRun`. Same fixed-pipeline posture (R-6.14), same routing + mock gate, errors close the run `failed` and surface inline (R-6.25).
- **LLM output schema (zod):** `{ steps: [{ order, instruction, category?, expectsPhoto? }], assumptions: string[], confidence: enum, rationale: string }`.

**(d) Phase 6 retrofit consequence.** To avoid copy-pasting LLM routing, **extract `resolveRouting` + mock + `recordedModel`** from `update-rewriter/llm.ts` into a shared module (e.g. `src/server/agents/llm-routing.ts`) parameterized by a mock-override env + model default. The rewriter keeps `REWRITER_MOCK`/`REWRITER_MODEL`; scope gen gets `SCOPE_GEN_MOCK`/`SCOPE_GEN_MODEL` (falling back to a generic `AGENT_MOCK`). Low-risk refactor; in-scope (surface #8).

---

## Surface 7 — Operator UX: trigger, review/edit, publish

**(a) Question.** Where generation is kicked off, how the draft is reviewed/edited, edit affordances, what publish writes, and whether partial-publish is allowed.

**(b)/(c) Recommendation.**

- **Trigger location.** A new **"Scope of work"** section on the job detail page, after *Problem description* / *Initial scope*, **before Dispatch** (approved scope feeds dispatch). A **"Generate scope"** button (sibling pattern to `DraftClientUpdateButton`). With no problem description, the button is disabled with an explanatory line.
- **Draft presentation — step-by-step.** Render the proposed ordered steps (each editable), plus the decision's `confidence` / `assumptions` / `rationale` (mirrors how `UpdateDraftsSection` surfaces confidence/rationale).
- **Edit affordances.** Reorder, add, remove, rewrite individual steps. The operator's edited list is captured on `job_scope_reviews.edited_steps` (NULL when unchanged) — preserving "AI-proposed vs operator-approved" (R-6.x / D-6.15 generalized).
- **Review actions.** approve / reject / discard — parity with the rewriter (WF-6.8). Re-running generation creates a **new** draft (R-6.18 parity; no block).
- **Publish (`publishScopeDraft`) — the only draft→`job_scope_steps` path.** Multi-row txn, parent-before-child (R-5.7 / R-6.21): lock job → lock draft (re-check `approved`) → INSERT N `job_scope_steps` from `edited_steps ?? proposed_steps` → UPDATE `jobs.approved_scope_of_work` (flat) + `jobs.generated_scope_of_work` (flat AI render) + `jobs.scope_generation_status='approved'` → UPDATE draft `status='published'`, set `published_at` → `audit_logs` **inside** the txn (`scope_draft.published`). Operator actions hit `audit_logs`; the agent's generation does not (R-6.12).
- **Partial-publish — NO (Phase 7).** Publish is all-approved-steps. The operator curates by *removing* unwanted steps during edit. Matches the rewriter (publish the whole draft). Listed in out-of-scope.

**(d) Phase 6 retrofit consequence — NONE** (new section, new components).

---

## Surface 8 — Phase 6 retrofit scope

Exact inventory of what changes in already-shipped Phase 6 code/data, with the **mandatory staged sequencing locked in OQ #1** and the risk re-graded per review-check B.

**OQ #1 (locked) — retrofit the rewriter in Phase 7, staged, not deferred to 7.x.** Mandatory sequence:

1. **Build** `ai_prompt_templates` + `ai_prompt_template_defaults` + `agent_policies` + `agent_policy_defaults` schema. **Seed the scope generator's prompt and policy only.**
2. **Wire the scope generator** to read both end-to-end. **Verify against the scope generator's own acceptance criteria** (AC-7/AC-8 below).
3. **Then migrate the rewriter:** drop the inline literal in `update-rewriter/index.ts`, seed the rewriter's prompt into `ai_prompt_template_defaults`, seed its policy into `agent_policy_defaults`, switch `generateRewrite` to `resolveActivePrompt`, and **re-verify against the Phase 6 keeper run** (`update_rewriter_v1`, Sonnet 4.6, 679/232 tokens — `08-db-changes.md`).

Locked rationale: §5.4's "do not build future-phase features early" prohibits *forward* scope creep, **not** retrofitting *past-phase* code onto a Phase 7 abstraction it conceptually belongs in — a different category. Every later phase that adds AI surface area (Phase 8 anomaly flagging, Phase 11 client-portal updates, Phase 16 chatbot) will copy whichever pattern the rewriter uses when they go look; leaving inline literals seeds inconsistency into later phases. Pay it once, now. The **staged** sequence keeps the rewriter on its known-good inline path until the new abstraction is proven on the new agent — so step 3 can cleanly defer to a 7.x follow-up **if it surfaces unexpected complexity**, without compromising the new agent's ship.

**Aborting step 3 is a documented deferral, not a silent escape hatch.** If step 3 is aborted, the Phase 7 closeout (`11-closeout.md` + `10-known-limitations.md`) must record, at minimum: **(a)** what was found in the rewriter migration that justified aborting; **(b)** the rewriter's left-state (presumably still on the inline `index.ts` literals, prompt still in `prompt.ts`); and **(c)** exactly what defers to the 7.x follow-up (which seed rows, which call-site swaps). Absent that paper trail, step 3 is not "deferred" — it is *incomplete*, and the phase does not close.

| # | Retrofit | Decision | Risk (re-graded, check B) | Re-verify |
|---|---|---|---|---|
| 1 | rewriter prompt → `ai_prompt_templates`/`_defaults` (step 3) | In-scope, staged | **Low.** Closest to an import/call swap inside `update-rewriter/llm.ts` — replace the `SYSTEM_PROMPT`/`buildUserPrompt` import with a `resolveActivePrompt` call; prompt text seeded verbatim. | keeper run |
| 2 | rewriter inline policy → `agent_policies`/`_defaults` (step 3) | In-scope, staged | **Low, but a call-site logic edit — not an import swap.** There is no named constant: the change rips the inline `policyCheck:"requires_review"` / `disposition:"queued_for_review"` literal out of the `logDecision(...)` call in `index.ts:62-64` and substitutes `resolveAgentPolicy`-derived values. Single call site, behavior held constant (always `requiresReview` → `queued_for_review`); the risk is in editing the decision-logging path, not its blast radius. The staged sequence (prove on scope gen first; this is the abortable last step) is what keeps it low. | keeper run |
| 3 | extract shared LLM routing → `agents/llm-routing.ts` | In-scope | **Low** — pure refactor; rewriter keeps its `REWRITER_*` knobs. | existing rewriter path |
| 4 | `update_rewrite_drafts` rename/migrate/view/split | **NOT retrofitted** — kept fully specialized (surface #1) | None | n/a |
| 5 | `getJobDetail`/`JobDetail` gains `generatedScopeOfWork` + new `listScopeStepsForJob` reader | In-scope (Phase 7 *addition*) | Low | n/a |

**The Low grade on retrofit #2 is conditional on the step-3 re-verification happening in full.** It holds *only if* the keeper-run re-verification is actually performed — the rewriter's output diffed against the Phase 6 keeper run (`update_rewriter_v1`, Sonnet 4.6, 679/232 tokens). A future phase that skips or abbreviates that re-verification **voids the Low grade**: the change is a call-site edit on the agent's decision-logging path, and "behavior unchanged" is an assertion that only the keeper-run check substantiates. The grade is on *the change executed as specified*, not on the change in the abstract.

**Anticipated R-7.x rules** (finalized at closeout per the R-6.x style, not here):
- *Specialized-draft-per-agent confirmed; the generic layer is the substrate, not a draft header or a shared `agent_drafts`* (resolves D-6.16; rejects the header variant).
- *Tenant config tables stay `tenant_id`-NOT-NULL; global defaults live in sibling `*_defaults` tables; the resolver falls through tenant → defaults* (preserves the multi-tenancy invariant).
- *DB-stored versioned prompts; real runs fail-closed on a missing prompt, mock runs degrade to `prompt_version='mock'`.*
- *`agent_policies` ladder (client→tenant→defaults); no-match fails **safe** to `requiresReview:true`.*
- *Agents never write `job_scope_steps`; `publishScopeDraft` is the only path* (generalizes R-6.15 to a 2nd agent).
- *Publish dual-writes: explode draft→`job_scope_steps` **and** flatten to the `jobs` text columns, inside one parent-before-child txn.*
- *Draft = JSON working memory; published = relational canonical record* (generalizes D-6.15/D-6.16).
- *`job_scope_drafts.status` mirrors `update_rewrite_drafts.status` 1:1; `jobs.scope_generation_status` is a documented rollup divergence.*
- Edit to the R-6.16 note: `prompt_version` is now lineage into `ai_prompt_templates`.

---

## Surface 9 — Literal acceptance criteria for Phase 7

Written now as testable statements (R-6.23), graded literally at closeout. **AC-1…6 are the roadmap §8 Phase 7 acceptance lines verbatim;** AC-7+ cover the new substrate and the Phase 6 retrofits.

1. **AC-1** Operator can generate a draft scope from a job's problem description (manual trigger on the job page).
2. **AC-2** Operator can edit the generated scope (reorder / add / remove / rewrite steps).
3. **AC-3** Operator can approve the scope.
4. **AC-4** The approved scope is stored on the job (structured `job_scope_steps` rows **and** the flattened `jobs.approved_scope_of_work`).
5. **AC-5** Generation is logged (one `agent_runs` row + `agent_tool_calls` for each read/write + one `scope_proposal` `agent_decisions` row).
6. **AC-6** AI output is not treated as final until reviewed — the agent writes only a `pending_review` draft and has no path to `job_scope_steps`/job columns.
7. **AC-7** A run resolves its prompt `(tenant_id, agent_id, variant)` → `ai_prompt_template_defaults(agent_id, variant)` (recorded in `agent_runs.prompt_version`); a real run with no resolvable prompt fails-closed (`status='failed'`, `NO_ACTIVE_PROMPT`).
8. **AC-8** A run resolves its policy `(tenant_id, client_id, agent_id)` → `(tenant_id, agent_id)` → `agent_policy_defaults(agent_id)`; with no resolvable row the effective policy is `requiresReview:true` and the disposition is `queued_for_review`.
9. **AC-9** `publishScopeDraft` is the only writer of `job_scope_steps`; it runs as a parent-before-child txn writing the steps + the job text columns + `scope_generation_status='approved'` + the `scope_draft.published` audit row, and refuses any draft not `approved`.
10. **AC-10** Re-running generation on a job produces a new `pending_review` draft without blocking (R-6.18 parity).
11. **AC-11** `scope_templates` and `scope_template_steps` exist as **empty schema** (FK target for future seed work); **no Phase 7 code path reads or writes them** (OQ #2).
12. **AC-12 (retrofit)** After step 3, `update_rewriter_v1` resolves its prompt from `ai_prompt_templates`/`_defaults` and its policy from `agent_policies`/`_defaults`, with output behavior unchanged from the Phase 6 keeper run (verified). If step 3 is deferred to 7.x, this is recorded as a carry-forward, not a failure.
13. **AC-13 (retrofit)** `update_rewrite_drafts` is unchanged — no rename/migration/view/split.
14. **AC-14** Every JSON column added (`job_scope_drafts.proposed_steps`, `job_scope_reviews.edited_steps`, `agent_policies.policy`, `agent_policy_defaults.policy`, `agent_decisions.metadata`) is parsed at the read boundary (R-6.19) — no string-rendered-as-JSON reaches the UI.

---

## Surface 10 — Out-of-scope for Phase 7

Explicitly deferred (some schema-supported but not exercised):

- **Full chatbot / conversational scope** (Phase 16).
- **Autonomous dispatch** of any kind.
- **Automatic AI runs without operator trigger** — no auto-generate on job creation; manual trigger only.
- **Auto-publish within policy** — agents remain draft-and-review (§2.9); `autoExecuteThreshold` / `auto_executed` / `policy_blocked` are schema-supported but **not emitted** in Phase 7.
- **AI-drafted status updates beyond the existing Phase 6 rewriter** — Phase 7 adds scope generation only; the rewriter is migrated, not extended.
- **Multi-vendor scope variations** — one scope per job; per-assigned-vendor variants deferred.
- **Scope-template use of any kind** (OQ #2) — no authoring/management UI, **no seed data**, no apply-template path, and **no LLM template-grounding/few-shot logic**. Tables ship as empty schema only.
- **Historical-scope grounding / cross-job retrieval / cross-tenant learning / embeddings / RAG** (OQ #6) — overlaps Phase 16; the generator reads only current-job context.
- **Prompt-authoring UI** and **policy-authoring UI** — rows are seeded; no admin editors in Phase 7.
- **Partial-publish** of a scope draft (surface #7).
- **LLM-native autonomous tool selection** — fixed pipeline retained (R-6.14); LLM-native tool-use stays a Phase 8 concern.
- **Cost/usage analytics** over `agent_runs` (Phase 9) and a **failed-run retry queue** (Phase 13).
- **Scope generation for non-manual job sources' auto-intake** (Phase 12/13).

---

## Resolved decisions (7a review — locked)

The six open questions are now locked and folded into the surfaces above. Recorded here for the durable decision trail (to be carried into `02-decisions.md` at build).

| OQ | Decision | Lives in |
|---|---|---|
| **#1 Retrofit blast radius** | Retrofit the rewriter in Phase 7, **staged** (build+seed scope-gen → wire+verify scope-gen → migrate+re-verify rewriter), abortable to 7.x at step 3 only. | Surface #8 |
| **#2 `scope_templates` depth** | **Empty schema only** — no UI, no seed data, no grounding logic. | Surface #4, #10 |
| **#3 Nullable `tenant_id`** | **Do not deviate.** Tenant tables stay NOT-NULL; defaults live in `ai_prompt_template_defaults` / `agent_policy_defaults`; resolver falls through. | Surfaces #2, #3, #4 |
| **#4 Status vocabulary** | **Mirror the rewriter** — `job_scope_drafts.status` is 1:1; `jobs.scope_generation_status` diverges as a documented rollup. | Surface #5 |
| **#5 Draft step storage** | **JSON for draft, child table for published** — working memory vs canonical record. | Surfaces #1, #5 |
| **#6 Historical grounding** | **Defer** — current-job context only; no cross-job/cross-tenant/RAG. | Surface #6, #10 |

Two review checks addressed:
- **Check A** — the thin `agent_drafts` header + specialized-payload variant (Option C) is now explicitly considered and rejected in Surface #1 before D-6.16 closes.
- **Check B** — the rewriter **policy** retrofit is re-graded in Surface #8 as a **call-site logic edit** (no named constant; the inline `requires_review`/`queued_for_review` literal in `index.ts:62-64`), distinct from the **prompt** retrofit (closer to an import swap). Both remain **Low** risk, graded against the actual change shape, with keeper-run re-verification as OQ #1 step 3.

---

## Closing summary

**(a) Substrate decision (surface #1).** **Fully specialized, not shared and not a header table.** Ship `job_scope_drafts` + `job_scope_reviews` (parallel to `update_rewrite_drafts`/`update_rewrite_reviews`, with `proposed_steps`/`edited_steps` JSON and a fan-out publish into `job_scope_steps`). The generic reused layer is the already-built agent substrate; the monolithic `agent_drafts` (Option A) and the thin-header-plus-payload variant (Option C) are both rejected as cost-without-benefit. Settles D-6.16. `update_rewrite_drafts` is left exactly as-is.

**(b) Phase 6 retrofit scope (surface #8).** Three in-scope, all Low-risk, **executed in the mandatory OQ #1 staged order** (scope-gen first, rewriter last and abortable to 7.x): (1) migrate the rewriter prompt into `ai_prompt_templates`/`_defaults`; (2) migrate the rewriter's inline policy into `agent_policies`/`_defaults` (a call-site edit, re-graded per check B); (3) extract shared LLM routing. The rewriter draft table is **not** retrofitted. Net rewriter behavior intended identical, re-verified against the Phase 6 keeper run.

**(c) Open questions — none remain.** All six are locked (table above) and folded into their surfaces; both review checks (A: header-variant rejection; B: retrofit-risk re-grade) are addressed.

**(d) Acceptance-criteria sanity pass.** AC-1…AC-14 were each walked against the locked decisions — including the OQ #2 empty-template lock, the OQ #6 narrowed tool surface (single `getJobDetail` read), and the OQ #3 defaults-table resolution. **All fourteen still map cleanly to what the proposal proposes to build; no consequence edits were required in this pass.** The §8-verbatim AC-1…AC-6 are unaffected by the locks (AC-5's "tool call per read/write" still holds under the narrowed two-tool surface). The locked AC set is therefore the 14 statements in Surface #9 — unchanged from the prior revision except AC-11, rewritten under OQ #2 last round.

**Locked. Proceeding to commit; then holding for the schema-gate batch.**
